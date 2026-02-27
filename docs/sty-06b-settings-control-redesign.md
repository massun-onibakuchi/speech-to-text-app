<!--
Where: docs/sty-06b-settings-control-redesign.md
What: STY-06b implementation notes for settings control-pattern redesign.
Why: Document output control cards, API key compact treatment, and shortcut <Kbd> contract.
-->

# STY-06b Settings Control-Pattern Redesign

**Date**: 2026-02-27
**Scope**: Settings controls visual/interaction patterns only (no persistence contract changes).

## Implemented Behavior

- Output source selection now uses custom exclusive radio cards (`data-output-source-card`).
- Output destinations now use independent checkbox cards with right-aligned switch visuals (`data-output-destination-card`).
- Warning appears when both destinations are disabled:
  - `#settings-output-destinations-warning`
- API key controls now use compact mono input treatment (`h-8 text-xs font-mono`) and icon eye-toggle buttons.
- Shortcut contract rows now render segmented key combos with reusable `<Kbd>` tokens while preserving `.shortcut-combo` hooks.

## Validation

- `src/renderer/settings-output-react.test.tsx`
  - verifies callback wiring and disabled-destination warning behavior.
- `src/renderer/settings-api-keys-react.test.tsx`
  - verifies visibility toggle, per-provider test/save callbacks, and form submission behavior.
- `src/renderer/settings-shortcuts-react.test.tsx`
  - verifies shortcut contract rendering and `<kbd>` tokenized combos.

## Rollback

1. Revert STY-06b commit(s).
2. Run:
   - `pnpm -s vitest run src/renderer/settings-output-react.test.tsx src/renderer/settings-api-keys-react.test.tsx src/renderer/settings-shortcuts-react.test.tsx`
3. Confirm Settings callbacks and selector IDs remain unchanged.
