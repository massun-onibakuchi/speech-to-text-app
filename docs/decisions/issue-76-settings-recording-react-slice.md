<!--
Where: docs/decisions/issue-76-settings-recording-react-slice.md
What: Decision record for the first R1 Settings migration slice (Recording section to React).
Why: Keep event ownership and migration scope explicit while preserving behavior parity.
-->

# Decision: Issue #76 Recording Settings React Slice

## Context
- Home, shell chrome, API keys, and shortcut contract already moved to React in issue #75.
- Remaining Settings controls still mix legacy string-rendered HTML and legacy DOM listeners.
- Current migration objective is one small, reviewable PR slice without backward-compat reintroduction.

## Decision
- Move the **Settings Recording section** to a dedicated React component root (`settings-recording-react-root`).
- Preserve existing selector IDs for parity (`#settings-recording-method`, `#settings-recording-sample-rate`, `#settings-recording-device`, `#settings-transcription-provider`, `#settings-transcription-model`, `#settings-refresh-audio-sources`, `#settings-audio-sources-message`).
- Remove equivalent legacy listeners for:
  - audio source refresh button click,
  - STT provider change,
  - STT model change.
- Keep existing save-submit path for full Settings form unchanged in this slice.

## Rationale
- This is the smallest safe extraction that removes duplicate event ownership while keeping behavior and selectors stable for e2e.
- Provider/model autosave semantics are retained through existing `applyNonSecretAutosavePatch` callbacks.
- Refresh flow keeps the same toast/activity feedback and rerender sequence.

## Consequences
- Recording section rendering and interaction ownership become React-owned.
- Legacy renderer remains owner of the broader Settings submit/preset/validation flow until later slices.
- Next slice can migrate Transformation section with reduced risk because Recording ownership is already isolated.
