#!/usr/bin/env bash
# Where: scripts/scheduled-codex/run-container.sh
# What: Builds the existing devcontainer image, runs one unattended `codex exec`, and reports the result.
# Why: launchd should trigger one self-contained run that leaves behind local artifacts and can notify Telegram.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SCHEDULE_ROOT="$WORKSPACE_ROOT/.automation/scheduled-codex"
STATE_ROOT="$SCHEDULE_ROOT/state"
LOG_ROOT="$SCHEDULE_ROOT/logs"
ENV_FILE="$SCHEDULE_ROOT/config.env"
PROMPT_FILE="$SCHEDULE_ROOT/prompt.md"
CODEX_HOME_HOST="$STATE_ROOT/codex-home"
IMAGE_TAG="${SCHEDULED_CODEX_IMAGE_TAG:-speech-to-text-scheduled-codex:local}"
GH_TOKEN_VALUE=""
TAKOPI_PROJECT_ALIAS_VALUE="${TAKOPI_PROJECT_ALIAS:-$(basename "$WORKSPACE_ROOT")}"
TELEGRAM_BOT_TOKEN_VALUE="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-}"
SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE="${SCHEDULED_CODEX_LOG_RETENTION_DAYS:-2}"
SCHEDULED_CODEX_GIT_USER_NAME_VALUE="${SCHEDULED_CODEX_GIT_USER_NAME:-}"
SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE="${SCHEDULED_CODEX_GIT_USER_EMAIL:-}"
SCHEDULED_CODEX_GIT_IDENTITY_OVERRIDE_REQUESTED=0
RUN_TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RUN_STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
RUN_MESSAGE_OUTPUT_BASENAME="message-$RUN_STAMP.txt"
RUN_MESSAGE_OUTPUT_PATH="$LOG_ROOT/$RUN_MESSAGE_OUTPUT_BASENAME"
LAST_MESSAGE_OUTPUT_PATH="$LOG_ROOT/last-message.txt"
RUN_LOG_PATH="$LOG_ROOT/run-$RUN_STAMP.log"
LAST_RUN_LOG_PATH="$LOG_ROOT/last-run.log"
REPORT_PATH="$LOG_ROOT/run-$RUN_STAMP-report.txt"
LAST_REPORT_PATH="$LOG_ROOT/last-report.txt"
run_exit_code=1
run_status="failure"
telegram_delivery_failed=0
telegram_message_thread_id=""

read_env_value() {
  local key="$1"
  local file="$2"

  [[ -f "$file" ]] || return 1

  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == "$key="* ]] || continue
    local value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s\n' "$value"
    return 0
  done < "$file"

  return 1
}

resolve_github_token() {
  local token=""

  if ! command -v gh >/dev/null 2>&1; then
    echo "missing GitHub CLI: install gh and authenticate it on the host before running the scheduler" >&2
    return 1
  fi

  token="$(gh auth token 2>/dev/null || true)"
  if [[ -z "$token" ]]; then
    echo "missing GitHub auth token: run 'gh auth login' on the host; the scheduler derives GitHub auth at runtime via 'gh auth token'" >&2
    return 1
  fi

  printf '%s\n' "$token"
}

has_env_key() {
  local key="$1"
  local file="$2"

  [[ -f "$file" ]] || return 1

  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == "$key="* ]] || continue
    return 0
  done < "$file"

  return 1
}

trim_to_limit() {
  local value="$1"
  local limit="$2"

  if ((${#value} <= limit)); then
    printf '%s' "$value"
    return 0
  fi

  printf '%s...(truncated)' "${value:0:$((limit - 14))}"
}

build_telegram_topic_title() {
  local phase="${1:-run}"
  local timestamp
  local raw_title

  timestamp="$(date -u '+%Y-%m-%d %H:%M UTC')"
  raw_title="$TAKOPI_PROJECT_ALIAS_VALUE $phase $timestamp"

  if ((${#raw_title} <= 128)); then
    printf '%s\n' "$raw_title"
    return 0
  fi

  printf '%s\n' "${raw_title:0:128}"
}

call_telegram_method() {
  local method="$1"
  shift
  local response

  response="$(
    curl \
      --silent \
      --show-error \
      --fail \
      --request POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_VALUE}/${method}" \
      "$@"
  )"

  if [[ "$response" != *'"ok":true'* ]]; then
    echo "Telegram API returned an unexpected response: $response" >&2
    return 1
  fi

  printf '%s\n' "$response"
}

create_telegram_topic() {
  local topic_title="$1"
  local response
  local message_thread_id

  response="$(
    call_telegram_method \
      createForumTopic \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID_VALUE}" \
      --data-urlencode "name=${topic_title}"
  )" || return 1

  message_thread_id="$(
    printf '%s\n' "$response" | sed -n 's/.*"message_thread_id":\([0-9][0-9]*\).*/\1/p' | head -n 1
  )"

  if [[ -z "$message_thread_id" ]]; then
    echo "Telegram API response did not include a message_thread_id: $response" >&2
    return 1
  fi

  printf '%s\n' "$message_thread_id"
}

send_telegram_report() {
  local report_text="$1"
  local message_thread_id="$2"

  call_telegram_method \
    sendMessage \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID_VALUE}" \
    --data-urlencode "message_thread_id=${message_thread_id}" \
    --data-urlencode "text=${report_text}" \
    >/dev/null
}

build_start_notification() {
  cat <<EOF
Scheduled Codex process started
Project: $TAKOPI_PROJECT_ALIAS_VALUE
Timestamp (UTC): $RUN_TIMESTAMP
Prompt: $PROMPT_FILE
EOF
}

prune_old_run_artifacts() {
  local retention_days="$1"

  if [[ "$retention_days" == "0" ]]; then
    return 0
  fi

  find "$LOG_ROOT" \
    -type f \
    \( \
      -name 'run-*.log' -o \
      -name 'run-*-report.txt' -o \
      -name 'message-*.txt' \
    \) \
    -mtime +"$retention_days" \
    -delete
}

write_report() {
  local run_status="$1"
  local run_exit_code="$2"

  cat > "$REPORT_PATH" <<EOF
Scheduled Codex report
Project: $TAKOPI_PROJECT_ALIAS_VALUE
Timestamp (UTC): $RUN_TIMESTAMP
Status: $run_status
Exit code: $run_exit_code
Prompt: $PROMPT_FILE
Message output: $RUN_MESSAGE_OUTPUT_PATH

Codex output:
$(cat "$RUN_MESSAGE_OUTPUT_PATH" 2>/dev/null || printf '(none)\n')
EOF

  cp "$REPORT_PATH" "$LAST_REPORT_PATH"
}

mkdir -p "$STATE_ROOT" "$LOG_ROOT" "$CODEX_HOME_HOST"

if [[ -n "${SCHEDULED_CODEX_GIT_USER_NAME+x}" || -n "${SCHEDULED_CODEX_GIT_USER_EMAIL+x}" ]]; then
  SCHEDULED_CODEX_GIT_IDENTITY_OVERRIDE_REQUESTED=1
fi

if [[ -f "$ENV_FILE" ]]; then
  if [[ -z "${SCHEDULED_CODEX_IMAGE_TAG:-}" ]]; then
    IMAGE_TAG="$(read_env_value SCHEDULED_CODEX_IMAGE_TAG "$ENV_FILE" || printf '%s' "$IMAGE_TAG")"
  fi

  if [[ -z "${SCHEDULED_CODEX_GIT_USER_NAME:-}" ]]; then
    SCHEDULED_CODEX_GIT_USER_NAME_VALUE="$(
      read_env_value SCHEDULED_CODEX_GIT_USER_NAME "$ENV_FILE" || printf '%s' "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE"
    )"
  fi

  if [[ -z "${SCHEDULED_CODEX_GIT_USER_EMAIL:-}" ]]; then
    SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE="$(
      read_env_value SCHEDULED_CODEX_GIT_USER_EMAIL "$ENV_FILE" || printf '%s' "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE"
    )"
  fi

  if [[ -z "${TAKOPI_PROJECT_ALIAS:-}" ]]; then
    TAKOPI_PROJECT_ALIAS_VALUE="$(
      read_env_value TAKOPI_PROJECT_ALIAS "$ENV_FILE" || printf '%s' "$TAKOPI_PROJECT_ALIAS_VALUE"
    )"
  fi

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
    TELEGRAM_BOT_TOKEN_VALUE="$(
      read_env_value TELEGRAM_BOT_TOKEN "$ENV_FILE" || printf '%s' "$TELEGRAM_BOT_TOKEN_VALUE"
    )"
  fi

  if [[ -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    TELEGRAM_CHAT_ID_VALUE="$(
      read_env_value TELEGRAM_CHAT_ID "$ENV_FILE" || printf '%s' "$TELEGRAM_CHAT_ID_VALUE"
    )"
  fi

  if [[ -z "${SCHEDULED_CODEX_LOG_RETENTION_DAYS:-}" ]]; then
    SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE="$(
      read_env_value SCHEDULED_CODEX_LOG_RETENTION_DAYS "$ENV_FILE" || printf '%s' "$SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE"
    )"
  fi

  if has_env_key SCHEDULED_CODEX_GIT_USER_NAME "$ENV_FILE" || has_env_key SCHEDULED_CODEX_GIT_USER_EMAIL "$ENV_FILE"; then
    SCHEDULED_CODEX_GIT_IDENTITY_OVERRIDE_REQUESTED=1
  fi
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "missing prompt file: $PROMPT_FILE" >&2
  exit 1
fi

if [[ "$SCHEDULED_CODEX_GIT_IDENTITY_OVERRIDE_REQUESTED" == "1" ]]; then
  if [[ -n "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE" && -z "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE" ]]; then
    echo "scheduled git identity is incomplete: set SCHEDULED_CODEX_GIT_USER_EMAIL alongside SCHEDULED_CODEX_GIT_USER_NAME" >&2
    exit 1
  fi

  if [[ -z "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE" && -n "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE" ]]; then
    echo "scheduled git identity is incomplete: set SCHEDULED_CODEX_GIT_USER_NAME alongside SCHEDULED_CODEX_GIT_USER_EMAIL" >&2
    exit 1
  fi
else
  if [[ -z "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE" ]]; then
    SCHEDULED_CODEX_GIT_USER_NAME_VALUE="$(git -C "$WORKSPACE_ROOT" config user.name || true)"
  fi

  if [[ -z "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE" ]]; then
    SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE="$(git -C "$WORKSPACE_ROOT" config user.email || true)"
  fi
fi

if [[ -z "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE" || -z "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE" ]]; then
  echo "missing scheduled git identity: set SCHEDULED_CODEX_GIT_USER_NAME and SCHEDULED_CODEX_GIT_USER_EMAIL, or configure git user.name/user.email on the host" >&2
  exit 1
fi

if [[ ! "$SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE" =~ ^[0-9]+$ ]]; then
  echo "invalid SCHEDULED_CODEX_LOG_RETENTION_DAYS: expected a non-negative integer, got '$SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE'" >&2
  exit 1
fi

if [[ -n "$TELEGRAM_BOT_TOKEN_VALUE" && -z "$TELEGRAM_CHAT_ID_VALUE" ]]; then
  echo "telegram configuration is incomplete: set TELEGRAM_CHAT_ID alongside TELEGRAM_BOT_TOKEN" >&2
  exit 1
fi

if [[ -z "$TELEGRAM_BOT_TOKEN_VALUE" && -n "$TELEGRAM_CHAT_ID_VALUE" ]]; then
  echo "telegram configuration is incomplete: set TELEGRAM_BOT_TOKEN alongside TELEGRAM_CHAT_ID" >&2
  exit 1
fi

GH_TOKEN_VALUE="$(resolve_github_token)" || exit 1

if [[ "${SCHEDULED_CODEX_DRY_RUN:-0}" == "1" ]]; then
  printf 'GH token configured: %s\n' "$([[ -n "$GH_TOKEN_VALUE" ]] && printf 'yes' || printf 'no')"
  printf 'project alias: %s\n' "$TAKOPI_PROJECT_ALIAS_VALUE"
  printf 'scheduled git identity: %s <%s>\n' "$SCHEDULED_CODEX_GIT_USER_NAME_VALUE" "$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE"
  printf 'log retention (days): %s\n' "$SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE"
  printf 'Telegram configured: %s\n' "$([[ -n "$TELEGRAM_BOT_TOKEN_VALUE" ]] && printf 'yes' || printf 'no')"
  if [[ -n "$TELEGRAM_BOT_TOKEN_VALUE" ]]; then
    printf 'Telegram topic title: %s\n' "$(build_telegram_topic_title run)"
  fi
  exit 0
fi

prune_old_run_artifacts "$SCHEDULED_CODEX_LOG_RETENTION_DAYS_VALUE"

if [[ -n "$TELEGRAM_BOT_TOKEN_VALUE" ]]; then
  start_notification_text="$(build_start_notification)"
  telegram_topic_title="$(build_telegram_topic_title run)"
  if telegram_message_thread_id="$(create_telegram_topic "$telegram_topic_title")"; then
    if ! send_telegram_report "$start_notification_text" "$telegram_message_thread_id"; then
      echo "warning: failed to send scheduled start notification to Telegram" >&2
    fi
  else
    echo "warning: failed to create Telegram topic for scheduled start notification" >&2
  fi
fi

docker build \
  --pull \
  --file "$WORKSPACE_ROOT/.devcontainer/Dockerfile" \
  --tag "$IMAGE_TAG" \
  "$WORKSPACE_ROOT/.devcontainer"

run_args=(
  --rm
  --init
  --volume "$WORKSPACE_ROOT:/workspace"
  --volume "$SCRIPT_DIR:/workspace/scripts/scheduled-codex:ro"
  --volume "$PROMPT_FILE:/workspace/.automation/scheduled-codex/prompt.md:ro"
  --volume "$CODEX_HOME_HOST:/home/node/.codex"
  --workdir /workspace
  --env CODEX_HOME=/home/node/.codex
)

if [[ -d "$WORKSPACE_ROOT/.git" ]]; then
  run_args+=(--volume "$WORKSPACE_ROOT/.git:/workspace/.git")
fi

if [[ -f "$ENV_FILE" ]]; then
  run_args+=(--env-file "$ENV_FILE")
  run_args+=(--volume "$ENV_FILE:/workspace/.automation/scheduled-codex/config.env:ro")
fi

if [[ -n "$GH_TOKEN_VALUE" ]]; then
  run_args+=(--env "GH_TOKEN=$GH_TOKEN_VALUE" --env "GITHUB_TOKEN=$GH_TOKEN_VALUE")
fi

run_args+=(
  --env "SCHEDULED_CODEX_GIT_USER_NAME=$SCHEDULED_CODEX_GIT_USER_NAME_VALUE"
  --env "SCHEDULED_CODEX_GIT_USER_EMAIL=$SCHEDULED_CODEX_GIT_USER_EMAIL_VALUE"
)

: > "$LAST_MESSAGE_OUTPUT_PATH"

set +e
docker run "${run_args[@]}" "$IMAGE_TAG" bash -lc '
  set -euo pipefail
  git config --global user.name "$SCHEDULED_CODEX_GIT_USER_NAME"
  git config --global user.email "$SCHEDULED_CODEX_GIT_USER_EMAIL"
  export GIT_AUTHOR_NAME="$SCHEDULED_CODEX_GIT_USER_NAME"
  export GIT_AUTHOR_EMAIL="$SCHEDULED_CODEX_GIT_USER_EMAIL"
  export GIT_COMMITTER_NAME="$SCHEDULED_CODEX_GIT_USER_NAME"
  export GIT_COMMITTER_EMAIL="$SCHEDULED_CODEX_GIT_USER_EMAIL"
  export GIT_TERMINAL_PROMPT=0
  export GH_PROMPT_DISABLED=1
  export GH_NO_UPDATE_NOTIFIER=1
  export GH_NO_EXTENSION_UPDATE_NOTIFIER=1
  github_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  original_origin_url=""
  original_origin_push_url=""
  restore_origin_remote() {
    if [[ -n "$original_origin_url" ]]; then
      git remote set-url origin "$original_origin_url"
    fi

    if [[ -n "$original_origin_push_url" ]]; then
      git remote set-url --push origin "$original_origin_push_url"
    fi
  }
  trap restore_origin_remote EXIT
  if [[ -n "$github_token" ]]; then
    # Scheduled runs inject GH_TOKEN into the container. Let gh and git use
    # that environment-provided token directly instead of trying to persist a
    # separate login state inside the ephemeral container.
    git config --global url."https://github.com/".insteadOf git@github.com:
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/
    gh auth setup-git --hostname github.com --force
    if git remote get-url origin >/dev/null 2>&1; then
      original_origin_url="$(git remote get-url origin)"
      original_origin_push_url="$(git remote get-url --push origin 2>/dev/null || true)"

      if [[ "$original_origin_url" == git@github.com:* ]]; then
        git remote set-url origin "https://github.com/${original_origin_url#git@github.com:}"
      elif [[ "$original_origin_url" == ssh://git@github.com/* ]]; then
        git remote set-url origin "https://github.com/${original_origin_url#ssh://git@github.com/}"
      fi

      if [[ -n "$original_origin_push_url" ]]; then
        if [[ "$original_origin_push_url" == git@github.com:* ]]; then
          git remote set-url --push origin "https://github.com/${original_origin_push_url#git@github.com:}"
        elif [[ "$original_origin_push_url" == ssh://git@github.com/* ]]; then
          git remote set-url --push origin "https://github.com/${original_origin_push_url#ssh://git@github.com/}"
        fi
      fi
    fi
  fi
  status_exit_code=0
  status="$(codex login status 2>&1)" || status_exit_code=$?
  printf "%s\n" "$status"
  # Trust the CLI exit code first. Fall back to a relaxed text check because
  # the success wording can vary across Codex versions.
  if [[ "$status_exit_code" -ne 0 ]] && ! grep -Eq "Logged[[:space:]]+in" <<<"$status"; then
    echo "codex auth state is missing from /home/node/.codex; run scripts/scheduled-codex/seed-auth-from-host.sh first" >&2
    exit 1
  fi
  codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    --skip-git-repo-check \
    -C /workspace \
    -o /workspace/.automation/scheduled-codex/logs/'"$RUN_MESSAGE_OUTPUT_BASENAME"' \
    - < /workspace/.automation/scheduled-codex/prompt.md
' 2>&1 | tee "$RUN_LOG_PATH"
run_exit_code=${PIPESTATUS[0]}
set -e

if [[ -f "$RUN_MESSAGE_OUTPUT_PATH" ]]; then
  cp "$RUN_MESSAGE_OUTPUT_PATH" "$LAST_MESSAGE_OUTPUT_PATH"
fi

cp "$RUN_LOG_PATH" "$LAST_RUN_LOG_PATH"

run_status="success"
if [[ "$run_exit_code" -ne 0 ]]; then
  run_status="failure"
fi

write_report "$run_status" "$run_exit_code"

if [[ -n "$TELEGRAM_BOT_TOKEN_VALUE" ]]; then
  report_text="$(trim_to_limit "$(cat "$REPORT_PATH")" 4000)"
  if [[ -z "$telegram_message_thread_id" ]]; then
    telegram_topic_title="$(build_telegram_topic_title run)"
    if telegram_message_thread_id="$(create_telegram_topic "$telegram_topic_title")"; then
      telegram_delivery_failed=0
    else
      telegram_delivery_failed=1
    fi
  fi

  if [[ "${telegram_delivery_failed:-0}" -eq 0 ]]; then
    telegram_delivery_failed=0
    if ! send_telegram_report "$report_text" "$telegram_message_thread_id"; then
      telegram_delivery_failed=1
    fi
  fi

  if [[ "${telegram_delivery_failed:-0}" -eq 1 ]]; then
    if [[ "$run_exit_code" -eq 0 ]]; then
      exit 1
    fi
  fi
fi

exit "$run_exit_code"
