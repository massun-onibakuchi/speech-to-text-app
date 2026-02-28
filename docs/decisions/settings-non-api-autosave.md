<!--
Where: docs/decisions/settings-non-api-autosave.md
What: Decision record for non-API settings autosave behavior.
Why: Ticket #224 changes persistence interaction and removes explicit non-API save controls.
-->

# Decision: Non-API Settings Autosave

## Status
Accepted - February 28, 2026

## Context
Non-API settings previously depended on explicit save actions and Enter-key coupling in settings forms. This created inconsistent UX across controls and added extra user steps for routine updates.

## Decision
- Non-API-key settings use debounced autosave (`450ms`) from field change handlers.
- Non-API explicit save controls are removed from Shortcuts and Settings tabs.
- API key fields remain manual-save and keep their dedicated validation-and-save flow.
- Renderer validation blocks invalid non-API edits from being persisted and shows inline/save feedback.
- On autosave failure for otherwise valid edits, renderer reverts to the last persisted valid settings snapshot and shows failure feedback.

## Consequences
- Persistence is immediate for non-secret controls without Enter/save click.
- Failed invalid edits do not overwrite the last valid persisted value.
- Save ownership is explicit by field class: non-API fields autosave; API keys manual save.
