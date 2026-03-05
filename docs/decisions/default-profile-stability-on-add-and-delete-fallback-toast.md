<!--
Where: docs/decisions/default-profile-stability-on-add-and-delete-fallback-toast.md
What: Decision record for default profile behavior when adding/removing profiles.
Why: Issue #349 requires stable default selection unless the user explicitly changes it.
-->

# Decision: Keep Default Profile Stable on Add/Edit; Notify on Default-Delete Fallback

## Status
Accepted - March 5, 2026

## Context

Issue #349 reports that adding a new profile automatically changes the default profile, which is unexpected and violates user intent.

Current requirement:
- Creating a profile must not change default profile.
- Editing a profile must not change default profile.
- Deleting a non-default profile must not change default profile.
- Deleting the current default profile must assign the top-listed remaining profile as fallback and notify the user.

## Decision

- Keep `transformation.defaultPresetId` unchanged when adding profiles.
- Keep default unchanged for edit operations (already true via explicit save of target profile fields only).
- When deleting profiles:
  - if deleted profile is non-default, keep default unchanged.
  - if deleted profile is default, assign first remaining profile as fallback.
- Emit a toast only when fallback assignment happens due to deleting the current default profile.

## Consequences

- Default profile changes only from explicit user action (set default) or mandatory fallback on default deletion.
- Add-profile flow no longer has hidden side effects on runtime profile selection.
- Tests that previously encoded "add => new default" behavior are updated to the new contract.
