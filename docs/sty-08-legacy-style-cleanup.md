<!--
Where: docs/sty-08-legacy-style-cleanup.md
What: STY-08 implementation notes for legacy style/name cleanup.
Why: Record removal of legacy class conventions from active renderer paths.
-->

# STY-08 Legacy Style Cleanup

**Date**: 2026-02-27
**Scope**: Cleanup-only ticket removing legacy style naming/hooks from active renderer paths.

## Implemented Cleanup

- Replaced legacy settings class hooks with utility-first classes in active settings components:
  - removed `settings-form`, `settings-group`, `text-row`, `toggle-row`, `field-error`, `settings-actions`, `settings-key-row`
- Introduced `data-settings-form` as the stable non-style hook for Enter-to-save routing.
- Updated renderer save-key handler to use `[data-settings-form]` instead of `.settings-form`.
- Removed legacy `.shortcut-combo` hook usage from active UI and replaced with `data-shortcut-combo`.
- Updated tests/E2E selectors to use utility/data hooks instead of legacy class names.

## Validation

- Repo-wide grep confirms no active renderer references to removed legacy class conventions.
- Tests updated for new hooks (`data-settings-form`, `data-shortcut-combo`).

## Rollback

1. Revert STY-08 commit(s).
2. Re-run:
   - `pnpm -s vitest run src/renderer/app-shell-react.test.tsx src/renderer/settings-shortcuts-react.test.tsx`
   - `pnpm -s vitest run`
3. Verify settings save-on-Enter and shortcut contract rendering selectors still function.
