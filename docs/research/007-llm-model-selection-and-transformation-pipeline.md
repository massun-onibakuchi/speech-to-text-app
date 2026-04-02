---
title: Study LLM model selection and transformation pipeline
description: Trace the current LLM settings, preset selection, IPC routing, execution, and cleanup interplay to document how Dicta actually selects models and runs transformations today.
date: 2026-04-02
status: concluded
tags:
  - research
  - llm
  - transformation
  - settings
  - ipc
  - renderer
  - main-process
---

# Summary

Dicta currently presents transformation as a multi-provider, multi-preset concept in its spec and settings shape, but the shipped implementation is materially narrower:

- preset data stores `provider` and `model`
- the UI only exposes `google` and `gemini-2.5-flash`
- the main-process transformation service only instantiates a Gemini adapter
- the secret store, API-key UI, and connection testing only support a Google LLM key
- local Ollama models live in a separate cleanup feature, not in the transformation provider/model path

That split creates the central architectural tension for the upcoming rewrite:

- the data model already wants unified provider and model selection
- the runtime still treats LLM transformation as a single-provider Gemini lane
- the capture path has a second local-LLM branch for cleanup that mutates text before transformation instead of participating in the transformation contract

The codebase is therefore half-way between two designs:

1. a single-provider Google transformation app with an unrelated local cleanup sidecar
2. a true multi-provider LLM system with unified provider/model selection

The proposed reset should finish the transition to option 2 and remove the partial abstractions that currently over-promise.

# Scope and method

I traced the flow across:

- durable behavior in `specs/spec.md` and `specs/user-flow.md`
- shared settings and IPC contracts
- renderer settings, profiles, autosave, and external-merge behavior
- main-process routing, preflight, execution, and adapter ownership
- capture-time cleanup interplay
- scratch-space transformation execution
- local cleanup model catalog and diagnostics

Primary files read in depth:

- `specs/spec.md`
- `specs/user-flow.md`
- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/shared/local-llm.ts`
- `src/main/services/settings-service.ts`
- `src/main/core/command-router.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/routing/transformation-request-snapshot.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/transformation-execution.ts`
- `src/main/orchestrators/transform-pipeline.ts`
- `src/main/orchestrators/preflight-guard.ts`
- `src/main/services/transformation-service.ts`
- `src/main/services/transformation/types.ts`
- `src/main/services/transformation/gemini-transformation-adapter.ts`
- `src/main/services/api-key-connection-service.ts`
- `src/main/services/secret-store.ts`
- `src/main/services/local-llm/catalog.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/scratch-space-service.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/settings-validation.ts`
- `src/renderer/external-settings-merge.ts`

# Expected product model from the spec

The spec claims a larger architecture than the current implementation actually delivers.

Key requirements in `specs/spec.md`:

- v1 runtime supports multiple LLM APIs through adapters
- v1 UI currently exposes Google only
- each transformation preset stores `provider`, `model`, `systemPrompt`, and `userPrompt`
- runtime transformation must resolve provider/model/prompt fields from the bound preset snapshot
- a global provider/model default must not override persisted presets
- capture-time transformation is derived from `output.selectedTextSource`
- local cleanup runs after dictionary replacement and before any capture-time transformation

Relevant user flows in `specs/user-flow.md`:

- default recording can end with transcript-only output
- when `selectedTextSource=transformed`, capture continues into transformation using `defaultPresetId`
- standalone transform shortcuts resolve `defaultPresetId` and enqueue a frozen profile snapshot
- scratch space resolves its own preset and runs transformation with forced copy-and-paste output
- local cleanup is configured separately and sits before transformation

# Current architecture map

## 1. Shared settings model

`src/shared/domain.ts` is the real source of truth for persisted LLM settings.

Current shape:

- transformation settings:
  - `defaultPresetId`
  - `lastPickedPresetId`
  - `presets[]`
- each preset stores:
  - `id`
  - `name`
  - `provider`
  - `model`
  - `systemPrompt`
  - `userPrompt`
  - `shortcut`
- output settings choose whether capture emits `transcript` or `transformed`
- cleanup settings are stored separately in `src/shared/local-llm.ts`

Important current constraints:

- `TransformProviderSchema = ['google']`
- `TransformModelSchema = ['gemini-2.5-flash']`
- `TRANSFORM_MODEL_ALLOWLIST.google = ['gemini-2.5-flash']`
- default preset hard-codes `provider: 'google'` and `model: 'gemini-2.5-flash'`

Implication:

- the shared schema already models provider and model as first-class preset fields
- but the allowed domain is a one-provider, one-model singleton

That means the transformation data model is structurally extensible but behaviorally locked down.

## 2. Persistence and startup normalization

`src/main/services/settings-service.ts` validates persisted settings against the current schema at startup and on every save.

Important behavior:

- startup parses and validates the entire settings object
- invalid persisted settings crash startup and trigger the “Settings Incompatible” error path in `register-handlers.ts`
- cleanup currently gets special startup normalization through `normalizeMissingCleanupSettings`
- transformation does not get equivalent migration logic beyond the schema fallback behavior in renderer pointer normalization

Implication for the reset:

- removing cleanup and changing transformation provider/model contracts is not a cosmetic change
- startup persistence rules are strict enough that schema changes will break old settings unless the app intentionally discards or rewrites them
- since backward compatibility is intentionally out of scope, the implementation can remove migration shims instead of carrying legacy normalization

## 3. Renderer ownership of transformation settings

The renderer is the owner of most non-secret settings editing behavior.

### Profiles UI

`src/renderer/profiles-panel-react.tsx` exposes transformation presets as editable profiles.

Current behavior:

- users can create, edit, delete, and choose the default preset
- the card footer displays `provider/model`
- the edit form renders a provider control, but it is disabled and fixed to `google`
- the model select only offers `gemini-2.5-flash`
- new presets are always created with:
  - `provider: 'google'`
  - `model: 'gemini-2.5-flash'`

This is a visible example of partial abstraction:

- the UI shape pretends provider selection exists
- the actual editing experience does not allow provider selection

### Autosave and draft mutation

`src/renderer/renderer-app.tsx` plus `src/renderer/settings-mutations.ts` own draft state, validation, autosave, and API-key mutation flows.

Important behavior:

- non-secret settings changes debounce-save through `window.speechToTextApi.setSettings`
- profile edits validate prompt safety before save
- default-preset changes persist immediately and can trigger the default-profile sound
- transcription provider changes auto-switch to the first allowed STT model
- there is no equivalent generic LLM provider/model mutation helper because the LLM lane is not generic in the renderer

### External settings merge

`src/renderer/external-settings-merge.ts` only considers these transformation fields safe for cross-process merge:

- `defaultPresetId`
- `lastPickedPresetId`

It does not merge preset bodies, provider/model definitions, or other transformation config while local edits are dirty.

Implication:

- any redesign that centralizes LLM provider/model state outside presets will need a new merge policy
- the current merge logic is pointer-oriented, not provider-catalog-oriented

## 4. Secret and API-key model

The LLM auth path is even narrower than the preset schema.

`src/shared/ipc.ts` defines:

- `ApiKeyProvider = 'groq' | 'elevenlabs' | 'google'`

`src/main/services/secret-store.ts` persists:

- `GROQ_APIKEY`
- `ELEVENLABS_APIKEY`
- `GOOGLE_APIKEY`

`src/main/services/api-key-connection-service.ts` validates:

- Groq API key
- ElevenLabs API key
- Google Gemini API key

`src/renderer/settings-api-keys-react.tsx` only renders:

- one Google Gemini key control for the LLM side

Implication:

- the LLM auth model is currently “Google key only”
- adding Ollama transformation, OpenAI subscription auth, or future providers is not just a profile-editor problem
- the auth/storage/validation contract must be broadened or replaced

## 4.1 Focused review: OpenAI subscription OAuth

This area needs special caution.

### What official OpenAI sources clearly support

Official OpenAI materials confirm these points:

- ChatGPT billing and Platform API billing are separate systems
- ChatGPT Plus/Pro includes Codex access in official Codex clients
- the official Codex CLI prompts the user to sign in with ChatGPT or an API key
- OpenAI also documents a Codex CLI sign-in flow that links the ChatGPT identity to API usage for the official CLI experience

What that does not automatically prove:

- that a third-party desktop app should implement its own ChatGPT subscription OAuth flow
- that `chatgpt.com` Codex backend endpoints are a stable public integration surface for external apps

### What `opencode` actually implements

The `opencode` Codex plugin is more specific and more fragile than a generic “OpenAI OAuth” label suggests.

Confirmed behavior from `packages/opencode/src/plugin/codex.ts`:

- issuer: `https://auth.openai.com`
- callback model: local loopback server on port `1455`
- auth flow: PKCE-based browser OAuth
- token exchange and refresh: `POST /oauth/token`
- request target rewrite: `https://chatgpt.com/backend-api/codex/responses`
- account selection support:
  - parses `chatgpt_account_id` from token claims
  - sends `ChatGPT-Account-Id` header when available
- auth storage model:
  - stores `access`
  - stores `refresh`
  - stores `expires`
  - optionally stores `accountId`
- model exposure is filtered for OAuth-authenticated OpenAI usage instead of exposing the full upstream model list

This is not the same as:

- calling `platform.openai.com` with a normal API key
- using an officially documented public OAuth flow for arbitrary third-party apps

### What this means for Dicta

If Dicta adopts subscription-backed OpenAI support without CLI indirection, it is not implementing a standard OpenAI Platform provider. It is implementing a provider-specific ChatGPT/Codex auth and transport path that happens to be related to OpenAI.

That distinction matters because:

- the auth semantics are different
- the billing semantics are different
- the runtime endpoint semantics are different
- the maintenance risk is different

### Risk assessment

This approach has materially higher risk than API-key providers or Ollama:

1. upstream endpoint drift risk
   - `chatgpt.com/backend-api/codex/responses` is not the same integration surface as the standard OpenAI Platform API
2. account-header coupling risk
   - `ChatGPT-Account-Id` handling appears important for some account shapes
3. loopback callback risk
   - local loopback auth adds port, lifecycle, timeout, and failure-mode handling
4. token lifecycle risk
   - refresh tokens and expiry handling become part of the app’s credential surface
5. abstraction pollution risk
   - if the generic provider layer is shaped around this one provider too early, simpler API-key and local-runtime providers become harder to maintain

### Cleaner framing for the implementation plan

The cleanest way to treat this in the rollout is:

- provider id: `openai-subscription` or equivalent provider-specific naming
- auth mode: browser OAuth only for the first phase
- runtime scope: narrow guarded vertical slice
- avoid presenting it as “OpenAI API support” in the generic API-key sense

That keeps the rest of the provider architecture honest.

## 5. Main-process transformation execution

The main-process execution path is split into three layers:

### Service layer

`src/main/services/transformation-service.ts`

Current behavior:

- instantiates one adapter: `GeminiTransformationAdapter`
- validates the input model against `TRANSFORM_MODEL_ALLOWLIST.google`
- then forwards all requests to that one adapter

This is the largest implementation mismatch in the codebase:

- the spec says adapter-level multi-provider architecture
- the service is still effectively `GeminiTransformationService`

### Adapter contract

`src/main/services/transformation/types.ts`

Current contract:

- `TransformationInput` includes `text`, `apiKey`, `model`, `baseUrlOverride`, and prompt fields
- `TransformationResult` only returns `text` and `model`
- `provider` is not part of the request contract or result contract at this layer

That omission matters:

- the orchestration layers track provider for preflight and logging
- the service layer itself ignores provider and cannot dispatch on it

### Gemini adapter

`src/main/services/transformation/gemini-transformation-adapter.ts`

Current behavior:

- builds prompt blocks from the shared prompt formatter
- injects system prompt only when non-empty
- sends a `generateContent` request to the Gemini endpoint
- authenticates with `x-goog-api-key`
- concatenates the first candidate parts into one transformed text string

This is the only shipped LLM transformation runtime today.

## 6. Prompt semantics

The prompt builder is intentionally simple.

`src/main/services/transformation/prompt-format.ts`:

- validates the user prompt template with `validateSafeUserPromptTemplate`
- requires one safe `{{text}}` placeholder boundary
- XML-escapes the source text before insertion
- returns one prompt block

Implication:

- prompt semantics are already provider-neutral enough to reuse for Ollama and future providers
- the current “Gemini only” limitation is not caused by prompt formatting
- the next design should preserve this shared prompt-building stage and keep provider-specific transport below it

## 7. Preflight and failure classification

`src/main/orchestrators/preflight-guard.ts` centralizes transformation preflight.

Current LLM rules:

- provider must exist in `TRANSFORM_MODEL_ALLOWLIST`
- model must be in that provider’s allowlist
- API key must exist for the provider

Current classification:

- HTTP 401/403 -> `api_auth`
- network signatures -> `network`
- everything else -> `unknown`

Important limitation:

- local runtimes like Ollama do not fit the “API key required” assumption
- ChatGPT subscription OAuth also does not fit the “raw API key lookup” assumption

So the current preflight layer will need a real provider-auth strategy instead of a single API-key check.

## 8. Snapshot binding and routing

`src/main/core/command-router.ts` is the point where settings become immutable execution snapshots.

### Standalone transformation shortcuts

For clipboard and selection transforms:

- resolve preset from `defaultPresetId` or explicit preset id
- validate non-empty source text
- validate prompt safety
- create a frozen `TransformationRequestSnapshot`
- enqueue into `TransformQueue`

Snapshot fields include:

- `provider`
- `model`
- `systemPrompt`
- `userPrompt`
- transformed output rule

### Capture-time transformation

For audio captures:

- build a `CaptureRequestSnapshot`
- include STT settings and dictionary entries
- include full `cleanup` settings
- derive `transformationProfile` only when `output.selectedTextSource === 'transformed'`

Implication:

- capture-time transformation is not toggled independently
- it is derived entirely from output-source selection
- cleanup is a separate sibling branch inside the capture snapshot, not part of the transformation profile

## 9. Capture pipeline sequencing

`src/main/orchestrators/capture-pipeline.ts` currently runs:

1. STT preflight and transcription
2. dictionary replacement
3. optional cleanup
4. optional transformation
5. output commit
6. history append

That sequencing is critical to the planned redesign.

Current rules:

- cleanup only runs when `snapshot.cleanup.enabled`
- cleanup uses the local model id from `snapshot.cleanup.localModelId`
- transformation only runs when `snapshot.transformationProfile !== null`
- if transformation fails, transcript output is still preserved
- if `selectedTextSource='transformed'` but transformed text is missing, capture output falls back to transcript

Current architectural consequence:

- Ollama models do not participate in the transformation adapter system
- they only participate in the capture pipeline as a pre-transform mutation step

That is the main structural reason the current app feels split-brain.

## 10. Standalone transform pipeline

`src/main/orchestrators/transform-pipeline.ts` runs:

1. `executeTransformation(...)`
2. output application using transformed output rule
3. success or error publication

Unlike capture:

- no cleanup branch exists here
- no transcript fallback exists because there is no transcript concept
- success and failure are about one explicit transformation action only

This pipeline is the stronger foundation for the future unified LLM design.

## 11. Scratch-space transformation

`src/main/services/scratch-space-service.ts` reuses the shared transformation execution helper.

Current behavior:

- scratch-space transcription uses STT + dictionary replacement only
- scratch-space transformation resolves a preset by `presetId`
- it calls the same `executeTransformation(...)` helper as the main transform flows
- output is forced to `copyToClipboard=true` and `pasteAtCursor=true`

Important detail:

- scratch space already demonstrates that transformation semantics can be reused independently of capture output settings
- that makes it a good downstream consumer for any unified LLM provider contract

## 12. IPC and settings diagnostics for cleanup

`src/shared/ipc.ts` and `src/main/ipc/register-handlers.ts` expose cleanup as a dedicated readiness surface:

- `getLocalCleanupStatus()`
- status kinds for runtime availability and model readiness
- available cleanup models

The renderer consumes that in `src/renderer/settings-output-react.tsx`, which:

- renders output mode and output destinations
- also renders the entire Local Cleanup settings block
- lets the user toggle cleanup separately from transformation
- lets the user refresh Ollama readiness and choose a cleanup model

This is the highest-friction UI area for the redesign because it mixes two unrelated concerns:

- “what text should Dicta output?”
- “should Dicta run a local cleanup pass before transformation?”

The target reset explicitly removes this split.

## 13. Local model catalog today

`src/shared/local-llm.ts` and `src/main/services/local-llm/catalog.ts` currently define the local catalog only for cleanup.

Supported models:

- `qwen3.5:2b`
- `qwen3.5:4b`
- `sorc/qwen3.5-instruct:0.8b`
- `sorc/qwen3.5-instruct-uncensored:2b`

Important current constraints:

- runtime ids: `['ollama']`
- max supported local models: 5
- catalog metadata is task-scoped to `supportedTasks: ['cleanup']`

Implication:

- the catalog already contains almost everything needed for the first Ollama transformation allowlist
- but the type names and metadata frame them as cleanup-only models

# Current end-to-end flows

## A. Capture with transcript output

1. user records audio
2. command router snapshots STT settings, cleanup settings, output settings, and maybe transformation profile
3. capture pipeline transcribes and applies dictionary replacement
4. if cleanup enabled, pipeline may mutate transcript with Ollama
5. if `selectedTextSource='transcript'`, no transformation profile is bound
6. output service applies transcript destinations

## B. Capture with transformed output

1. same capture snapshot creation
2. after STT and dictionary replacement, cleanup may run first
3. bound preset provider/model/prompt are executed through the Gemini service
4. output uses transformed text when non-empty
5. if transform fails, output falls back to transcript

## C. Clipboard transform shortcut

1. command router resolves default preset
2. prompt safety is validated
3. frozen transformation snapshot is enqueued
4. transform queue runs shared transformation execution
5. output uses transformed rule only

## D. Scratch-space transform

1. scratch space resolves preset by id
2. shared execution helper runs transformation
3. output is forced to copy and paste
4. draft is cleared only after successful paste

# Confirmed design mismatches and constraints

## 1. The spec overstates current multi-provider support

The spec says:

- multiple LLM APIs through adapters
- presets persist provider and model

The implementation actually does:

- one LLM provider in schema: `google`
- one LLM model in schema: `gemini-2.5-flash`
- one runtime adapter in service: Gemini
- one saved LLM key in secrets/UI: Google

The abstraction exists, but only as shape, not as behavior.

## 2. Provider is stored where runtime cannot truly use it

Presets persist `provider`, but:

- transformation service does not dispatch by provider
- transformation input/result types omit provider
- adapter selection does not depend on provider

So the provider field is currently declarative metadata, not an execution selector.

## 3. Local models are isolated behind cleanup instead of participating in transformation

Ollama models already have:

- a curated catalog
- readiness checks
- supported-model rendering
- runtime execution wiring

But all of that is trapped behind cleanup-only contracts and only reachable inside capture.

## 4. The current auth model assumes “remote provider with API key”

That assumption works for Google but does not work for:

- Ollama local runtime
- browser-OAuth ChatGPT subscription auth
- any provider with non-key credentials

## 5. Output selection and transformation selection are coupled in a specific way

Today:

- capture-time transformation happens only when `output.selectedTextSource='transformed'`
- there is no separate “auto-transform” toggle

That coupling is important and should be preserved unless product behavior intentionally changes.

## 6. Cleanup and transformation are not symmetrical

Transformation:

- has presets
- participates in standalone shortcuts
- has queue-based execution
- has output contract

Cleanup:

- has dedicated settings
- only runs in capture
- is best-effort
- has no preset system
- has no standalone execution path

That asymmetry is exactly why removing cleanup entirely is cleaner than trying to “generalize” it.

# Implications for the planned rewrite

## 1. The clean target is one LLM provider/model contract, not two parallel systems

The current split between:

- preset-based transformation
- cleanup-specific local models

should collapse into one LLM system with:

- one provider id
- one model id
- one auth/readiness mechanism per provider
- one transformation execution contract

## 2. Ollama should join the transformation provider catalog, not remain a sidecar

The existing local model catalog can become the initial curated Ollama transformation model catalog.

That is cleaner than:

- keeping cleanup-specific settings
- adding separate local transform settings
- or trying to keep “cleanup model” and “transform model” in sync

## 3. Browser OAuth for ChatGPT subscription must be modeled as a provider auth mode, not as an API-key variant

The future OpenAI subscription path does not fit the current `google` API-key pattern.

That means the redesign needs a broader provider auth contract, not another branch in `SecretStore.getApiKey(...)`.

## 4. The strict settings startup path favors hard deletion of legacy fields over compatibility shims

Because startup validation is strict and backward compatibility is intentionally dropped:

- removing `cleanup` from the settings schema is preferable to preserving normalization shims
- removing Google-only assumptions from presets and key storage should happen as a coherent contract reset, not as layers of compatibility code

## 5. The shared transformation helper is a good seam to preserve

`executeTransformation(...)` is already the best reusable boundary in the system:

- prompt safety
- preflight
- adapter call
- failure classification

The redesign should preserve that seam and replace the provider-specific internals beneath it.

# Open technical questions for implementation

These questions are still implementation-facing, not research blockers:

1. Should auth state move from `SecretStore` into a broader `ProviderCredentialStore` that can handle API keys, OAuth tokens, and runtime-local providers?
2. Should the LLM settings surface keep provider/model inside presets only, or also add a top-level “default LLM” selector that presets can reference?
3. Should the curated Ollama model list remain hard-coded in the app, or move into a provider catalog manifest that also covers remote providers?
4. Should browser-OAuth ChatGPT subscription support be a distinct provider id such as `openai-subscription`, or should it be an auth mode under a broader `openai` provider?

Given the current codebase, the cleaner option appears to be:

- one provider catalog
- one credential model per provider
- one transformation contract
- one preset schema that still stores explicit provider/model
- a provider-specific subscription-backed OpenAI path rather than a generic “OpenAI API” abstraction

# Recommended design principles for the rollout plan

1. Remove cleanup entirely instead of trying to repurpose its settings and IPC.
2. Introduce a real provider registry before adding more models or auth modes.
3. Separate provider auth/readiness from provider execution.
4. Keep preset-bound provider/model snapshots immutable at enqueue time.
5. Preserve the current output-selection rule where capture-time transformation is driven by `output.selectedTextSource`.
6. Treat browser OAuth for ChatGPT subscription as a first-class provider auth path, not as a fake API-key flow.
7. Keep each PR narrow: shared contract reset, UI reset, provider runtime expansion, auth expansion, then cleanup deletion.

# Bottom line

The current code already contains most of the structural pieces needed for a unified LLM system:

- provider/model fields in presets
- frozen transformation snapshots
- shared transformation execution helper
- local Ollama model catalog
- queue-based main-process execution

But those pieces are split across two different designs:

- Gemini transformation
- Ollama cleanup

The rewrite should not “add more providers” on top of that split. It should remove the split first, then make providers real.
