<!--
Where: docs/sty-06a-settings-ia-reorder.md
What: STY-06a implementation notes for Settings information-architecture reorder.
Why: Document shipped section order contract, validation scope, and rollback checks.
-->

# STY-06a Settings IA Reorder

**Date**: 2026-02-27
**Scope**: Settings tab section ordering and section header/separator structure only.

## Implemented Behavior

- Settings sections now render in this order:
  1. Output
  2. Speech-to-Text
  3. LLM Transformation
  4. Audio Input
  5. Global Shortcuts
- Section wrappers expose stable `data-settings-section` markers for deterministic order tests.
- Section headers use the compact icon + title pattern (`flex items-center gap-2 mb-4`, `size-4 text-primary`, `text-sm font-semibold text-foreground`).
- Visual separators are inserted between sections to enforce IA boundaries.
- Control behavior/persistence callbacks remain unchanged; only render placement changed.

## Validation

- `src/renderer/app-shell-react.test.tsx`
  - Adds/validates STY-06a section render order with `data-settings-section` markers.
- `src/renderer/settings-recording-react.test.tsx`
  - Verifies split rendering modes (`speech-to-text` vs `audio-input`) still expose expected controls/selectors.

## Rollback

1. Revert STY-06a commit(s).
2. Run:
   - `pnpm -s vitest run src/renderer/app-shell-react.test.tsx`
   - `pnpm -s vitest run src/renderer/settings-recording-react.test.tsx`
3. Confirm Settings tab still renders and save/validation flows continue to work.
