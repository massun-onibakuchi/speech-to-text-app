<!--
Where: docs/reviews/pr-full-react-shell-cutover.md
What: PR description and validation report for full legacy-renderer shell cutover.
Why: Ship one reviewable, reversible PR that completes React ownership and includes findings fixes.
-->

# PR: Full React Shell Cutover + Findings Fixes

## Summary
- Removes the remaining legacy renderer shell path and completes React shell ownership in one PR.
- Keeps selector contracts stable for existing e2e coverage.
- Includes follow-up fixes from review findings:
  - Secret-store explicit-empty key fallback behavior.
  - Hermetic API-key blocking e2e tests and stabilized live multi-config dispatch assertion.

## Scope
- Legacy shell/template ownership removed from `src/renderer/legacy-renderer.ts`.
- Old bootstrap host path deleted:
  - `src/renderer/react-bootstrap.ts`
  - `src/renderer/react-bootstrap.test.ts`
- Renderer entry/mount wiring updated in `src/renderer/main.ts`.
- Transformation settings React path adjusted in `src/renderer/settings-transformation-react.ts`.
- Findings fixes:
  - `src/main/services/secret-store.ts`
  - `src/main/services/secret-store.test.ts`
  - `e2e/electron-ui.e2e.ts`

## Contract Safety
- Existing selector contracts preserved for e2e stability:
  - `[data-route-tab]`
  - `[data-page]`
  - `#toast-layer`
  - `#settings-*`

## Risk
- Main risk: lifecycle differences after removing legacy shell orchestration.
- Mitigation:
  - Single React owner for shell and route composition.
  - Full gate run including e2e.
  - Regression tests added for secret-store clear semantics.

## Rollback
- Revert this PR commit (or cherry-pick rollback commit) to restore previous behavior.
- No data migration required.

## Validation Evidence
- `pnpm run typecheck` ✅
- `pnpm exec vitest run --exclude '.worktrees/**' --exclude '.pnpm-store/**'` ✅
- `pnpm run test:e2e` ✅ (`22 passed`, `2 skipped @macos`)

## Review Notes
- Sub-agent re-review on touched findings files returned no remaining findings.
- Claude CLI headless review could not be collected in this environment (no stdout from `claude -p`), so sign-off used internal review + passing gates.
