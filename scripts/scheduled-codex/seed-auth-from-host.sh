#!/usr/bin/env bash
# Where: scripts/scheduled-codex/seed-auth-from-host.sh
# What: Copies an existing host Codex OAuth state into the repo-local scheduler state directory.
# Why: this avoids interactive login inside the container while keeping all scheduled-run state inside the repo.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
TARGET_CODEX_HOME="$WORKSPACE_ROOT/.automation/scheduled-codex/state/codex-home"
SOURCE_CODEX_HOME="${CODEX_SOURCE_HOME:-$HOME/.codex}"

if [[ ! -d "$SOURCE_CODEX_HOME" ]]; then
  echo "missing source Codex home: $SOURCE_CODEX_HOME" >&2
  exit 1
fi

mkdir -p "$TARGET_CODEX_HOME"

if ! compgen -G "$SOURCE_CODEX_HOME/auth*.json" >/dev/null; then
  echo "no Codex auth files found in: $SOURCE_CODEX_HOME" >&2
  exit 1
fi

rsync \
  --archive \
  --delete \
  --exclude 'history.jsonl' \
  --exclude 'log/' \
  --exclude 'shell_snapshots/' \
  "$SOURCE_CODEX_HOME/" \
  "$TARGET_CODEX_HOME/"

echo "Seeded repo-local Codex state from: $SOURCE_CODEX_HOME"
echo "Target state directory: $TARGET_CODEX_HOME"
