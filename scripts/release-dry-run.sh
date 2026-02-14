#!/usr/bin/env bash
set -euo pipefail

echo "[release-dry-run] install"
npm ci

echo "[release-dry-run] typecheck"
npm run typecheck

echo "[release-dry-run] tests"
npm run test

echo "[release-dry-run] build"
npm run build

echo "[release-dry-run] provider contract smoke"
npm run contract:smoke

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "[release-dry-run] dist (macOS)"
  npm run dist
else
  echo "[release-dry-run] dist skipped (requires macOS runner for v1 packaging)"
fi

echo "[release-dry-run] done"
