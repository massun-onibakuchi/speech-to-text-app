<!--
Where: docs/decisions/remove-shortcut-contract-panel.md
What: Decision record for removing the read-only Shortcut Contract panel from UI.
Why: Issue #245 removes duplicate shortcut presentation from the Shortcuts tab.
-->

# Decision: Remove Shortcut Contract Panel (#245)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #245

## Decision

Remove the read-only Shortcut Contract panel and keep the editable shortcut rows as the single source of truth in the Shortcuts tab.

## Consequences

- `SettingsShortcutsReact` and its tests are deleted;
- Shortcuts tab now renders editor-only controls;
- docs no longer treat contract table/panel as part of runtime UI.
