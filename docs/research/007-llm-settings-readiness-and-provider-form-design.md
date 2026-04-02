---
title: Study LLM settings structure and local-model readiness flow
description: Trace the current LLM settings UI, cleanup readiness checks, and capture-time cleanup behavior, then document the constraints and design direction for a simpler STT-like provider/model surface.
date: 2026-04-02
status: concluded
links:
  decision: "0005"
tags:
  - research
  - settings
  - llm
  - local-llm
  - ollama
  - ui
---

# Summary

The current LLM settings surface is structurally inconsistent with the STT settings surface even though both already use dropdown-based provider and model selection.

STT is a single cohesive form:

- provider dropdown
- model dropdown
- API key field for the selected provider

LLM is not. It is currently split into two different concepts inside one `LLM Transformation` section:

- a local-cleanup form for Ollama
- a separate Google Gemini API key form for cloud transformation

That split is why the LLM area feels more complex than STT even though the underlying controls are already mostly dropdown-based.

The most important technical finding is that the current local LLM area is not just a provider/model selector. It also owns runtime readiness diagnostics for Ollama. Those readiness states are fetched over IPC, reflected in the Settings UI, and loosely coupled to capture-time cleanup execution. Any redesign that simplifies the UI still needs to preserve those readiness semantics or replace them with an equally actionable flow.

The requested direction is compatible with the current architecture:

- make LLM provider/model selection feel as simple as STT
- prefer dropdowns for provider and model choice
- keep dedicated sections for cloud subscription and Ollama when necessary

The current codebase can support that direction, but the redesign has to account for the fact that local cleanup has stateful runtime prerequisites that STT and cloud LLM configuration do not.

# Scope and method

I traced the current implementation across:

- product docs: `specs/spec.md`, `specs/user-flow.md`
- architecture context: `docs/adr/0005-llm-settings-use-provider-form-shape.md`
- prior local-LLM investigations: `docs/research/004-local-llm-cleanup-electron.md`, `docs/research/006-local-cleanup-silent-failure.md`
- renderer settings UI
- shared Settings and IPC contracts
- main-process readiness handler
- capture snapshot creation
- capture pipeline cleanup execution

Files read in depth:

- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-llm-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/shared/domain.ts`
- `src/shared/local-llm.ts`
- `src/shared/ipc.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/core/command-router.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- related renderer tests

# What exists today

## 1. STT settings are already the reference shape

The STT section is the cleanest provider configuration surface in the app.

Behavior:

- provider is selected with a dropdown
- model is selected with a dropdown filtered by the provider allowlist
- the currently selected provider owns the visible API key field
- switching provider also switches the available model list

This behavior is implemented in `src/renderer/settings-stt-provider-form-react.tsx`.

That form is conceptually simple because every field belongs to the same abstraction: one selected STT provider.

## 2. LLM settings are conceptually split

The `LLM Transformation` section currently renders two separate components in `src/renderer/app-shell-react.tsx`:

1. `SettingsLlmProviderFormReact`
2. `SettingsApiKeysReact`

Those components correspond to different responsibilities:

- `SettingsLlmProviderFormReact` manages local transcript cleanup for Ollama
- `SettingsApiKeysReact` manages the Google Gemini API key used by transformation presets

That means the section title suggests one cohesive LLM setup area, but the actual content spans two different systems:

- local cleanup runtime configuration
- cloud transformation authentication

This is the main reason the section reads as more complex than the STT section.

## 3. Provider/model dropdowns already exist in the LLM cleanup form

The user request prefers dropdowns for provider and model selection. The current cleanup form already does that:

- `settings.cleanup.runtime` is selected via Radix `Select`
- `settings.cleanup.localModelId` is selected via Radix `Select`

So the main design problem is not that the LLM area lacks dropdowns. The problem is that the surrounding structure is not simple provider/model configuration.

## 4. The local LLM form is cleanup-specific, not generic LLM configuration

`src/renderer/settings-llm-provider-form-react.tsx` is built around `settings.cleanup`, not around the transformation provider system.

Its controls are:

- enable local transcript cleanup
- LLM provider dropdown, currently only `ollama`
- refresh readiness button
- readiness warning text
- LLM model dropdown based on installed supported models
- disabled API key row with `Not required`

This matters because it means the current component is not modeling "which LLM provider should the app use" in a general sense. It is modeling "how optional local cleanup should run."

That is narrower than the section title implies.

# Current data model and ownership boundaries

## 1. Settings schema has two different LLM-related domains

The shared settings schema in `src/shared/domain.ts` separates LLM concerns into two places:

- `cleanup`
- `transformation`

`cleanup` comes from `src/shared/local-llm.ts` and contains:

- `enabled`
- `runtime`
- `localModelId`

`transformation` contains:

- `defaultPresetId`
- `lastPickedPresetId`
- `presets[]`

Each preset owns:

- provider
- model
- system prompt
- user prompt

This means there is no single canonical "LLM provider/model" setting today. There are two distinct systems:

- a global local-cleanup runtime setting
- per-preset transformation provider/model settings

Any redesign that aims for "simple provider/model" has to decide which of these it is simplifying.

## 2. Cloud LLM auth is not attached to the preset object

Transformation presets currently only support provider `google` and model `gemini-2.5-flash`.

Authentication is stored separately in the secret store and edited through `SettingsApiKeysReact`, not on the preset itself. That is why the LLM section includes a standalone Google key form instead of a provider-switched auth row like STT.

## 3. Local cleanup is globally configured and snapshot-based

When a recording completes, `CommandRouter` copies `settings.cleanup` directly into the immutable capture snapshot in `src/main/core/command-router.ts`.

That snapshot is frozen by `createCaptureRequestSnapshot` in `src/main/routing/capture-request-snapshot.ts`.

Implication:

- in-flight captures keep the cleanup config that existed when recording ended
- later Settings changes do not affect already enqueued jobs

This is good and should be preserved in any redesign.

# Readiness flow, end to end

## 1. The renderer requests readiness over IPC

`SettingsLlmProviderFormReact` fetches readiness by calling `window.speechToTextApi.getLocalCleanupStatus()`.

It does this:

- on mount
- when `settings.cleanup.runtime` changes
- when `settings.cleanup.localModelId` changes
- when the user presses `Refresh`

The result is stored as `LocalCleanupReadinessSnapshot`.

## 2. The shared readiness contract is explicit

`src/shared/ipc.ts` defines these readiness states:

- `ready`
- `runtime_unavailable`
- `server_unreachable`
- `auth_error`
- `no_supported_models`
- `selected_model_missing`
- `unknown`

Each snapshot also includes:

- runtime id
- available supported models
- selected model id
- whether the selected model is installed

This is more than a cosmetic status string. It is the contract the UI relies on to decide which warning to show and whether the model dropdown should be populated.

## 3. The main process computes readiness in two stages

`src/main/ipc/register-handlers.ts` handles `local-cleanup:get-status`.

Flow:

1. Read the currently selected cleanup model from persisted settings.
2. Run `localLlmRuntime.healthcheck()`.
3. If healthcheck fails, return a failure readiness state with no models.
4. If healthcheck succeeds, call `localLlmRuntime.listModels()`.
5. Filter to the supported local model catalog.
6. If no supported models are installed, return `no_supported_models`.
7. If supported models exist but the selected one is absent, return `selected_model_missing`.
8. Otherwise return `ready`.

This is the real readiness check in the product today.

## 4. Ollama readiness is HTTP-based

`OllamaLocalLlmRuntime` in `src/main/services/local-llm/ollama-local-llm-runtime.ts` uses Ollama's localhost HTTP API.

Readiness behavior:

- `healthcheck()` performs `GET /api/tags`
- `listModels()` also reads `GET /api/tags`
- installed models are intersected with Dicta's supported catalog

Failure classification maps to:

- missing runtime or bad install -> `runtime_unavailable`
- daemon not reachable or timeout -> `server_unreachable`
- 401 or 403 -> `auth_error`
- model-specific 404 during generation -> `model_missing`, later mapped to `selected_model_missing`
- anything else -> `unknown`

## 5. The UI uses readiness for warnings, not for hard gating

The cleanup form reacts to readiness like this:

- runtime problems show warning text plus an Ollama link
- `no_supported_models` shows a supported-model warning
- `selected_model_missing` shows a selected-model warning
- model dropdown is disabled only when there are zero model options

But the cleanup enable toggle is still active even when readiness is bad.

That mismatch was already documented in `docs/research/006-local-cleanup-silent-failure.md`, and it remains the biggest product risk in the current flow.

# Capture-time cleanup flow

## 1. Cleanup runs after transcription and dictionary replacement

In `src/main/orchestrators/capture-pipeline.ts`, the pipeline order is:

1. transcribe with STT provider
2. apply dictionary replacement
3. optionally run local cleanup
4. optionally run transformation preset
5. apply output
6. write history

This matches the spec and prior research.

## 2. Cleanup is best-effort only

`applyOptionalCleanup()` returns the corrected transcript unchanged when:

- cleanup is disabled
- the local runtime throws
- the runtime returns unusable output
- protected dictionary terms would be lost

So readiness is advisory in Settings, but cleanup execution is permissive at runtime.

This explains a key UX tension:

- the feature appears configurable like a primary provider flow
- but operationally it is treated like a best-effort enhancement

## 3. Readiness is not rechecked before each capture

Capture-time cleanup does not call the readiness IPC flow.

Instead, the capture snapshot carries only:

- `cleanup.enabled`
- `cleanup.runtime`
- `cleanup.localModelId`

Then the pipeline calls `localLlmRuntime.cleanup(...)` directly.

That means Settings readiness and capture execution are related but not the same mechanism:

- Settings readiness predicts whether cleanup should work
- capture execution is the actual runtime attempt

Any redesign should preserve that distinction or replace it deliberately.

# Why the current design feels wrong

## 1. The LLM section is mixing three different stories

The current `LLM Transformation` section visually mixes:

- local cleanup enablement
- local runtime readiness
- cloud API-key management

STT avoids this problem because it presents only one story: configure the selected STT provider.

## 2. The fake API-key row adds noise

The disabled `Ollama API key` row is there to mimic the STT layout and satisfy ADR `0005`, but it creates visual complexity without enabling any action.

It helps explain "no API key required," but it also reinforces a shape that is not actually real for local models.

## 3. The provider dropdown is technically correct but semantically thin

The local cleanup provider selector currently has only one option: `ollama`.

That means the control satisfies the provider/model dropdown requirement, but it does not simplify the experience much because:

- there is no meaningful provider choice today
- most of the section's cognitive weight comes from readiness and recovery, not provider selection

## 4. The cloud section is not structurally parallel to STT

Google Gemini auth appears as a standalone API-key form with no provider or model dropdown beside it.

That makes the full LLM section read as:

- one provider/model/runtime form for local cleanup
- one auth-only form for Google cloud transformation

This is exactly the opposite of the user's preferred "simple provider/model" mental model.

# Design constraints for a future redesign

## 1. A simple LLM surface still needs to preserve local runtime diagnostics

Unlike STT cloud providers, local Ollama setup has external-process prerequisites:

- Ollama installed
- Ollama running
- supported model installed
- selected model present

A simpler UI cannot just remove readiness; it has to relocate it or collapse it into a better recovery flow.

## 2. Cleanup and transformation are different product capabilities

Current architecture treats them differently:

- cleanup is global and optional
- transformation is preset-driven and content-shaping

A redesign should avoid implying that one provider/model pair governs everything unless the underlying product model is intentionally changed.

## 3. Existing snapshot semantics are worth keeping

The code already guarantees that captures use the cleanup settings bound at enqueue time. That isolation avoids mid-job configuration drift and should remain true after any UI refactor.

## 4. Supported-model curation is intentional

The local model dropdown is not a raw Ollama model list. It is filtered through Dicta's supported catalog in `src/shared/local-llm.ts` and `src/main/services/local-llm/catalog.ts`.

That means "simple model dropdown" still has product curation behind it.

## 5. The repo currently uses Google, not OpenAI

The user's note says dedicated sections for OpenAI subscription and Ollama are acceptable.

Important current-state fact:

- there is no OpenAI transformation provider in this codebase today
- the cloud transformation provider exposed here is Google Gemini

So the closest current implementation analogue is:

- dedicated cloud subscription section
- dedicated Ollama section

If OpenAI is introduced later, the same structural recommendation can apply, but that would be a new provider addition rather than a restyling of existing code.

# Recommended design direction

This is a research recommendation, not an implementation plan.

## Preferred structure

The cleanest path is to stop forcing the entire LLM area into one pseudo-STT form and instead make the split explicit:

1. Cloud LLM section
2. Local Ollama section

### Cloud LLM section

Purpose:

- own cloud subscription or API-key setup for transformation providers

Current repo analogue:

- Google Gemini API key

Future-compatible analogue:

- OpenAI subscription or API key if that provider is added

### Local Ollama section

Purpose:

- own local transcript cleanup
- own provider dropdown if multiple local runtimes ever exist
- own model dropdown
- own readiness and recovery status

This aligns with the user's acceptance of dedicated sections while keeping each section internally simple.

## Why this is better than one forced unified LLM form

- It matches the actual architecture.
- It keeps provider/model selection where those choices are real.
- It avoids mixing local runtime readiness with cloud auth in one block.
- It still allows STT-like simplicity inside each section.

## What “similar to STT” should mean in practice

For this repo, “similar to STT” should not mean copying every STT row literally.

It should mean:

- one clear purpose per section
- provider selection first
- model selection second
- auth or readiness immediately adjacent to that provider
- dropdowns for discrete provider/model choices
- no extra rows that do not lead to action

Under that definition:

- a cloud provider section can look very similar to STT
- an Ollama section can stay simple while replacing the fake API-key row with readiness status and actions

# Open questions to settle before implementation

## 1. Should cleanup remain a separate capability toggle?

Today cleanup is enabled independently of provider/model selection.

If the future design wants "simple provider/model" only, it must decide whether:

- cleanup remains a top-level toggle inside the Ollama section
- or selecting Ollama implicitly enables cleanup

The current behavior suggests the explicit toggle should remain.

## 2. Should readiness block enablement?

Current behavior allows impossible configurations.

A redesign should decide whether:

- the cleanup toggle is disabled until readiness is `ready`
- or enablement is allowed but clearly marked as inactive

Given the silent-fallback behavior, hard gating is the safer design.

## 3. Should missing-model recovery be in-app?

The current UI detects missing supported models but only links out.

If the design is meant to feel simple, one-click model installation or a stronger guided recovery path would likely be needed.

## 4. Should the section name stay `LLM Transformation`?

That title is misleading because the first subsection is actually transcript cleanup, not transformation preset configuration.

Possible direction:

- rename the overall area to `LLM`
- then use subsection titles that match reality

# Bottom line

The current LLM settings implementation already uses dropdowns for local provider and model selection, so the main issue is not control type. The issue is information architecture.

Today the section combines:

- a global local-cleanup runtime
- readiness-check UX for Ollama
- a separate cloud API-key form

That is why it feels unlike STT.

The best future direction is to preserve STT-like simplicity at the subsection level rather than pretending all LLM concerns fit one single form. In this repo's current architecture, that means a dedicated cloud LLM section and a dedicated Ollama section, with the Ollama section owning readiness status as a first-class part of the flow.
