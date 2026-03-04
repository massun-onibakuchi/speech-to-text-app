<!--
Where: docs/research/profile-settings-save-message-suppression.md
What: Research summary for profile/settings save feedback behavior and Option B policy direction.
Why: Document the root cause and final docs-level decision for removing inline success messages.
-->

# Research: Profile Save Message Leakage Into Settings Surface

## Summary

Observed behavior: profile save success (for example `Profile saved.`) can appear later in the Settings/Shortcuts inline message surface.

Root cause: a global save-message state is rendered conditionally by tab, so success written by one flow can be surfaced later by another tab context.

Chosen direction: **Option B**.
- Define a global policy: inline settings feedback is non-success only.
- Route all success feedback to toasts.
- Remove backward compatibility for legacy inline success behavior.

## Behavior and Ownership Trace

- Shared message state:
  - `state.settingsSaveMessage` in `src/renderer/renderer-app.tsx`
- Inline rendering surface:
  - `[data-settings-save-message]` in `src/renderer/app-shell-react.tsx`
- Profile save success currently writes:
  - `setSettingsSaveMessage('Profile saved.')` in `src/renderer/settings-mutations.ts`

Because this is one shared state string, success feedback can leak across tabs.

## Why Option B (vs targeted fix)

A targeted fix (Option A) solves one symptom (`Profile saved.`) but leaves the same class of risk for future success messages from other settings flows.

Option B introduces a durable rule and removes ambiguity:
- inline feedback => actionable non-success only,
- success feedback => toast only.

## Documentation Actions In This PR

- Add global decision record:
  - `docs/decisions/settings-inline-feedback-non-success-only.md`
- Remove outdated/partial decision records:
  - `docs/decisions/autosave-success-toast.md`
  - `docs/decisions/settings-save-feedback-react-state-slice.md`
- Update references that pointed to removed docs.

## Implementation Follow-up (Not In This PR)

Code/test follow-up should enforce the new policy consistently by removing inline success writes and updating tests that expect inline success content.
