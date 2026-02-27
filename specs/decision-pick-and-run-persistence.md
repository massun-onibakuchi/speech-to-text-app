<!--
Where: specs/decision-pick-and-run-persistence.md
What: Decision record for pick-and-run execution vs picker-focus persistence behavior.
Why: Clarify #167 semantics after removing active-profile state.
-->

# Decision: Pick-and-run request scope with remembered picker focus

- Date: 2026-02-27
- Issue: #167
- Status: Supersedes prior #85 wording that referenced `activePresetId`

## Decision

`pickAndRunTransformation` is **one-time** (request-scoped):

1. User picks a profile.
2. System executes transformation with that picked profile for the current request.
3. System updates persisted `transformation.lastPickedPresetId` to the selected profile id.
4. System does not update persisted `transformation.defaultPresetId`.
5. Subsequent picker opens focus `lastPickedPresetId` when valid; otherwise fall back to `defaultPresetId`, then first profile.

## Rationale

- Preserves request-scoped execution while supporting repeat workflows (press shortcut, Enter to repeat last pick).
- Keeps default-profile semantics stable and explicit.
- Removes hidden `activePresetId` coupling from picker behavior.

## Consequences

- Pick-and-run now persists only picker focus memory (`lastPickedPresetId`).
- Any implementation/tests relying on `activePresetId` must be removed or rewritten.
- Specs and decision docs must no longer describe `activePresetId` behavior.
