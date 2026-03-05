<!--
Where: docs/decisions/profile-create-explicit-save-draft-phase-a.md
What: Decision record for #350 phase-A profile creation/editing draft contract.
Why: Prevent persisted invalid/incomplete profile state and remove implicit add-and-save behavior.
-->

# Decision: Profile Create Uses Unsaved Draft + Explicit Save (Phase A)

## Status
Accepted - March 5, 2026

## Context

Issue #350 requires explicit-save profile management behavior and no persistence of invalid/incomplete profile state.

Before this change:
- `Add profile` triggered immediate persisted creation (`addTransformationPresetAndSave`).
- New profile creation could persist placeholder/partial profile content before user Save intent.

## Decision

- Remove immediate persisted add-profile path from renderer profile mutation API.
- `Add profile` now opens a local unsaved draft editor in Profiles tab.
- Persisted creation happens only via explicit Save from that draft form.
- Validation for new-profile drafts reuses `validateTransformationPresetDraft` before persistence.
- Cancel discards the new draft without persistence.

## Consequences

- Profile creation now matches explicit-save semantics already used for profile edits.
- Invalid/incomplete draft data is blocked before write.
- Legacy immediate-add compatibility path is removed from profile mutation surface.

## Follow-up

Phase B (#350) adds dirty-navigation and unload guards on top of this draft contract.
