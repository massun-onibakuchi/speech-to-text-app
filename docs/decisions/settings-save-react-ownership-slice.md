<!--
Where: docs/decisions/settings-save-react-ownership-slice.md
What: Decision record for migrating Settings save action ownership to a React callback.
Why: Remove remaining legacy submit wiring and keep one event owner for Settings save.
-->

# Decision: React-Owned Settings Save Action

## Context
- Settings controls are already React-owned and update `state.settings` draft values.
- Save action was still owned by a legacy `<form>` submit listener.
- Split ownership increased migration friction and duplicated event wiring concerns.

## Decision
- Remove legacy `#settings-form` submit listener ownership.
- Render the Save action with `SettingsSaveReact` and call `saveSettingsFromState`.
- Keep validation/persistence contract unchanged:
  - Validate through `validateSettingsFormInput`.
  - Persist through `window.speechToTextApi.setSettings`.
  - Keep existing save-message/toast feedback semantics.

## Rationale
- Enforces one event owner per interaction path.
- Reduces legacy DOM coupling without broad behavior changes.
- Keeps migration incremental and reviewable.

## Consequences
- Settings panel no longer depends on a `<form>` submit contract.
- Save button pending state is managed in React for click path UX.
- Legacy submit wiring is deleted, reducing coexistence risk.
- Follow-up: save feedback rendering also moved to React state/props in
  `docs/decisions/settings-save-feedback-react-state-slice.md`.
