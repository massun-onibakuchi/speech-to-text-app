<!--
Where: docs/decisions/issue-334-profile-user-prompt-multiline.md
What: Decision record for issue #334 (profile user prompt multiline input).
Why: Capture scope and rationale so future UI/validation changes stay consistent.
-->

# Issue 334: Profile User Prompt Multiline Input

## Context
- Ticket: https://github.com/massun-onibakuchi/speech-to-text-app/issues/334
- Requirement:
  - Profile User Prompt must allow multiple lines.
  - Existing `{{text}}` placeholder validation must remain.

## Decision
- Change only the profile inline editor control `#profile-edit-user-prompt` from single-line `<input>` to multiline `<textarea rows={3}>`.
- Keep `validateTransformationPresetDraft` unchanged so validation behavior remains:
  - non-empty user prompt
  - must include `{{text}}`
  - legacy `{{input}}` normalization still applies

## Rationale
- The issue is UI input capability, not validation semantics.
- Keeping validation unchanged minimizes regression risk in save/update flows.
- Reusing existing textarea styling keeps visual consistency with the nearby system prompt field.

## Consequences
- User prompt templates can now include line breaks in the profile editor.
- Existing tests for placeholder validation continue to protect current business logic.
