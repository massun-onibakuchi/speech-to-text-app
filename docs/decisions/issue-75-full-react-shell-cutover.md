<!--
Where: docs/decisions/issue-75-full-react-shell-cutover.md
What: Decision record for removing the remaining legacy renderer shell path in one PR.
Why: Complete renderer ownership cutover to React while keeping stable e2e selector contracts.
-->

# Issue #75 Decision Record: Full React Shell Cutover

## Context
- Incremental Home/Settings React ownership slices were already merged through PR #106.
- The remaining legacy path was shell-level string template rendering and manual DOM root orchestration in `legacy-renderer.ts`.
- We need one reversible PR that removes the remaining legacy shell path without changing selector contracts used by e2e.

## Decision
- Move shell composition to a single React-owned renderer app (`src/renderer/renderer-app.ts`).
- Keep selector contracts stable (`#settings-*`, `#toast-layer`, `[data-route-tab]`, `[data-page]`) to avoid e2e churn.
- Keep `src/renderer/legacy-renderer.ts` as a compatibility shim with a short inventory of remaining legacy ownership.
- Remove dead bootstrap/template code in the same PR (`react-bootstrap` host path and string-template shell rendering).

## Rationale
- One owner per surface eliminates lifecycle drift between HTML string templates and React slices.
- A single React tree removes per-slice `createRoot` bookkeeping and manual HTML regeneration.
- Keeping selectors stable preserves regression confidence for existing e2e coverage.

## Consequences
- Renderer mount path is direct (`main.ts -> startRendererApp`) with no intermediate legacy host mount.
- Legacy shell/template helpers are deleted and no longer available as a fallback path.
- Rollback path remains clear: revert/cherry-pick this cutover commit to restore previous runtime behavior.

## Follow-up Hardening
- Keep `startLegacyRenderer(target?)` as an explicit wrapper to preserve optional-argument compatibility.
- Add renderer-app smoke coverage for event-listener attachment and Home navigation API-key status refresh.
