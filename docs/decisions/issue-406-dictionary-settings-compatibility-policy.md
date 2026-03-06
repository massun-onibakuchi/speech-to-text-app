<!--
Where: docs/decisions/issue-406-dictionary-settings-compatibility-policy.md
What: Decision record for settings compatibility behavior when introducing correction.dictionary entries for issue #406.
Why: Document non-trivial contract choice (migration vs fail-fast) so implementation and tests stay aligned.
-->

# Decision: Issue #406 Settings Compatibility Policy

Date: 2026-03-06
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/406
Status: Accepted

## Context

Issue #406 adds a new required settings subtree:

- `settings.correction.dictionary.entries`

The codebase currently enforces strict schema parsing at startup and rejects legacy/incompatible payloads without implicit migrations.

## Decision

Keep strict fail-fast compatibility behavior for this change.

- Startup must parse persisted settings against current schema.
- Missing `correction.dictionary` (or other incompatible legacy shape) is rejected.
- No automatic silent migration/coercion is added in this phase.

## Rationale

- Aligns with existing zero-backward-compat policy already enforced in `SettingsService`.
- Avoids hidden data mutation paths that are hard to reason about and test.
- Keeps settings contract explicit and deterministic across main/renderer.

## Consequences

- Existing local settings payloads missing `correction.dictionary` may fail on startup.
- Recovery remains explicit (reset incompatible local settings payload) rather than implicit migration.
- Tests must lock this behavior so later work cannot silently change compatibility policy.

## Rejected Alternative

1. Load-time migration that injects missing `correction.dictionary.entries = []`.
- Rejected for this phase to preserve strict-contract behavior and avoid hidden persistence mutations.
