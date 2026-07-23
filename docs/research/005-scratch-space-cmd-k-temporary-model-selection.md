---
title: Scratch-space Cmd+K temporary model selection
description: Research the current scratch-space Cmd+K flow and the design constraints for adding a request-scoped Change model action that temporarily overrides the selected profile model without persisting settings.
date: 2026-04-14
status: concluded
tags:
  - research
  - scratch-space
  - cmd-k
  - llm
  - models
  - renderer
  - main-process
---

# Scratch-space Cmd+K temporary model selection

## Research goal

Study the current scratch-space `Cmd+K` behavior in detail and determine what it would take to add a new `Change model` item to that menu with these requested properties:

- the change applies only to the current scratch-space run
- it does not persist to Settings
- the default model remains the model attached to the currently selected transformation profile
- the selectable model set should span the currently exposed model families across Google, Ollama, and Codex
- the user flow should remain keyboard-first:
  - open scratch space
  - press `Cmd+K`
  - choose a model-related option
  - confirm with `Enter` or `Cmd+Enter`

This document does not propose implementation code. It records the current architecture, the precise seams the feature would need to use, the hidden constraints, and the main design risks.

## Executive summary

The current scratch-space runtime has no concept of a temporary model override.

Today, scratch-space execution is driven entirely by the selected transformation preset id. That preset contains the durable `provider + model + prompts` tuple, and `runScratchSpaceTransformation` receives only:

- `text`
- `presetId`
- `executionMode`

As a result:

- scratch space can temporarily change the selected preset in renderer state
- scratch space cannot temporarily change only the model for one run
- any model change feature must introduce a new request-scoped override path somewhere between renderer state and the main-process execution call

The cleanest mental model is:

- selected profile remains the durable source of prompts and default provider/model
- `Change model` creates an ephemeral runtime override for one scratch-space session or one scratch-space execution flow
- execution resolves to `effective provider + effective model`, where the default is still the selected preset

There is one important current mismatch in the codebase:

- the shared model catalogs expose multiple Codex models
- actual `CodexCliService` execution is currently hard-coded to support only `gpt-5.4-mini`

That means a literal implementation of “show all Codex models in the scratch `Change model` menu” would currently expose options that the runtime cannot execute successfully.

## Current shipped behavior

## Scratch-space window and focus model

Scratch space is a dedicated floating utility window controlled in main process by `ScratchSpaceWindowService`.

Current durable behavior:

- scratch opens as its own window, not inside the main Settings shell
- on macOS it opens as an activating typing surface
- the service captures the frontmost app bundle id before scratch opens
- paste-mode execution later restores focus to that app before output is pasted

Relevant sources:

- `docs/adr/0014-scratch-space-focus-contract.md`
- `docs/adr/0015-scratch-space-local-action-menu.md`
- `src/main/services/scratch-space-window-service.ts`
- `specs/spec.md`

## Scratch-space renderer state

`src/renderer/scratch-space-app.tsx` owns the scratch-local UI state.

Important state fields today:

- `selectedPresetId`
- `isMiniMenuOpen`
- `selectedMenuAction`
- `isPresetMenuOpen`
- `presetMenuIndex`
- draft text and busy/error state

There is no state for:

- selected temporary model
- selected temporary provider
- selected runtime override
- nested submenu or mode within the `Cmd+K` mini menu

## Current `Cmd+K` mini menu

The current scratch-local `Cmd+K` menu is a small renderer-only overlay.

Current items:

- `Copy transformed result`
- `Paste at front app`

Current keyboard behavior:

- `Cmd+K` toggles the mini menu open and closed on macOS only
- opening the menu resets selection to item 1
- `ArrowUp` and `ArrowDown` move selection without wrapping
- `Enter` executes the highlighted action
- `Cmd+Enter` always executes paste mode, regardless of highlighted item
- `Escape` closes the mini menu first
- when the menu loses focus, it closes and textarea focus is restored

Current tests explicitly cover these behaviors in `src/renderer/scratch-space-app.test.tsx`.

## Current preset selection path

Scratch space already supports temporary profile selection, but only at the preset level.

There are two profile-selection surfaces:

- the visible radio-list in the main scratch panel
- the scratch-local preset menu opened from the global `pickTransformation` shortcut while scratch is visible

Important existing semantics:

- on fresh open, scratch selection resets to `settings.transformation.defaultPresetId`
- on retry reopen after a failed execution, scratch preserves the previously selected preset
- changing the selected preset in scratch does not persist any setting

This is the closest existing precedent for temporary behavior. It proves the product already accepts request-local scratch overrides, but only for preset selection, not model selection.

## Current execution path

Scratch execution currently flows like this:

1. Renderer calls `window.speechToTextApi.runScratchSpaceTransformation({ text, presetId, executionMode })`
2. Main-process `ScratchSpaceService.runTransformation` loads the latest persisted settings
3. `resolvePreset` finds:
   - the requested preset id
   - else the default preset id
   - else the first available preset
4. Scratch execution uses the resolved preset's:
   - `provider`
   - `model`
   - `systemPrompt`
   - `userPrompt`
5. `executeTransformation(...)` runs preflight and dispatches through `TransformationService`
6. successful output is always copied, and may also be pasted depending on execution mode
7. draft is cleared only after success

Important consequence:

- there is no place in the current scratch IPC contract to supply a temporary model override

## Current data contracts

## Persistent settings shape

`TransformationPresetSchema` in `src/shared/domain.ts` defines a durable preset as:

- `id`
- `name`
- `provider`
- `model`
- `systemPrompt`
- `userPrompt`
- `shortcut`

Scratch currently depends on the preset as the single durable execution source.

The Settings schema contains:

- `defaultPresetId`
- `lastPickedPresetId`
- `presets`

It does not contain:

- scratch-local override model
- scratch-local override provider
- last temporary scratch model

That matches the requested non-persistent behavior.

## Shared provider/model catalog

`src/shared/llm.ts` is the catalog authority.

Current provider ids:

- `google`
- `ollama`
- `openai-subscription`

Current user-facing labels:

- `Google`
- `Ollama`
- `Codex CLI`

This matters because the request says “google, ollama, codex”, while the code uses:

- `openai-subscription` as the provider id
- `Codex CLI` as the user-facing label

Any research or implementation should treat “codex” in the feature description as the existing `openai-subscription` provider family rendered as `Codex CLI`.

## Available models by provider

Current allowlists expose:

- Google:
  - `gemini-2.5-flash`
- Ollama:
  - multiple curated models and quantized variants
- Codex CLI:
  - `gpt-5.4-mini`
  - `gpt-5.4`
  - `gpt-5.3-codex`
  - `gpt-5.2-codex`
  - `gpt-5.2`
  - `gpt-5.1-codex-mini`

This is the broadest current answer to “model options: all”.

## Current readiness model

The app already has provider readiness snapshots exposed to renderer via `getLlmProviderStatus()`.

That snapshot includes:

- provider credential state
- readiness status
- model availability list

This is important because a `Change model` menu should not guess availability. The repo already has a runtime-readiness source of truth that distinguishes:

- configured versus unconfigured cloud providers
- local Ollama runtime availability
- per-model availability
- Codex CLI install/login status

## Existing constraints that shape the feature

## Constraint 1: scratch runtime executes by preset, not by model

The current architecture is preset-centric.

That is good for prompt integrity, because the prompt templates live on the preset. It also means a temporary model-selection feature must answer:

- does it override only `model`
- or `provider + model`

In practice, it must resolve `provider + model`, not model alone, because:

- models are allowlisted under providers
- execution preflight is provider-specific
- readiness is provider-specific
- credentials are provider-specific

The user-facing menu can still say `Change model`, but the runtime concept is really:

- temporary execution target override

## Constraint 2: the default comes from the selected profile

The requested default behavior is already aligned with the current architecture:

- selected profile owns the default provider/model pair

That means the temporary override should almost certainly leave prompts attached to the selected profile and change only the execution target.

This avoids turning `Change model` into `Change profile`.

## Constraint 3: temporary means non-persistent across app settings

The feature expectation is explicit:

- no persistent change

That means the override should not write to:

- `settings.transformation.presets[*].model`
- `settings.transformation.presets[*].provider`
- `settings.transformation.defaultPresetId`
- `settings.transformation.lastPickedPresetId`

The existing scratch profile-selection behavior already proves this is acceptable product behavior.

## Constraint 4: the current `Cmd+K` menu is action-oriented, not selection-oriented

Today the `Cmd+K` menu only chooses execution action:

- copy
- paste

Adding `Change model` introduces a second responsibility:

- action selection
- runtime target selection

That means the menu can no longer remain a flat “execute now” surface unless the new item opens a second surface.

This is the biggest interaction-design consequence in the feature.

## Constraint 5: `Cmd+Enter` currently means paste immediately

The current contract says:

- inside scratch generally, `Cmd+Enter` runs transform-and-paste
- inside the mini menu, `Cmd+Enter` also forces paste

If `Change model` is added, `Cmd+Enter` semantics must remain unambiguous.

Most likely safe interpretation:

- while the top-level `Cmd+K` menu is open, `Cmd+Enter` should still execute paste
- once a model-picker substate is entered, `Enter` should confirm model selection, not execute transformation
- after a model is selected, the user returns to the top-level action context and can then use `Enter` or `Cmd+Enter`

Anything else would overload the shortcut too much.

## Constraint 6: retry behavior currently preserves profile, not model override

On retry reopen after a failed scratch execution, current behavior preserves:

- draft
- selected preset

There is no current concept of preserving a temporary model override.

This needs a product decision if the feature is implemented.

Reasonable options:

- retry clears the temporary model override and falls back to the selected profile model
- retry preserves the temporary model override for the same scratch session

Given the user expectation says “this run only”, preserving the override through retry is plausible if retry is considered part of the same run. But this is not yet defined in the current contract and should be chosen explicitly.

## Constraint 7: Codex model exposure and Codex execution do not currently match

This is the most important hidden engineering constraint.

Shared allowlists and renderer UI expose multiple Codex models, but `CodexCliService.runTransformation(...)` currently rejects any model other than `gpt-5.4-mini`.

That means there are two different truths in the codebase:

- catalog truth: multiple Codex models exist
- execution truth: only `gpt-5.4-mini` actually runs

If scratch `Change model` blindly uses the shared model catalog, Codex selections other than `gpt-5.4-mini` will fail at execution time.

This should be treated as a real product/design constraint, not an implementation detail.

## Likely product interpretation of the requested feature

The request says:

- “add change model item in cmd+k items”
- “default model: model attached to the selected transformation profile”
- “change a model option can change a model in this run only”
- “model options: all (google, ollama, codex)”

The closest coherent interpretation is:

1. scratch keeps its selected profile as the durable prompt source
2. `Cmd+K` gains a `Change model` item
3. selecting `Change model` opens a second, scratch-local model picker
4. that picker lets the user choose an effective model from the shared provider/model catalog
5. execution uses:
   - selected preset prompts
   - selected preset default target unless overridden
   - overridden provider/model when present
6. the override is cleared when the scratch run ends, or when scratch is closed

This interpretation preserves the existing meaning of profiles while satisfying the request for temporary model switching.

## Interaction model options

## Option A: flat top-level menu with a third item

Top-level items would become:

- `Copy transformed result`
- `Paste at front app`
- `Change model`

Pros:

- smallest conceptual diff from the current menu
- directly matches the user wording

Cons:

- `Enter` on `Change model` cannot execute a transformation, so menu semantics become mixed
- requires a second nested surface anyway
- current `Cmd+Enter` behavior becomes harder to explain when the highlighted item is not an execution action

Assessment:

- workable, but only if `Change model` opens a second selection state rather than trying to execute from the same row

## Option B: convert the `Cmd+K` surface into a true command palette

The overlay would become a slightly richer scratch-local palette that can host:

- execution actions
- model-changing action
- current effective model summary

Pros:

- more honest information architecture
- easier to explain mixed actions and configuration
- easier to show the currently effective runtime target

Cons:

- larger UI change
- may exceed the intentionally compact current mini-menu contract

Assessment:

- architecturally cleaner, but larger than the request strictly needs

## Option C: keep `Cmd+K` for actions and introduce a separate model shortcut

Pros:

- preserves the current action-only semantics

Cons:

- does not match the request
- adds another shortcut and another concept

Assessment:

- not aligned with the stated feature

## Recommended interaction direction for future implementation

If the feature is implemented, Option A with an explicit second-step picker is the smallest coherent design:

- top-level `Cmd+K` remains the action entrypoint
- `Change model` enters a model-picker substate
- model-picker confirms override selection with `Enter`
- execution still happens only from the action context using `Enter` or `Cmd+Enter`

That keeps the mental model clear:

- step 1: optionally change runtime target
- step 2: execute copy or paste

## Data-flow options for future implementation

## Option 1: renderer-only override state plus extended scratch IPC payload

Scratch renderer stores an ephemeral override such as:

- `temporaryModelOverride: { provider, model } | null`

Then the IPC payload becomes something like:

- `text`
- `presetId`
- `executionMode`
- optional `providerOverride`
- optional `modelOverride`

Main process still resolves the preset for prompts, but resolves execution target as:

- override provider/model when present
- else preset provider/model

Pros:

- matches current layering
- keeps the override request-scoped
- avoids writing Settings

Cons:

- requires IPC contract expansion
- requires new validation rules for override combinations

Assessment:

- this is the most direct fit for the current architecture

## Option 2: synthesize a temporary preset in renderer

Renderer could clone the selected preset and replace provider/model before execution.

Pros:

- reuses the existing preset execution mental model

Cons:

- fake preset ids are awkward
- IPC still only accepts `presetId`
- the main process resolves presets from persisted settings, so a synthetic preset cannot be looked up there without larger changes

Assessment:

- poor fit for current code

## Option 3: store temporary override in main-process scratch service

Main process could own scratch-session state for temporary model selection.

Pros:

- keeps execution state close to execution logic

Cons:

- introduces more main-process session state
- scratch renderer still needs additional IPC for set/clear/query
- more complex than needed

Assessment:

- possible, but heavier than the current architecture warrants

## Recommendation on future data shape

The least invasive design is:

- keep preset id as the durable prompt source
- add an optional request-scoped `provider + model` override to scratch execution

That is the minimum change that actually represents the requested behavior honestly.

## Availability and filtering rules the feature would need

If the model list is meant to show “all” options, the implementation still needs clear filtering semantics.

Possible list strategies:

- show every allowlisted model for every provider
- show only models whose readiness snapshot reports `available: true`
- show all models, but disable unavailable ones with status context

Given the existing repo patterns in profile editing and provider readiness, the third option is the best match:

- users can see the whole supported catalog
- unavailable models are visible but not selectable
- the UI can stay aligned with readiness truth

Provider-specific implications:

- Google:
  - straightforward because the catalog is currently one model
- Ollama:
  - model availability is dynamic and should use readiness snapshot data
- Codex CLI:
  - readiness can say provider is ready, but execution still currently supports only `gpt-5.4-mini`

For Codex specifically, a future implementation should either:

- expose only executable Codex models in scratch until runtime support broadens
- or show the broader list disabled with explicit explanation

It should not silently offer failing choices.

## State lifecycle questions that need explicit product answers

The current code does not answer these yet:

1. When does the temporary model override clear?
   - on successful execution
   - on scratch close
   - on fresh reopen
   - on retry reopen

2. Does changing the selected profile clear the temporary model override?
   - probably yes, because the default runtime target changed underneath it

3. Does the UI show the active override outside the `Cmd+K` menu?
   - if not, the user may forget they changed the model

4. If the user changes model to a different provider, do prompts remain unchanged?
   - this is likely intended, but it changes execution behavior meaningfully

5. What happens if the selected override becomes unavailable before execution?
   - likely fail preflight with a clear message

These are not blockers to research, but they are required before implementation can be called complete.

## Risks and edge cases

## Risk: profile prompts may not be provider-agnostic

Profiles currently bundle prompts with provider/model. A temporary cross-provider model change assumes the profile prompts remain valid enough across providers.

That is probably acceptable for a first pass because the app already treats transformation prompts as generic text templates, but it is still a behavior change worth documenting.

## Risk: retry semantics become ambiguous

Because retry already preserves the selected preset, users may reasonably expect retry to preserve the temporary override too. That needs explicit product treatment.

## Risk: menu complexity may outgrow the current “mini menu”

The current overlay is intentionally tiny and action-focused. Nested model selection may push it toward a fuller command palette.

## Risk: Codex catalog may promise more than runtime can execute

This is the strongest current concrete risk and should be resolved before implementation, not after.

## Risk: settings refresh could invalidate a local override

Scratch currently refreshes settings on `onSettingsUpdated`. A temporary model override would need a clear rule for what happens when provider readiness or settings change while scratch is open.

## Suggested verification targets for the future implementation

When implementation happens, the minimum high-value test areas would be:

- renderer:
  - `Cmd+K` top-level menu includes `Change model`
  - selecting `Change model` opens the model-picker substate
  - `Enter` confirms model selection without executing transformation
  - `Cmd+Enter` still executes paste only in the action context
  - active temporary override is cleared at the intended lifecycle boundary
- IPC:
  - scratch execution payload carries the override only when selected
- main process:
  - scratch execution uses preset prompts with overridden provider/model
  - invalid override combinations fail clearly
  - unavailable override models fail clearly
  - retry behavior matches the chosen contract
- provider/runtime:
  - Codex non-`gpt-5.4-mini` options are not exposed as executable unless runtime support exists

## Research conclusion

Adding `Change model` to scratch-space `Cmd+K` is feasible, but it is not a trivial menu-row addition.

The feature cuts across three layers:

- renderer menu state
- scratch IPC payload shape
- main-process execution target resolution

The current codebase already provides several strong foundations:

- scratch-local temporary preset selection
- shared provider/model catalogs
- provider readiness snapshots
- preset-based prompt ownership

The main missing piece is an honest request-scoped execution override path.

The most important implementation constraint discovered during research is the current Codex mismatch:

- the catalog lists several Codex models
- runtime execution currently supports only `gpt-5.4-mini`

Because of that, the safest future implementation direction is:

- keep selected profile as the durable prompt source
- add `Change model` as a top-level `Cmd+K` item that opens a second-step picker
- treat the selected value as a temporary `provider + model` override
- never persist it to Settings
- expose only executable models, or visibly disable non-executable ones

That direction satisfies the requested feature while staying aligned with the current architecture and avoiding hidden persistence or misleading model choices.
