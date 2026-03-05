<!--
Where: docs/decisions/settings-top-message-toast-only.md
What: Decision record to remove top settings save message surfaces and use toast-only global save/status feedback.
Why: Eliminate hidden-tab feedback mismatch and remove legacy save-message/manual-save pathways.
-->

# Decision: Remove Top Settings Message, Toast-Only Global Feedback

**Date**: 2026-03-04  
**Status**: Accepted

## Context

The renderer currently stores `settingsSaveMessage` and conditionally renders a top message in Settings/Shortcuts. Several save/autosave/profile paths still wrote to this state, creating inconsistent feedback visibility across tabs.

The active product requirement is:
- remove top messages completely;
- stop backward compatibility for those paths;
- keep toast feedback;
- keep non-toast inline text near fields (validation and API-key inline status).

## Decision

- Remove the top-message render surface (`data-settings-save-message`) from `AppShell`.
- Remove `settingsSaveMessage`, `setSettingsSaveMessage`, and legacy write paths.
- Replace prior top-message feedback with `addToast(...)` using equivalent copy and tone.
- Remove legacy manual-save helper path (`saveSettingsFromState`) and dead component path (`SettingsSaveReact`) as part of no-backcompat cleanup.
- Keep existing inline non-toast surfaces unchanged:
  - field-level validation text;
  - provider API-key inline status text.

## Consequences

- Global save/status feedback is toast-only.
- Hidden-tab message mismatch is removed.
- Legacy save-message/manual-save contracts are removed from renderer code.

## Supersedes

This decision supersedes the save-feedback contract in:
- `docs/decisions/settings-save-feedback-react-state-slice.md`
- `docs/decisions/settings-save-react-ownership-slice.md` (the `saveSettingsFromState` save path detail)
