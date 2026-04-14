---
title: Implement scratch-space Cmd+K temporary model selection
description: Add a scratch-local Change model Cmd+K action that applies a provider-plus-model override to the next scratch execution only, defaults to the selected profile model, and preserves the override across retry within the same scratch run.
date: 2026-04-14
status: active
tags:
  - plan
  - scratch-space
  - cmd-k
  - llm
  - renderer
  - main-process
---

# Implement scratch-space Cmd+K temporary model selection

## Goal

Add a `Change model` item to scratch-space `Cmd+K` so the user can choose a temporary execution target for the next scratch transformation only. The default remains the selected transformation profile's provider/model, the override may cross providers, the override survives retry reopen for the same scratch run, and nothing persists to Settings.

## Target branch

- Base branch: `main`
- Working branch: `feat/cmd-k-models`

## Scope

In scope:

- scratch-space renderer `Cmd+K` menu changes
- scratch-local temporary override state for `provider + model`
- extending scratch-space IPC payload to carry a request-scoped override
- main-process scratch execution changes so prompts still come from the selected profile while execution target may be overridden
- filtering or disabling model choices so the menu only offers executable targets
- unit and renderer coverage for new menu state, execution payload shape, retry behavior, and main-process resolution
- doc updates required by the feature once implementation begins

Out of scope:

- persistent settings changes
- profile editor changes
- global picker changes outside scratch space
- new providers beyond the existing Google, Ollama, and `openai-subscription` catalog
- broad scratch-space redesign beyond what is needed to support the extra picker state

## Non-goals

- do not turn `Change model` into `Change profile`
- do not store temporary overrides in `Settings`
- do not change scratch-space success semantics from “override applies to the next execution only”
- do not expose Codex models that the runtime cannot actually execute

## Requirements captured from the clarified spec

- `Cmd+K` keeps its current role as the scratch-local command entrypoint
- a new top-level item `Change model` opens a second scratch-local picker
- the picker may choose models across providers
- selecting a model updates only the next scratch execution
- after the next scratch execution is triggered, the temporary override resets
- if execution fails and scratch reopens with `reason: 'retry'`, the temporary override is preserved for that retry cycle
- when no override is active, execution uses the selected profile's `provider + model`
- the selected profile continues to own prompts

## Detailed approach

The current architecture is preset-centric:

- renderer sends `presetId`
- main process resolves a full preset from persisted settings
- scratch execution uses the preset's prompts and execution target

To support a temporary cross-provider model selection without persisting anything, the implementation should add one new concept:

- an ephemeral scratch override: `provider + model`, attached to the current scratch UI session and optionally sent with the execution request

The implementation should keep the selected profile as the prompt source and treat `Change model` as a request-scoped execution-target override. That keeps the existing preset model honest:

- profile selection still chooses prompt intent
- model selection changes runtime target only

Because the feature is “next execution only”, the renderer should own the override lifecycle. The main process should not become the long-term store of scratch session state; it only needs enough data on the execution request to resolve the effective target for that invocation.

The one exception is retry behavior. Since retry reopen belongs to the same failed execution flow, the renderer must preserve the override across `onOpenScratchSpace({ reason: 'retry' })` rather than clearing it during the usual refresh path.

## Relevant files and modules

Primary implementation surfaces:

- `src/renderer/scratch-space-app.tsx`
  Owns `Cmd+K` mini menu state, scratch-local keyboard flow, selected preset state, and execution request payload assembly.
- `src/renderer/scratch-space-app.test.tsx`
  Renderer coverage for menu behavior, focus handling, execution payload shape, and retry semantics.
- `src/shared/ipc.ts`
  Shared scratch execution payload type must grow to represent an optional override.
- `src/preload/index.ts`
  Pass-through for the updated scratch execution payload.
- `src/main/ipc/register-handlers.ts`
  Scratch IPC handler signature must accept the extended payload.
- `src/main/services/scratch-space-service.ts`
  Resolve the effective provider/model for execution while leaving prompts on the selected profile.
- `src/main/services/scratch-space-service.test.ts`
  Main-process coverage for override resolution, next-run semantics, and retry preservation expectations where applicable.

Supporting catalog and runtime surfaces:

- `src/shared/llm.ts`
  Shared provider/model catalog and labels for the picker.
- `src/main/services/llm-provider-readiness-service.ts`
  Existing availability truth for filtering or disabling picker choices.
- `src/main/services/codex-cli-service.ts`
  Current hard restriction to `gpt-5.4-mini`; this must inform what the scratch picker exposes.
- `src/main/services/transformation-service.ts`
  Existing provider/model allowlist validation seam.

Docs and spec surfaces to update in the implementation change:

- `specs/spec.md`
- potentially a new ADR only if implementation forces a durable contract change broader than the current spec wording
- `docs/e2e-playwright.md` if E2E coverage changes materially

## Key design decisions already fixed for this plan

- override scope: next execution only
- cross-provider switching: allowed
- retry reopen: keep the temporary override
- `Cmd+K` UX: top-level `Change model` item opens a second picker

## Risks and open questions

## Risk 1: Codex catalog versus executable runtime mismatch

Current code exposes many `openai-subscription` models in the shared catalog, but `CodexCliService.runTransformation(...)` currently only supports `gpt-5.4-mini`.

Plan consequence:

- implementation must not simply render every catalog entry as executable
- task ordering should address executable-model filtering before the scratch picker ships

Confidence:

- 95/100 that this is a real blocker for “show all models as selectable”

## Risk 2: scratch menu complexity

The current mini menu is action-only. Adding a nested model picker increases keyboard-state complexity and focus management risk.

Plan consequence:

- write renderer tests before or alongside UI changes
- keep the nested picker state explicit rather than overloading one flat selection index

Confidence:

- 90/100

## Risk 3: override lifecycle bugs

The feature depends on clearing the override after the next execution, but preserving it on retry. Those states are easy to mix up.

Plan consequence:

- implement the lifecycle explicitly in one small local state machine
- test fresh open, next execution success, next execution failure with retry, and manual close

Confidence:

- 88/100

## Recommended model exposure rule

Use this rule unless product says otherwise:

- show the union of currently supported execution targets across Google, Ollama, and Codex
- disable models whose readiness says unavailable
- additionally disable any Codex catalog entries the runtime cannot execute yet

This keeps the UI aligned with real execution capability instead of catalog optimism.

## Validation strategy

Automated:

- `pnpm test -- scratch-space-app.test.tsx scratch-space-service.test.ts`
- targeted test runs for any updated shared or IPC types if needed
- `pnpm docs:validate` after spec/doc changes

Recommended broader regression checks before merge:

- targeted `vitest` runs for:
  - `src/renderer/scratch-space-app.test.tsx`
  - `src/main/services/scratch-space-service.test.ts`
  - `src/main/test-support/ipc-round-trip.test.ts` if IPC payload shape changes affect round-trip coverage
- optional E2E extension if the scratch `Cmd+K` interaction already has Playwright coverage in this branch

Manual verification:

- open scratch space and confirm the selected profile still defines the default target
- open `Cmd+K`, choose `Change model`, select a cross-provider target, then execute paste
- confirm the override resets for the following fresh execution
- force a failure, ensure retry reopen preserves the override, then retry successfully
- confirm closing scratch clears the override
- confirm unavailable models cannot be executed

## Ordered tasks

## Task 1: Define the executable override contract

Goal:

- lock down the exact override payload shape and executable model list before touching UI behavior

Files:

- `src/shared/ipc.ts`
- `src/shared/llm.ts`
- `src/main/services/codex-cli-service.ts`
- `src/main/services/transformation-service.ts`
- `src/main/test-support/ipc-round-trip.test.ts` if needed

Changes:

- add an optional scratch execution override type that represents `provider + model`
- decide whether this should be a nested field like `runtimeOverride`
- define or derive a single source of truth for “executable scratch targets”
- make that executable-target truth account for the current Codex runtime restriction

Implementation notes:

- prefer a nested field over separate top-level override scalars so the request shape stays coherent
- do not widen the public type without also updating the preload and handler signatures
- if the current shared allowlists are kept broad, add a narrower executable-filter helper rather than mutating unrelated settings UI behavior

Definition of done:

- the shared contract can express “no override” and “provider/model override”
- the codebase has one explicit source for scratch-executable targets
- Codex non-executable models are either filtered out or clearly marked non-executable for scratch use

## Task 2: Extend scratch IPC and main-process resolution

Goal:

- allow scratch execution requests to carry the override and resolve effective execution target in main process

Files:

- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`

Changes:

- extend preload pass-through and IPC handler types for the optional override payload
- update `ScratchSpaceService.runTransformation(...)` input type
- keep preset lookup unchanged for prompts
- resolve effective provider/model as:
  - override target when provided
  - else selected preset target
- keep all existing output, retry, and draft semantics unchanged

Implementation notes:

- keep prompt ownership on the preset to avoid mixing “profile intent” with “runtime target”
- do not add persistent state to `ScratchSpaceService`
- validate the override before dispatch so failures are explicit and actionable

Definition of done:

- main-process scratch execution accepts and uses the override when present
- no behavior changes when the override is absent
- tests cover success and failure paths for overridden execution

## Task 3: Add renderer-local override state and menu substate

Goal:

- teach scratch space to select a temporary model target without executing immediately

Files:

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`

Changes:

- add renderer-local state for:
  - current temporary override
  - whether the `Cmd+K` surface is in top-level action mode or model-picker mode
  - model-picker selection index
- add `Change model` as the third top-level `Cmd+K` item
- build a second picker state backed by executable target data
- keep focus and Escape precedence explicit:
  - model picker closes back to top-level `Cmd+K`
  - top-level `Cmd+K` closes back to textarea
  - scratch close remains last

Implementation notes:

- fetch readiness data only if the scratch renderer does not already have enough information at boot time
- avoid duplicating settings-editor logic; scratch only needs a compact read-only target picker, not a full profile editor
- show the active temporary target somewhere in the `Cmd+K` surface so the current override is visible

Definition of done:

- the scratch `Cmd+K` menu exposes `Change model`
- choosing it opens a model picker instead of executing
- model selection updates local override state only
- the top-level action flow remains keyboard-first and predictable

## Task 4: Implement override lifecycle rules exactly

Goal:

- make the next-run-only behavior unambiguous and testable

Files:

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`

Changes:

- when the user triggers execution, include the current override in the payload
- clear the override after a successful or completed execution request cycle that should consume it
- preserve the override when scratch reopens with `reason: 'retry'`
- clear the override on:
  - fresh reopen
  - manual scratch close
  - profile change, unless product later decides otherwise

Implementation notes:

- centralize lifecycle transitions in helper functions instead of scattering `setState(null)` calls
- preserve current selected-preset retry behavior

Definition of done:

- tests prove:
  - next execution consumes the override
  - retry preserves it
  - fresh reopen clears it
  - manual close clears it

## Task 5: Add targeted regression coverage

Goal:

- cover the new behavior where it is most likely to regress

Files:

- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/test-support/ipc-round-trip.test.ts` if payload shape coverage is needed

Required test cases:

- `Cmd+K` top-level menu contains `Change model`
- `Enter` on `Change model` opens the picker and does not execute
- selecting a cross-provider target updates the next execution payload
- `Cmd+Enter` still forces paste from the action context
- next execution clears the override
- retry reopen keeps the override
- fresh reopen clears the override
- non-executable Codex models are not offered as runnable targets

Definition of done:

- targeted renderer and service tests pass
- no pre-existing scratch tests regress

## Task 6: Update durable docs with shipped behavior

Goal:

- make the durable contract reflect the implementation once it ships

Files:

- `specs/spec.md`
- `docs/e2e-playwright.md` if E2E scope changes
- a new ADR only if the implementation finalizes a broader durable interaction contract not already captured

Changes:

- update scratch-space sections to describe:
  - the `Change model` item
  - next-run-only override semantics
  - retry preservation semantics
  - any executable-model filtering behavior the user can observe

Definition of done:

- spec and tests describe the same shipped behavior
- doc frontmatter validation passes

## Suggested commit slices

- Slice 1: shared contract and executable-target filtering
- Slice 2: main-process scratch execution override path
- Slice 3: renderer `Cmd+K` nested picker and lifecycle rules
- Slice 4: doc updates and final regression cleanup

## Handoff summary

The feature should be implemented as a scratch-local, request-scoped `provider + model` override layered on top of the selected profile, not as a persistent settings change and not as a synthetic new profile. The critical sequencing constraint is to solve executable target truth first, because the current Codex runtime cannot execute every model the shared catalog exposes.
