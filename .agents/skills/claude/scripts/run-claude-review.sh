#!/usr/bin/env bash
# Where: .agents/skills/claude/scripts/run-claude-review.sh
# What: Stable shell entrypoint for the portable Claude review wrapper.
# Why: Keep the skill-facing command simple while delegating portable timeout
#      and error normalization to the Node implementation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/run-claude-review.mjs" "$@"
