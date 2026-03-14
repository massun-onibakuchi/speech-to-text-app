#!/usr/bin/env bash
# Where: scripts/scheduled-codex/run-container.sh
# What: Builds the existing devcontainer image and runs one unattended `codex exec`.
# Why: launchd should trigger a single, stateless container run while all mutable state stays in-repo.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SCHEDULE_ROOT="$WORKSPACE_ROOT/.automation/scheduled-codex"
STATE_ROOT="$SCHEDULE_ROOT/state"
LOG_ROOT="$SCHEDULE_ROOT/logs"
ENV_FILE="$SCHEDULE_ROOT/config.env"
PROMPT_FILE="$SCHEDULE_ROOT/prompt.txt"
CODEX_HOME_HOST="$STATE_ROOT/codex-home"
IMAGE_TAG="${SCHEDULED_CODEX_IMAGE_TAG:-speech-to-text-scheduled-codex:local}"
GH_TOKEN_VALUE="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

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

mkdir -p "$STATE_ROOT" "$LOG_ROOT" "$CODEX_HOME_HOST"

if [[ -f "$ENV_FILE" ]]; then
  if [[ -z "${SCHEDULED_CODEX_IMAGE_TAG:-}" ]]; then
    IMAGE_TAG="$(read_env_value SCHEDULED_CODEX_IMAGE_TAG "$ENV_FILE" || printf '%s' "$IMAGE_TAG")"
  fi

  if [[ -z "$GH_TOKEN_VALUE" ]]; then
    GH_TOKEN_VALUE="$(read_env_value GH_TOKEN "$ENV_FILE" || printf '%s' "$GH_TOKEN_VALUE")"
  fi
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "missing prompt file: $PROMPT_FILE" >&2
  exit 1
fi

if [[ "$GH_TOKEN_VALUE" == "replace-with-github-token" ]]; then
  echo "config file still contains the placeholder GH_TOKEN value" >&2
  exit 1
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
  --volume "$PROMPT_FILE:/workspace/.automation/scheduled-codex/prompt.txt:ro"
  --volume "$CODEX_HOME_HOST:/home/node/.codex"
  --workdir /workspace
  --env CODEX_HOME=/home/node/.codex
)

if [[ -d "$WORKSPACE_ROOT/.git" ]]; then
  run_args+=(--volume "$WORKSPACE_ROOT/.git:/workspace/.git:ro")
fi

if [[ -f "$ENV_FILE" ]]; then
  run_args+=(--env-file "$ENV_FILE")
  run_args+=(--volume "$ENV_FILE:/workspace/.automation/scheduled-codex/config.env:ro")
fi

if [[ -n "$GH_TOKEN_VALUE" ]]; then
  run_args+=(--env "GH_TOKEN=$GH_TOKEN_VALUE" --env "GITHUB_TOKEN=$GH_TOKEN_VALUE")
fi

docker run "${run_args[@]}" "$IMAGE_TAG" bash -lc '
  set -euo pipefail
  status="$(codex login status || true)"
  printf "%s\n" "$status"
  if [[ "$status" != Logged\ in* ]]; then
    echo "codex OAuth state is missing from /home/node/.codex; run scripts/scheduled-codex/bootstrap-oauth.sh first" >&2
    exit 1
  fi
  codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    --skip-git-repo-check \
    -C /workspace \
    -o /workspace/.automation/scheduled-codex/logs/last-message.txt \
    - < /workspace/.automation/scheduled-codex/prompt.txt
'
