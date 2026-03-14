#!/usr/bin/env bash
# Where: scripts/scheduled-codex/install-launch-agent.sh
# What: Generates and bootstraps a repo-local launchd agent that invokes the Docker runner every 3 days.
# Why: macOS scheduling belongs on the host, but the repo should remain the only place that stores setup state.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SCHEDULE_ROOT="$WORKSPACE_ROOT/.automation/scheduled-codex"
LOG_ROOT="$SCHEDULE_ROOT/logs"
PLIST_PATH="$SCHEDULE_ROOT/com.massun.scheduled-codex.plist"
LABEL="com.massun.scheduled-codex"

mkdir -p "$SCHEDULE_ROOT" "$LOG_ROOT"

node "$SCRIPT_DIR/render-launch-agent.mjs" > "$PLIST_PATH"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/$LABEL"

cat <<EOF
Installed launch agent:
  $PLIST_PATH

Scheduled command:
  /bin/bash $WORKSPACE_ROOT/scripts/scheduled-codex/run-container.sh

The job will run every 259200 seconds (3 days).
Use 'launchctl kickstart -k gui/$(id -u)/$LABEL' to trigger it immediately.
EOF
