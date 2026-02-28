<!--
Where: docs/decisions/provider-local-endpoint-override-schema.md
What: Decision record for replacing global STT/LLM base URL overrides with per-provider maps.
Why: Standardizes override storage so each provider carries its own optional override without
     ambiguity when multiple providers share the same settings object.
-->

# Decision: Provider-Local Endpoint Override Schema (#196)

**Date**: 2026-02-28
**Status**: Accepted
**Ticket**: #196

## Context

The previous settings contract stored base URL overrides as a single scalar per service type:
- `transcription.baseUrlOverride: string | null` — applied regardless of which STT provider was active.
- `transformation.baseUrlOverride: string | null` — applied regardless of which LLM provider was active.

This became ambiguous as soon as multiple providers were introduced: switching providers would silently
carry the old provider's override URL to the new one, or leave a stale value that didn't apply.

## Decision

Replace the global scalar fields with per-provider keyed maps in the settings schema:

```ts
transcription: {
  baseUrlOverrides: {
    groq: string | null
    elevenlabs: string | null
  }
}

transformation: {
  baseUrlOverrides: {
    google: string | null
  }
}
```

Endpoint resolution uses the currently-selected provider key:
- `resolveSttBaseUrlOverride(settings, provider)` → `settings.transcription.baseUrlOverrides[provider]`
- `resolveLlmBaseUrlOverride(settings, provider)` → `settings.transformation.baseUrlOverrides[provider]`

## Migration

Persisted settings that lack `baseUrlOverrides` (i.e. older files with the scalar form) are migrated
on load by `migrateProviderBaseUrlOverrides` in `settings-service.ts`:

1. If `baseUrlOverrides` already exists → skip (idempotent).
2. If only a legacy scalar `baseUrlOverride` is present → backfill the current provider's map key
   with that value and set all others to `null`.
3. If neither is present → initialise all keys to `null`.

The migration runs once and the resulting map is persisted, so subsequent loads are always
idempotent.

## Consequences

- Each provider stores and resolves its own base URL independently.
- Switching providers does not silently inherit another provider's override URL.
- Legacy settings files load and migrate without data loss.
- Renderer UI resolves the display value for the currently-selected provider via the resolver
  functions, keeping the display consistent with the stored state.
- The global scalar fields (`baseUrlOverride`) no longer appear in the schema or defaults;
  they are handled only as legacy migration inputs.
