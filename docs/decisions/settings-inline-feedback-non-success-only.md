<!--
Where: docs/decisions/settings-inline-feedback-non-success-only.md
What: Decision record for global inline settings feedback policy.
Why: Option B removes inline success messaging and keeps inline feedback for non-success, actionable states only.
-->

# Decision: Inline Settings Feedback Is Non-Success Only

## Date
2026-03-04

## Status
Accepted

## Context
- Renderer feedback currently uses a shared `settingsSaveMessage` surface shown on Settings/Shortcuts tabs.
- Success messages from different origins can leak across tabs because message state is global.
- Existing docs created partial guidance (autosave success toast-only) but did not define one global policy for all settings/profile save origins.

## Decision
Adopt a global policy for settings inline feedback:
- Inline settings feedback is for non-success, actionable states only.
- Success feedback must use toast notifications only.
- This policy applies uniformly to:
  - profile save flows,
  - non-secret settings save/autosave flows,
  - any future settings-adjacent save interactions.

## Rationale
- Prevents cross-tab stale success messages such as `Profile saved.` appearing later in unrelated settings surfaces.
- Keeps inline space focused on user-actionable guidance (validation errors, failed saves, rollback outcomes).
- Establishes one durable rule instead of per-feature exceptions.

## Consequences
- Success text should no longer appear in `data-settings-save-message` surfaces.
- Existing logic/tests that assert inline success messages must be removed or updated.
- Error and validation inline messaging remains unchanged.

## Migration Notes
- Remove outdated decision records that conflict with or incompletely define this policy.
- Treat previous success-inline behavior as deprecated with no backward compatibility requirement.
