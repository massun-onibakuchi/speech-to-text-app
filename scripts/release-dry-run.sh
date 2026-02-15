#!/usr/bin/env bash
set -euo pipefail

echo "[release-dry-run] install"
pnpm install --frozen-lockfile

echo "[release-dry-run] typecheck"
pnpm run typecheck

echo "[release-dry-run] tests"
pnpm run test

echo "[release-dry-run] build"
pnpm run build

echo "[release-dry-run] provider contract smoke"
pnpm run contract:smoke

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "[release-dry-run] dist (macOS)"
  pnpm run dist
else
  echo "[release-dry-run] dist skipped (requires macOS runner for v1 packaging)"
fi

echo "[release-dry-run] done"
