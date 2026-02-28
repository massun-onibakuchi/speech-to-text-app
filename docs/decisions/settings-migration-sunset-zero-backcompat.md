<!--
Where: docs/decisions/settings-migration-sunset-zero-backcompat.md
What: Decision record for removing legacy settings migration/backfill paths under issue #215.
Why: Enforce a current-schema-only settings contract with zero backward compatibility.
-->

# Decision: Settings Migration Sunset and Zero Backward Compatibility (#215)

**Date**: 2026-02-28
**Status**: Accepted
**Ticket**: #215

## Context

`SettingsService` previously included one-time migration/backfill helpers that transformed legacy payloads into the current schema during startup. The parent workstream (#208) explicitly drops backward compatibility and allows breaking contract changes.

Keeping migration branches after the compatibility sunset increases maintenance cost, expands test surface, and blurs the runtime contract.

## Decision

Adopt a strict current-schema-only settings contract in `SettingsService` startup path:

- Parse persisted settings directly with `SettingsSchema`.
- Do not run legacy migration/backfill helpers before parsing.
- If persisted payload is incompatible with current schema, fail fast at startup.
- Continue persisting schema-parsed output so unknown/deprecated extra keys are stripped when payload is otherwise valid.

## Migration Inventory Removed

The following helpers are removed from runtime:

- `migrateRemovedActivePreset`
- `migrateOutputSelectedTextSource`
- `migrateRemovedStartStopRecordingShortcuts`
- `migrateDeprecatedGeminiModel`
- `migrateProviderBaseUrlOverrides`
- `deriveLegacySelectedTextSource`
- `hasAnyOutputDestination` (unused helper cleanup in `output-selection.ts`)

## Consequences

- Legacy payloads that relied on migration/backfill are rejected instead of silently rewritten.
- Runtime settings behavior is simpler and deterministic.
- Startup/load contract becomes explicit: payload must already satisfy current schema.
- Tests now assert fail-fast behavior for legacy-only payloads.

## Recovery Runbook

When startup fails because persisted settings are incompatible with current schema:

1. Remove the persisted settings store file (`settings.json`) in Electron app `userData`.
2. Restart the app; `electron-store` defaults in `SettingsService` recreate `DEFAULT_SETTINGS` automatically.
3. Re-apply user configuration through current Settings UI only.

This is an intentional compatibility cutoff under issue #215 and parent #208.

## Out of Scope

- UI redesign or settings page flow changes.
- New schema fields or new provider behavior.
