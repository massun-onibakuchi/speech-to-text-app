#!/usr/bin/env bash
# Where: scripts/scheduled-codex/bootstrap-oauth.sh
# What: Performs the one-time Codex OAuth/device login inside the same mounted state dir used by launchd.
# Why: recurring scheduled runs can only be unattended after the refresh token has been stored once.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SCHEDULE_ROOT="$WORKSPACE_ROOT/.automation/scheduled-codex"
STATE_ROOT="$SCHEDULE_ROOT/state"
ENV_FILE="$SCHEDULE_ROOT/config.env"
CODEX_HOME_HOST="$STATE_ROOT/codex-home"
IMAGE_TAG="${SCHEDULED_CODEX_IMAGE_TAG:-speech-to-text-scheduled-codex:local}"

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

mkdir -p "$CODEX_HOME_HOST"

if [[ -f "$ENV_FILE" ]]; then
  if [[ -z "${SCHEDULED_CODEX_IMAGE_TAG:-}" ]]; then
    IMAGE_TAG="$(read_env_value SCHEDULED_CODEX_IMAGE_TAG "$ENV_FILE" || printf '%s' "$IMAGE_TAG")"
  fi
fi

docker build \
  --pull \
  --file "$WORKSPACE_ROOT/.devcontainer/Dockerfile" \
  --tag "$IMAGE_TAG" \
  "$WORKSPACE_ROOT/.devcontainer"

exec docker run \
  --rm \
  --init \
  --interactive \
  --tty \
  --volume "$WORKSPACE_ROOT:/workspace" \
  --volume "$CODEX_HOME_HOST:/home/node/.codex" \
  --workdir /workspace \
  --env CODEX_HOME=/home/node/.codex \
  "$IMAGE_TAG" \
  codex login --device-auth
