<!--
Where: docs/decisions/issue-381-strict-unused-sweep.md
What: Decision record for strict-unused cleanup performed in this branch.
Why: Improve dead-symbol signal quality and reduce legacy code surface.
-->

# Decision: Issue #381 Strict-unused Sweep

Date: 2026-03-05
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/381

## Removed Symbols / Debt

- Removed unused helper `escapeHtml` from `profile-picker-service`.
- Removed obsolete manual transform IPC/API symbols tied to T377.
- Removed additional unused locals/imports uncovered during strict-unused pass:
  - `vi` and `TerminalJobStatus` imports in ordered-output coordinator test
  - `GROQ_KEY` constant in preflight integration test
  - `setInputValue` helper in renderer-app test

## Rationale

- Keep strict-unused checks meaningful by deleting confirmed dead symbols.
- Avoid carrying compatibility-only placeholders after API/flow removals.

## Note

- Repository still has pre-existing type/test issues unrelated to this sweep
  (`window-manager.test.ts`, `app-shell-react.test.tsx`, `renderer-app.test.ts`) that block full strict `tsc` success.
