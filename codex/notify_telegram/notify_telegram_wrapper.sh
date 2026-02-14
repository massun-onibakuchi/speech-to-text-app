#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/home/node/.codex/telegram_notify_wrapper.log"
PY_SCRIPT="/home/node/.codex/notify_telegram.py"

{
  printf '%s wrapper start argc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$#"
} >> "$LOG_FILE"

# Detach from Codex process lifetime so sends can complete even if Codex exits quickly.
nohup /usr/bin/uv run -q "$PY_SCRIPT" "$@" >> "$LOG_FILE" 2>&1 &

{
  printf '%s wrapper spawned pid=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$!"
} >> "$LOG_FILE"
