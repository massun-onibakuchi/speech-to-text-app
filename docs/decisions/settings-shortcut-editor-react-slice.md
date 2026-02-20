<!--
Where: docs/decisions/settings-shortcut-editor-react-slice.md
What: Decision record for moving editable Settings shortcut inputs to React ownership.
Why: Keep one event owner per Settings interaction path during incremental migration.
-->

# Decision: React-own Editable Shortcut Inputs in Settings

## Context
- Settings migration already moved API keys, recording controls, transformation controls, endpoint overrides, and output matrix to React.
- Editable shortcut inputs were still string-rendered and read directly from DOM on submit.
- This left mixed ownership in the Settings form and slowed incremental cleanup.

## Decision
- Move editable shortcut input rendering and change-event ownership into a dedicated React component:
  - `#settings-shortcut-start-recording`
  - `#settings-shortcut-stop-recording`
  - `#settings-shortcut-toggle-recording`
  - `#settings-shortcut-cancel-recording`
  - `#settings-shortcut-run-transform`
  - `#settings-shortcut-run-transform-selection`
  - `#settings-shortcut-pick-transform`
  - `#settings-shortcut-change-default-transform`
- Preserve selector IDs and keep existing submit-time validation and save behavior unchanged.

## Rationale
- Reduces legacy string-rendered surface area while keeping migration scope small and reversible.
- Preserves e2e selector contracts and current save semantics.
- Avoids introducing backward-compatibility branches in event ownership.

## Consequences
- Shortcut draft edits now update renderer state through React callbacks.
- Final persistence remains in existing `settings-form` submit flow.
