<!--
Where: docs/decisions/settings-remove-url-reset-actions.md
What: Decision record for removing reset-to-default URL controls from Settings UI.
Why: Ticket #227 removes reset actions and keeps URL management to direct edits only.
-->

# Decision: Remove URL Reset-to-Default Controls

## Status
Accepted - February 28, 2026

## Context
Settings exposed reset buttons for STT and LLM base URL override fields. The requested UI contract is to remove those reset actions and keep URL handling to direct field edits.

## Decision
- Remove `Reset STT URL to default` and `Reset LLM URL to default` controls.
- Remove reset callback plumbing from AppShell and renderer orchestration.
- Keep manual URL editing and autosave behavior unchanged.

## Consequences
- Users clear overrides by editing the URL input directly.
- Settings component contracts are smaller (no reset callbacks for URL overrides).
- Tests assert reset controls are absent while URL edit callbacks continue to function.
