<!--
Where: docs/decisions/settings-validation-react-props-slice.md
What: Decision record for removing legacy DOM-based validation message sync in Settings.
Why: Keep validation rendering ownership in React and reduce migration-era dual paths.
-->

# Decision: React-Only Settings Validation Message Rendering

## Context
- Settings validation errors are already passed into React Settings components as props.
- Renderer still contained `refreshSettingsValidationMessages`, which mutated error DOM nodes directly.
- Keeping both paths risked drift and unnecessary legacy coupling.

## Decision
- Remove `refreshSettingsValidationMessages` from `legacy-renderer.ts`.
- Keep `setSettingsValidationErrors` responsible for updating state and rerendering React-owned Settings sections.
- Add a component test asserting validation messages update on rerendered props.

## Rationale
- Preserves existing selector and UI behavior while simplifying ownership.
- Aligns with React's state/props rendering model.
- Reduces legacy compatibility surfaces during migration.

## Consequences
- Validation messages render through React props only.
- No imperative DOM mutation remains for validation message text.
