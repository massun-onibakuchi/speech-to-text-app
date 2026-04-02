---
title: Unify LLM model selection and reset the transformation pipeline
description: Replace the Google-only transformation and separate cleanup model path with one provider-and-model based LLM transformation system, using Codex CLI for ChatGPT subscription-backed OpenAI access and removing legacy cleanup code completely.
date: 2026-04-02
status: active
review_by: 2026-04-09
tags:
  - plan
  - llm
  - transformation
  - settings
  - ollama
  - openai
  - codex
---

# Unify LLM model selection and reset the transformation pipeline

## Goal

Replace the current split architecture:

- Gemini-only transformation presets
- Google-only LLM API key UI and secret model
- separate Ollama cleanup runtime and model settings

with one clean LLM system:

- one provider + model selection model
- one transformation pipeline
- curated provider/model catalogs
- Codex CLI for ChatGPT subscription-backed auth and execution
- Ollama models participating in transformation instead of cleanup
- no backward-compatibility shims for removed cleanup state

## Locked decisions

- LLM configuration uses `provider + model`
- curated supported models are shown even when unavailable, with unavailable options disabled where applicable
- Ollama uses the existing transformation pipeline semantics, not a cleanup-specific prompt path
- cleanup feature is removed completely
- backward compatibility is not a goal
- ChatGPT subscription support uses Codex CLI rather than browser OAuth
- Dicta does not own OpenAI browser OAuth in this rollout
- the first supported Codex-backed subscription model is `gpt-5.4-mini`

Important interpretation:

- this plan treats subscription-backed OpenAI access as a provider-specific path, not as ordinary OpenAI Platform API-key support
- the plan does not assume `chatgpt.com` Codex backend behavior is a generic stable public API surface for arbitrary apps

## Branch strategy

Integration branch:

- `feature/llm-transformation-reset`

PR targeting rule:

- every ticket PR in this rollout targets `feature/llm-transformation-reset`
- no ticket PR in this rollout should target `main` directly
- merge to `main` happens only after the stacked rollout is complete or intentionally collapsed later

Why:

- the rollout is intentionally breaking and additive-to-destructive
- stacked PRs into the feature branch reduce the risk of landing half-migrated contracts on `main`
- cleanup deletion is blocked on replacement provider paths, so an integration branch keeps intermediate states contained

## Cleaner option considered

Two rollout shapes were considered:

1. one large rewrite PR that removes cleanup, broadens schemas, adds providers, adds OAuth, and rewires UI and runtime in one pass
2. a contract-first rollout of small PRs where each PR changes one layer at a time

This plan chooses option 2.

Why this is cleaner:

- each PR maps to one coherent contract change
- failures are easier to isolate
- provider/auth/runtime complexity stays reviewable
- the most dangerous changes, settings contract and auth contract, get dedicated review

Trade-off:

- temporary intermediate states will exist between merged PRs
- a few files like `specs/spec.md` and shared contracts will rebase frequently

That trade-off is acceptable because the current code has overlapping abstractions and the user explicitly wants legacy code removed rather than carried forward.

Operational note:

- because PRs target the integration branch instead of `main`, temporary intermediate states are acceptable inside the stack as long as the branch remains internally coherent and each PR is reviewable on its own

## Dependency graph

```text
LLM-001 -> LLM-002
LLM-001 -> LLM-003
LLM-001 -> LLM-004
LLM-002 -> LLM-006
LLM-003 -> LLM-005
LLM-003 -> LLM-006
LLM-004 -> LLM-005
LLM-004 -> LLM-006
LLM-005 -> LLM-007
LLM-006 -> LLM-007
LLM-007 -> LLM-008

Can run in parallel:
- LLM-002 and LLM-003 after LLM-001
- LLM-004 after LLM-001
- LLM-005 and LLM-006 only after LLM-002, LLM-003, and LLM-004 are stable

Must remain sequential:
- LLM-005 waits for the new schema/runtime contracts
- LLM-006 waits for the new renderer flow, provider registry, and provider-readiness contract
- LLM-007 is the cleanup removal PR and must land after Ollama transformation and OpenAI subscription paths exist
```

## Priority order

| ID | Title | Priority | Confidence | Depends on | Parallelizable |
| --- | --- | --- | --- | --- | --- |
| LLM-001 | Reset the shared LLM domain contract and record the architecture decision | P0 | 92 | — | No |
| LLM-002 | Replace the Google-only renderer settings and profile UX with unified LLM provider/model controls | P0 | 85 | LLM-001 | Yes |
| LLM-003 | Replace the Gemini-only main-process transformation service with a provider registry | P0 | 88 | LLM-001 | Yes |
| LLM-004 | Introduce a provider credential and readiness contract beyond API keys | P0 | 84 | LLM-001 | Yes |
| LLM-005 | Add Ollama transformation provider and curated local model readiness | P1 | 86 | LLM-003, LLM-004 | No |
| LLM-006 | Add Codex CLI ChatGPT subscription provider support | P1 | 81 | LLM-002, LLM-003, LLM-004 | No |
| LLM-007 | Delete cleanup end to end and remove all legacy code paths | P0 (Blocked) | 90 | LLM-005, LLM-006 | No |
| LLM-008 | Polish regression coverage, docs, and error surfaces for the unified LLM system | P2 | 87 | LLM-007 | Yes |

All PRs for the tickets above target `feature/llm-transformation-reset`.

Confidence flags below 80:

- none; the prior sub-80 risk was the custom browser OAuth path, which this revision removes from scope

OpenAI subscription review note:

- official OpenAI docs clearly support ChatGPT sign-in for Codex CLI
- official OpenAI docs do not describe a generic third-party ChatGPT subscription OAuth flow for arbitrary apps
- therefore `LLM-006` should use Codex CLI as the supported provider boundary rather than custom OAuth

## Ticket details

## LLM-001 - Reset the shared LLM domain contract and record the architecture decision

**Priority**: P0  
**Confidence**: 92  
**PR size target**: medium

### Goal

Create the new source of truth for the LLM system before touching UI or runtime wiring.

### Proposed approach

Introduce an explicit LLM provider/model catalog contract and stop encoding transformation as a Google singleton plus a separate cleanup branch.

This PR should:

- add an ADR for the unified LLM architecture
- replace Google-only transform provider/model schemas with provider/model ids that can cover:
  - `google`
  - `ollama`
  - `openai-subscription`
- keep the current cleanup field temporarily so later replacement PRs have a stable bridge
- keep transformation presets as the place where provider and model are bound
- preserve immutable preset snapshot semantics

This is cleaner than starting in the UI because every other layer depends on these shared types.

### Files in scope

- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/shared/local-llm.ts`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/adr/0004-<slug>.md`
- `src/main/test-support/ipc-round-trip.test.ts`
- `src/shared/domain.test.ts`

### Checklist

- [ ] Add an ADR documenting the unified provider/model design and cleanup deletion decision
- [ ] Replace Google-only transform provider/model picklists with a real LLM provider/model contract
- [ ] Keep cleanup in the shared schema temporarily while introducing the new LLM contract
- [ ] Update IPC types that mention cleanup-only contracts
- [ ] Keep transformation presets as explicit provider/model snapshots
- [ ] Update spec and user-flow docs to match the new durable behavior
- [ ] Add tests for new settings validation and round-trip persistence

### Tasks

1. Add the ADR that defines the new LLM architecture.
2. Refactor shared schemas and defaults for the new LLM contract.
3. Keep cleanup readable until the deletion ticket lands.
4. Update tests and docs for the new schema.

### Definition of Done

- Shared transform provider/model types no longer imply Google-only behavior.
- The architecture decision is recorded in an ADR.
- Validation and IPC round-trip tests reflect the new contract.
- Cleanup deletion remains deferred to `LLM-007`.

### Trade-offs

- Pros: all later work builds on one coherent contract.
- Cons: this intentionally leaves one temporary overlap period where old cleanup state still exists while the new LLM contract is introduced.

### Example snippet

```ts
export const LlmProviderSchema = v.picklist([
  'google',
  'ollama',
  'openai-subscription'
])

export const TransformationPresetSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  provider: LlmProviderSchema,
  model: LlmModelIdSchema,
  systemPrompt: v.string(),
  userPrompt: SafePromptSchema,
  shortcut: v.string()
})
```

## LLM-002 - Replace the Google-only renderer settings and profile UX with unified LLM provider/model controls

**Priority**: P0  
**Confidence**: 85  
**PR size target**: medium

### Goal

Make the Settings UI reflect the new LLM reality:

- one LLM section
- no cleanup section
- real provider selection
- curated model selection per provider

### Proposed approach

Refactor the renderer so profile editing uses a provider-aware catalog rather than hard-coded Google controls.

This PR should:

- rename visible “LLM transformation model” language to `LLM`
- remove the Local Cleanup section from output settings
- make profile editing expose both provider and model as live controls
- show curated provider model options without introducing provider-readiness business logic into the renderer yet
- keep all runtime execution changes out of this PR

This is cleaner than preserving the current split across `settings-output-react` and `settings-api-keys-react`.

### Files in scope

- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/external-settings-merge.ts`
- `src/renderer/settings-validation.ts`
- related renderer tests

### Checklist

- [ ] Remove Local Cleanup UI entirely
- [ ] Rename the LLM settings copy to `LLM`
- [ ] Expose editable provider selection in profiles
- [ ] Expose curated model selection filtered by provider
- [ ] Update dirty-draft and external-merge logic for provider/model edits
- [ ] Add renderer tests for provider switching and model availability states

### Tasks

1. Delete cleanup UI from output settings.
2. Replace the disabled provider field in profile editing with a real provider control.
3. Add provider-specific model option rendering.
4. Update settings mutation helpers for provider changes.
5. Update renderer tests.

### Definition of Done

- Users can choose provider and model in profile editing.
- Cleanup is gone from the renderer.
- The LLM section no longer implies Google-only behavior.
- Tests cover provider/model editing and unavailable-model states.

### Trade-offs

- Pros: aligns UI with the actual contract.
- Cons: renderer work lands before readiness-state UX, so some provider/model states stay visually simple until later tickets.

### Example snippet

```tsx
<Select
  value={draft.provider}
  onValueChange={(provider) => {
    const firstModel = catalog[provider][0]?.id ?? draft.model
    onChangeDraft({ provider, model: firstModel })
  }}
>
```

## LLM-003 - Replace the Gemini-only main-process transformation service with a provider registry

**Priority**: P0  
**Confidence**: 88  
**PR size target**: medium

### Goal

Make runtime provider selection real instead of metadata-only.

### Proposed approach

Replace `TransformationService`’s single-adapter ownership with a provider registry keyed by provider id.

This PR should:

- update transformation input/result contracts to include provider
- route by `provider` and validate model against provider-specific allowlists
- preserve `executeTransformation(...)` as the orchestration seam
- keep prompt building shared across providers
- keep renderer UX changes out of this PR

This is cleaner than stuffing `if provider === ...` branches into the current Gemini service.

### Files in scope

- `src/main/services/transformation-service.ts`
- `src/main/services/transformation/types.ts`
- `src/main/orchestrators/transformation-execution.ts`
- `src/main/orchestrators/transform-pipeline.ts`
- `src/main/services/transformation/gemini-transformation-adapter.ts`
- new provider registry files
- transformation tests

### Checklist

- [ ] Add provider-aware transformation input/result contracts
- [ ] Replace single Gemini adapter ownership with a provider registry
- [ ] Validate provider/model combinations in the runtime layer
- [ ] Preserve shared prompt formatting and failure semantics
- [ ] Add tests for provider dispatch and unsupported model/provider errors

### Tasks

1. Extend transformation types to carry provider.
2. Add a provider registry or map.
3. Refactor the service to dispatch by provider.
4. Update tests to assert provider dispatch behavior.

### Definition of Done

- The main-process runtime genuinely selects adapters by provider.
- Unsupported provider/model combinations are rejected centrally.
- Gemini remains working through the new registry.

### Trade-offs

- Pros: unlocks every later provider addition cleanly.
- Cons: touches the hottest runtime path and must remain carefully tested.

### Example snippet

```ts
const adapter = this.adapters[input.provider]
if (!adapter) {
  throw new Error(`Unsupported LLM provider: ${input.provider}`)
}
return adapter.transform(input)
```

## LLM-004 - Introduce a provider credential and readiness contract beyond API keys

**Priority**: P0  
**Confidence**: 84  
**PR size target**: medium

### Goal

Stop assuming every LLM provider authenticates through a plain API key.

### Proposed approach

Introduce a broader provider readiness/status contract that can represent:

- API key auth
- CLI-backed providers that manage auth outside Dicta
- local runtime availability without credentials

This is the cleanest foundation for both Ollama and ChatGPT subscription access.

Guard rail:

- keep the readiness contract intentionally small and provider-extensible
- do not build a one-size-fits-all universal auth engine in this PR
- provider-specific lifecycle details should remain owned by provider adapters and runtime-specific services

### Files in scope

- `src/main/services/api-key-connection-service.ts`
- `src/shared/ipc.ts`
- new provider-readiness files
- `src/main/ipc/register-handlers.ts`
- `src/renderer/settings-api-keys-react.tsx`
- related tests

### Checklist

- [ ] Introduce a provider readiness/status contract broader than cleanup readiness
- [ ] Keep STT auth intact while broadening the LLM side
- [ ] Separate “credential present” from “provider ready”
- [ ] Define one authoritative source for provider/model availability and readiness outside the renderer
- [ ] Add tests for API-key, CLI-backed, and local-runtime style providers

### Tasks

1. Design a provider readiness snapshot IPC contract.
2. Preserve current STT behavior while broadening LLM readiness behavior.
3. Add CLI-oriented readiness states without owning CLI credentials.
4. Update tests and any renderer consumers.

### Definition of Done

- The app no longer assumes every LLM provider needs a plain API key.
- A provider can report readiness through API key, CLI availability/login state, or local runtime availability.
- Existing STT providers still work unchanged.
- Renderer consumers receive normalized readiness/availability data instead of rebuilding provider truth locally.

### Trade-offs

- Pros: fixes the deepest contract problem once.
- Cons: the readiness surface gets broader and needs careful naming to avoid pretending Dicta owns third-party auth it does not.

### Example snippet

```ts
type ProviderCredential =
  | { type: 'api_key'; value: string }
  | { type: 'external_cli'; executable: 'codex' }
  | { type: 'none' }
```

## LLM-005 - Add Ollama transformation provider and curated local model readiness

**Priority**: P1  
**Confidence**: 86  
**PR size target**: medium

### Goal

Move curated Ollama models into the real transformation system.

### Proposed approach

Reframe the local model catalog as an Ollama transformation provider catalog and plug the existing local runtime into the transformation registry.

This PR should:

- move cleanup-only model types into provider/model catalog types
- adapt the Ollama runtime from cleanup JSON output into transformation output
- expose curated model availability through provider readiness
- keep unavailable curated models visible but disabled
- make the provider catalog and readiness boundary authoritative for model availability truth

This is cleaner than preserving any cleanup-specific catalog or “shared model list, separate executor” split.

### Files in scope

- `src/shared/local-llm.ts`
- `src/main/services/local-llm/catalog.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- new Ollama transformation adapter files
- `src/main/ipc/register-handlers.ts`
- renderer model-selection consumers
- Ollama runtime tests

### Checklist

- [ ] Reframe the local model catalog as transformation-capable models
- [ ] Add Ollama transformation adapter wiring
- [ ] Expose provider readiness and installed-model state for Ollama
- [ ] Keep curated unavailable models visible but disabled in the UI
- [ ] Add tests for installed and missing curated-model states

### Tasks

1. Rename cleanup-only local model concepts to provider-agnostic or Ollama-specific transform concepts.
2. Add the Ollama transform adapter to the provider registry.
3. Surface installed vs unavailable models through readiness IPC.
4. Update tests.

### Definition of Done

- Ollama models are selectable LLM transformation models.
- Cleanup-specific local model concepts are gone.
- The renderer can show curated installed and unavailable Ollama models correctly.

### Trade-offs

- Pros: uses existing runtime work instead of rewriting it from scratch.
- Cons: requires careful renaming to avoid leaving cleanup semantics behind.

### Example snippet

```ts
export const SUPPORTED_OLLAMA_LLM_MODELS = [
  { id: 'qwen3.5:2b', label: 'Qwen 3.5 2B' },
  { id: 'sorc/qwen3.5-instruct:0.8b', label: 'Sorc Qwen 3.5 Instruct 0.8B' }
] as const
```

## LLM-006 - Add Codex CLI ChatGPT subscription provider support

**Priority**: P1  
**Confidence**: 81  
**PR size target**: medium

### Goal

Add a subscription-backed OpenAI provider path through Codex CLI instead of custom browser OAuth.

### Proposed approach

Implement `openai-subscription` as a CLI-backed provider rather than a fake API-key provider or custom browser OAuth provider.

This PR should:

- detect whether `codex` is installed
- detect whether the local Codex session is logged in enough to run non-interactive transforms
- add a dedicated transformation adapter that shells out to Codex CLI with the curated supported model `gpt-5.4-mini`
- expose model selection only after readiness succeeds
- keep the slice minimal and guarded:
  - provider wiring
  - readiness reporting
  - one guarded execution path
  - no broad polish or secondary auth modes

This is cleaner than pretending a ChatGPT subscription can power a normal API-key OpenAI adapter, and cleaner than owning unsupported browser OAuth ourselves.

Risk note:

- This ticket is above the earlier OAuth confidence level, but it still depends on Codex CLI command stability.
- The implementation should avoid baking Codex CLI command details into the generic provider architecture.
- Keep the first PR narrow so process spawning, timeout handling, and output normalization stay reviewable.

### Files in scope

- `src/main/services/codex-cli-service.ts`
- `src/main/ipc/register-handlers.ts`
- provider readiness service
- renderer LLM provider settings UI
- provider readiness IPC
- CLI and provider tests
- spec updates
- `docs/adr/0011-use-codex-cli-for-chatgpt-subscription-access.md`

### Checklist

- [ ] Add Codex CLI availability and login detection for the ChatGPT subscription provider
- [ ] Expose subscription-backed readiness state to the renderer
- [ ] Gate model selection on readiness
- [ ] Route transformation execution through Codex CLI for one curated model: `gpt-5.4-mini`
- [ ] Add tests for install missing, login missing, and execution failure states
- [ ] Update docs/spec wording to distinguish subscription auth from API-key auth

### Tasks

1. Add Codex CLI availability and login checks.
2. Add provider readiness reporting.
3. Add the subscription transformation adapter on top of Codex CLI.
4. Update renderer provider guidance UI.
5. Add tests and docs.

### Definition of Done

- Users can use the subscription-backed provider through an installed and logged-in Codex CLI.
- The provider only appears ready after Codex CLI is available and logged in.
- The implementation is guarded and vertically sliced rather than attempting the full final UX surface in one PR.

### Trade-offs

- Pros: matches the chosen product direction while staying on an officially documented Codex sign-in path.
- Cons: depends on local CLI installation, process execution, and output-contract stability.

### Example snippet

```ts
type ProviderReadiness =
  | { kind: 'ready' }
  | { kind: 'cli_not_installed'; message: string }
  | { kind: 'cli_login_required'; message: string }
```

## LLM-007 - Delete cleanup end to end and remove all legacy code paths

**Priority**: P0  
**Confidence**: 90  
**PR size target**: medium

### Goal

Finish the reset by removing cleanup from the codebase instead of leaving dead compatibility scaffolding behind.

### Proposed approach

Delete cleanup from:

- settings schema
- renderer settings UI
- IPC contracts
- capture snapshots
- capture pipeline
- local runtime type names
- docs and tests

This PR should be deletion-heavy and should not add new provider behavior. New provider behavior must already exist before this lands.

Blocked-by note:

- This is a `P0` cleanup goal, but it is intentionally blocked until `LLM-005` and `LLM-006` have replaced the removed functionality.
- During earlier tickets, tolerant reads or temporary bridging behavior are acceptable even though long-term backward compatibility is not a product goal.

### Files in scope

- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/shared/local-llm.ts`
- `src/main/core/command-router.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/ipc/register-handlers.ts`
- `src/renderer/settings-output-react.tsx`
- `specs/spec.md`
- `specs/user-flow.md`
- cleanup-specific tests and docs

### Checklist

- [ ] Remove cleanup from settings, IPC, snapshots, and runtime code
- [ ] Remove cleanup UI from Settings
- [ ] Remove cleanup execution from capture processing
- [ ] Rename any leftover cleanup-oriented local runtime symbols
- [ ] Remove or replace cleanup docs/tests that no longer describe shipped behavior
- [ ] Ensure capture still works with transcript and transformed output modes

### Tasks

1. Delete cleanup schema and default values.
2. Delete cleanup UI and IPC handlers.
3. Delete cleanup capture-pipeline stage.
4. Rename leftover local-LLM runtime symbols if they still mention cleanup.
5. Update docs and tests.

### Definition of Done

- There is no cleanup feature in the codebase or user-facing docs.
- Capture goes directly from dictionary replacement to optional transformation.
- No cleanup-specific dead code remains.

### Trade-offs

- Pros: fulfills the “no backward-compatibility, no legacy code” requirement cleanly.
- Cons: this is intentionally breaking for old settings and requires the earlier PRs to have fully replaced the feature.

### Example snippet

```ts
const snapshot = createCaptureRequestSnapshot({
  // no cleanup field
  transformationProfile: this.resolveTransformationProfile(settings),
  output: settings.output
})
```

## LLM-008 - Polish regression coverage, docs, and error surfaces for the unified LLM system

**Priority**: P2  
**Confidence**: 87  
**PR size target**: small

### Goal

Tighten the edges after the core architecture lands.

### Proposed approach

Use one final PR to reduce maintenance risk:

- add missing regression tests
- normalize user-facing errors
- clean up spec/user-flow language left behind from the transition

This is cleaner than mixing polish into the contract-reset PRs.

### Files in scope

- targeted tests across renderer and main
- `specs/spec.md`
- `specs/user-flow.md`
- any residual doc or error-formatting files

### Checklist

- [ ] Add missing regression tests for mixed provider/model states
- [ ] Normalize user-facing error copy for readiness/auth/runtime failures
- [ ] Remove stale wording left over from cleanup or Google-only assumptions
- [ ] Confirm docs and tests match shipped behavior

### Tasks

1. Add targeted regression tests.
2. Normalize cross-provider error messages.
3. Final doc pass.

### Definition of Done

- The unified LLM system is covered by focused regression tests.
- Docs and error messages match the shipped behavior.
- No stale cleanup or Google-only wording remains.

### Trade-offs

- Pros: keeps cleanup work from bloating core architectural PRs.
- Cons: some polish waits until late in the rollout.

### Example snippet

```ts
expect(result.message).toBe(
  'LLM provider is not ready. Complete authentication or start the local runtime, then retry.'
)
```

## Risk notes

### Backward compatibility

- Intentionally broken by design.
- Persisted cleanup fields and Google-only assumptions will be removed instead of migrated.

### Forward compatibility

- Better than today if provider, model, auth, and readiness are separated cleanly.
- Worse than today if Codex CLI command assumptions are hard-coded into an otherwise generic provider layer.

### Maintainability

- Improves if provider catalogs, provider readiness, credentials, and adapters are separate modules.
- Degrades if Codex CLI checks, Ollama runtime checks, and API-key logic are mixed into one generic service.

## Recommended implementation order

1. `LLM-001`
2. `LLM-002` and `LLM-003` in parallel
3. `LLM-004`
4. `LLM-005` and `LLM-006` in parallel, after `LLM-002`, `LLM-003`, and `LLM-004`
6. `LLM-007`
7. `LLM-008`

The key discipline is to avoid starting cleanup deletion before replacement provider paths are in place. That keeps each PR reviewable and prevents a broken midpoint from lingering on `main`.
