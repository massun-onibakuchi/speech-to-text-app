<!--
Where: docs/decisions/settings-save-feedback-react-state-slice.md
What: Decision record for migrating Settings save feedback message rendering to React state/props.
Why: Remove remaining legacy DOM mutation path and keep save UI ownership in React.
-->

# Decision: React-State Save Feedback Rendering

## Context
- Save action ownership was migrated to `SettingsSaveReact`.
- Feedback text was still written through imperative DOM queries on `#settings-save-message`.
- Mixed ownership increases migration friction and can desync rendered feedback.

## Decision
- Move save feedback message to renderer state (`state.settingsSaveMessage`).
- Render message inside `SettingsSaveReact` via `saveMessage` prop with `aria-live="polite"`.
- Replace all legacy save-message DOM mutation paths with `setSettingsSaveMessage`.

## Rationale
- Keeps one UI ownership model for save action and feedback.
- Removes remaining direct DOM coupling from migrated save flow.
- Preserves existing feedback semantics while simplifying migration surface.

## Consequences
- `#settings-save-message` standalone DOM node is removed.
- Save, autosave, defaults restore, and preset add/remove feedback now update through state.
- Save message updates can be validated via React component tests.
