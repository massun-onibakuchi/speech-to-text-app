#!/usr/bin/env bash
# Where: .agents/skills/claude/scripts/run-claude-review.sh
# What: Thin shell entrypoint for the tracked Claude review runtime.
# Why: Keep the skill-facing command stable while the Node runtime owns process
#      supervision and durable job state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -gt 0 && "${1}" == --* ]]; then
  set -- start "$@"
fi

exec node "${SCRIPT_DIR}/run-claude-review.mjs" "$@"
