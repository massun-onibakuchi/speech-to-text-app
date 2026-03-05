<!--
Where: docs/decisions/issue-380-strict-contract-cleanup.md
What: Decision record for issue #380 compatibility cleanup and strict schema enforcement.
Why: Remove backward-compat normalization while avoiding silent behavior drift.
-->

# Decision: Enforce Strict Current Contract (Issue #380)

Date: 2026-03-05
Status: Accepted
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/380

## Context

The codebase still carried compatibility-oriented behavior in tests/docs and a few runtime utilities. This created drift around strict current-schema boundaries.

## Decision

Adopt strict-contract enforcement for settings and remove compatibility-only expectations:
- `SettingsSchema` uses strict object parsing to reject unknown legacy keys.
- Startup/settings save reject legacy payload shapes instead of silently normalizing them.
- Prompt placeholder contract requires current `{{text}}` format for non-empty preset prompts.
- Spec/e2e expectations remove legacy endpoint-override settings references.

For shortcut duplicate checks, keep legacy symbol canonicalization only as a duplicate-safety guard to avoid silent collisions with persisted symbol-form shortcuts.

## Rationale

- No backward-compat maintenance: legacy shapes are rejected, not transformed.
- No silent degradation: invalid legacy prompt payloads fail fast.
- Current user-visible behavior for valid settings remains unchanged.

## Consequences

- Legacy persisted settings using removed keys/placeholders now fail fast at startup.
- Tests/docs now encode strict current-schema boundaries.
- Duplicate detection remains stable even when existing settings include old Option-symbol forms.
