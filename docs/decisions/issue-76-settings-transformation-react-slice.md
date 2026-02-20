<!--
Where: docs/decisions/issue-76-settings-transformation-react-slice.md
What: Decision record for Settings transformation-controls React migration slice.
Why: Track ownership changes and preserve behavior contracts while removing legacy listeners.
-->

# Decision: Issue #76 Transformation Controls React Slice

## Context
- Settings API keys, recording, and output sections are already React-owned.
- Transformation controls were still rendered and wired by legacy DOM listeners.
- Goal is incremental migration with minimal regression risk and no backward-compat seams.

## Decision
- Move transformation controls/preset actions to a dedicated React root (`settings-transformation-react-root`).
- Preserve selector contracts:
  - `#settings-transform-enabled`
  - `#settings-transform-active-preset`
  - `#settings-transform-default-preset`
  - `#settings-preset-add`
  - `#settings-preset-remove`
  - `#settings-run-selected-preset`
  - `#settings-transform-preset-name`
  - `#settings-transform-preset-model`
  - `#settings-transform-auto-run`
  - `#settings-system-prompt`
  - `#settings-user-prompt`
  - `#settings-error-preset-name`
- Remove equivalent legacy listeners for run-selected, transformation autosave toggles, active preset switch, add preset, and remove preset.

## Rationale
- Removes another major legacy event-ownership seam while keeping full Settings submit flow unchanged.
- Reuses existing renderer helpers for autosave and preset mutations to minimize logic drift.
- Keeps URL override + shortcut inputs in existing path for a smaller, safer PR slice.

## Consequences
- Transformation controls are React-owned.
- Legacy submit/validation flow still reads the same element IDs, so persistence behavior remains stable.
- Remaining migration focus is now primarily the residual non-React shortcut/validation wiring.
