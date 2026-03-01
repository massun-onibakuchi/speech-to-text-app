# Decision: Unified STT Provider Form (Issue #197)

## Context

The Settings panel previously rendered STT configuration as three separate, disconnected sections:

1. **Provider / model selectors** — inside `SettingsRecordingReact` (`speech-to-text` section)
2. **API keys** — `SettingsApiKeysReact` rendered all three providers (groq, elevenlabs, google) as independent rows
3. **Endpoint controls** — historical base URL override inputs (removed in #248)

This meant a user changing the STT provider had to visit multiple visual areas to complete the configuration: pick a provider, then scroll to the right API key, then scroll to the right base URL input. The mental model was fragmented.

## Decision

Introduce **`SettingsSttProviderFormReact`** — a single, self-contained form that owns the full STT configuration lifecycle in one cohesive section:

```
[ STT provider selector     ]
[ STT model selector (filtered to provider's allowlist) ]
[ <Provider> API key        ] [Save]
```

Each other component is narrowed accordingly:

| Component | Before | After |
|-----------|--------|-------|
| `SettingsApiKeysReact` | groq + elevenlabs + google key forms | Google (LLM) key only |
| `SettingsEndpointOverridesReact` | STT URL + LLM URL | removed in #248 |
| `SettingsRecordingReact` (`speech-to-text` section) | provider + model selectors | removed — now in STT form |

## Key Contracts Preserved

Core element IDs and save/status `data-*` hooks remain stable so E2E selectors need only minor behavioural updates (e.g. select provider first before filling elevenlabs key):

- `#settings-transcription-provider` — provider select
- `#settings-transcription-model` — model select
- `#settings-api-key-{provider}` — provider-scoped key input (only the *selected* provider is rendered)
- `[data-api-key-save="{provider}"]`
- `#api-key-save-status-{provider}`

## Model List Derivation

Provider changes automatically switch the model selector to the first entry in `STT_MODEL_ALLOWLIST[provider]` (defined in `shared/domain.ts`). The API key draft value is cleared on provider change to avoid stale key leakage.

## Navigation Hint Updates

`blocked-control.ts` and `native-recording.ts` error strings updated from:

- `"Open Settings > Provider API Keys and save a {Provider} key."` →
  `"Open Settings > Speech-to-Text and save a {Provider} key."`

This matches the renamed section label users see in the UI.

## Consequences

- **Positive**: Provider, model, and key are grouped → lower cognitive load for setup.
- **Positive**: Switching providers is a single-location workflow.
- **Negative**: The unified API key component (`SettingsApiKeysReact`) no longer serves as a universal key store; Google key management is siloed in the LLM section. This is intentional — Google is an LLM provider, not an STT provider.
- **E2E impact**: Tests that previously assumed both `#settings-api-key-groq` and `#settings-api-key-elevenlabs` are simultaneously visible must now switch the provider selector first. Updated in `electron-ui.e2e.ts`.
