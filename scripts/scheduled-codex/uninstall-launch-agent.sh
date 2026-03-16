#!/usr/bin/env bash
# Where: scripts/scheduled-codex/uninstall-launch-agent.sh
# What: Removes the repo-local launchd agent from the current macOS user session.
# Why: the schedule should be easy to undo without touching files outside the workspace.

set -euo pipefail

PLIST_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)/.automation/scheduled-codex/com.massun.scheduled-codex.plist"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
echo "Removed launch agent: $PLIST_PATH"
