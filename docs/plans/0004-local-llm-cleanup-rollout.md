---
title: Local LLM cleanup rollout plan
description: Break local transcript cleanup into small PR-sized tickets with explicit runtime, model-cap, fallback, and review gates before implementation begins.
date: 2026-03-31
status: active
review_by: 2026-04-07
links:
  decision: 0003-local-llm-cleanup-runtime-and-fallback
tags:
  - planning
  - local-llm
  - cleanup
  - rollout
---

# Local LLM cleanup rollout plan

## Goal

Deliver optional post-transcription local cleanup as a sequence of small PRs, with:
- original-transcript fallback on every cleanup failure
- an Ollama-first runtime adapter behind a shared local-LLM abstraction
- a hard product cap of at most 5 supported local models
- room to reuse the same runtime boundary for future local transformation work

This plan is intentionally execution-first. No implementation should start until this plan is accepted for scope, ticket order, and dependency shape.

## Key decisions carried into the plan

- Cleanup runs after dictionary replacement and before any future transformation work.
- Cleanup is opt-in and best-effort; it must never block transcript delivery.
- The first runtime implementation is Ollama-shaped localhost HTTP, but the app-facing contract stays runtime-agnostic.
- Phase 1 should not add native inference dependencies to Dicta itself. Use built-in `fetch` against the local runtime instead of adding an Ollama SDK or embedded inference package.
- Product behavior supports at most 5 curated local models in Settings, even if the runtime exposes more installed models.
- Initial curated models should start with `qwen3.5:2b` and `qwen3.5:4b`; the remaining slots stay available for later validated additions rather than being promised up front.

## Why this dependency strategy is the cleanest first step

Phase 1 needs fast delivery, small diffs, and low packaging risk. A plain HTTP adapter to Ollama keeps the first PR set small because:
- no native Electron packaging work is introduced yet
- no additional JS SDK becomes part of the runtime compatibility surface
- LM Studio can be added later behind the same adapter seam without rewriting the app-facing contracts

Trade-off:
- plain HTTP means Dicta owns request shaping, timeouts, and response validation instead of delegating them to an SDK
- that is still cheaper than taking on a new dependency before the runtime contract settles

## Execution order

| Priority | Ticket | PR scope | Depends on | Parallelism |
| --- | --- | --- | --- | --- |
| P0 | Ticket 1 | Settings schema, backward-compatible normalization, and curated model catalog contract | none | must be first |
| P1 | Ticket 2 | Main-process runtime abstraction + Ollama adapter + health/model discovery | Ticket 1 | sequential after Ticket 1 |
| P1 | Ticket 3 | Cleanup orchestration, validation, and transcript fallback in capture pipeline | Ticket 2 | sequential after Ticket 2 |
| P2 | Ticket 4 | Settings UI and actionable runtime/model diagnostics | Ticket 1, Ticket 2, Ticket 3 | can overlap only after Ticket 3 locks failure taxonomy |
| P2 | Ticket 5 | Durable docs, ADR acceptance/supersession notes, final verification and review | Ticket 1, Ticket 2, Ticket 3, Ticket 4 | last |

## Current rollout status

As of 2026-04-01:
- Ticket 1 is merged in PRs `#570` and `#571`.
- Ticket 2 is merged in PR `#572`.
- Ticket 3 is merged.
- The next implementation slice is Ticket 4: Settings UI and actionable runtime/model diagnostics.

## Dependency and parallelism summary

Sequential:
- Ticket 1 must land before any runtime or UI work because it defines the persisted settings and the hard 5-model cap.
- Ticket 2 must land before Ticket 3 because cleanup execution depends on a stable runtime contract.
- Ticket 5 should be last because it closes the loop on durable docs and review.

Parallel candidates:
- Ticket 4 can overlap with the end of Ticket 3 only after Ticket 3 locks the cleanup failure taxonomy and result shape.
- If review bandwidth is available, UI review for Ticket 4 and failure-path review for Ticket 3 can happen independently.

## Definition of Done for the rollout

The rollout is done only when all of the following are true:
- cleanup can be enabled or disabled in Settings
- cleanup runs only after dictionary replacement
- any cleanup runtime, validation, timeout, or parsing failure falls back to the original transcript
- the user can select from no more than 5 curated supported local models
- unsupported or missing local models do not appear as selectable success paths
- focused tests cover model-cap enforcement, runtime unavailability, invalid cleanup output, and transcript fallback
- durable docs match shipped behavior
- one sub-agent review and one second-model review have been run, with findings either fixed or explicitly documented

## Ticket 1: Settings shape, backward-compatible normalization, and curated model catalog contract

### Goal

Create the smallest stable foundation for local cleanup:
- persisted cleanup settings
- backward-compatible normalization for older settings files
- a curated supported-model catalog contract with a hard cap of 5 models
- a minimal shared task/runtime surface only where later tickets actually need it

### Approach

Land the persisted shape first so later PRs do not keep reshaping settings or model inventory semantics. Keep this PR limited to settings and shared types; do not pull in preload or renderer wiring yet. The important design choice here is to separate:
- runtime-discovered model ids
- Dicta-curated supported model metadata
- shipped runtime values in persisted settings from future internal runtime kinds

That keeps backward compatibility explicit and prevents the first Ollama integration from leaking future-placeholder states into user settings.

### Files in scope

- `src/shared/domain.ts`
- `src/shared/domain.test.ts`
- `src/main/services/settings-service.ts`
- `src/main/services/settings-service.test.ts`
- `src/main/test-support/settings-fixtures.ts`
- `src/main/services/local-llm/` new config-only module for the curated model catalog

### Checklist

- Add `cleanup` settings shape with `enabled`, `runtime`, and `localModelId`.
- Normalize older settings safely when cleanup fields are absent.
- Add a curated model catalog contract with a max length of 5.
- Ensure supported-model filtering is based on Dicta’s manifest, not the raw runtime inventory.
- Keep persisted runtime options limited to shipped values for phase 1.
- Add tests for settings validation and model-cap enforcement.

### Tasks

1. Add cleanup settings to the shared schema.
2. Add defaults and normalization for missing cleanup fields in persisted settings.
3. Add a curated supported-model catalog module or constant in a dedicated local-LLM config area, not inside the broad shared domain file.
4. Add validation that the supported-model list cannot exceed 5 entries.
5. Keep any future runtime kinds internal until a second runtime actually ships.
6. Add unit tests for the new schema, normalization path, and model catalog invariants.

### Definition of Done

- Settings parse and persist with the new cleanup fields.
- Older settings files missing cleanup fields normalize without crash or data loss.
- The curated supported-model list fails tests if it grows beyond 5 entries.
- Persisted settings cannot enter dead runtime states for unshipped runtimes.
- No preload or renderer wiring is needed for this ticket to merge.

### Trade-offs

- Locking the 5-model cap this early prevents model sprawl, but it adds a little friction when evaluating new local models.
- Separating curated support from runtime discovery adds one indirection layer, but it keeps Settings predictable and avoids promising every installed model will work.
- Keeping the catalog out of `src/shared/domain.ts` reduces cross-process policy leakage and makes future runtime expansion easier to contain.

### Example code sketch

```ts
export const SUPPORTED_LOCAL_MODELS = [
  { id: 'qwen3.5:2b', runtime: 'ollama', supportedTasks: ['cleanup'] },
  { id: 'qwen3.5:4b', runtime: 'ollama', supportedTasks: ['cleanup'] }
] as const
```

### Confidence

- 92 for the settings/schema split
- 88 for the manifest-based 5-model cap

## Ticket 2: Main-process runtime abstraction and Ollama adapter

### Goal

Implement the runtime layer behind the shared contract, starting with:
- Ollama health checks
- supported-model discovery
- cleanup request execution through localhost HTTP
- strict timeout and response parsing behavior

### Approach

Keep phase 1 dependency-light:
- use native `fetch`
- no Ollama SDK
- no embedded inference package

Implement the runtime in the main process only. The adapter should return normalized success/failure results and never own transcript fallback behavior; the pipeline should retain that responsibility. Health checks are for diagnostics and Settings UX, not a hard precondition on every capture request.

### Files in scope

- `src/main/services/` new local-LLM runtime files
- `src/main/services/*test.ts` for the adapter and manifest filtering
- `src/main/ipc/register-handlers.ts` only if runtime diagnostics are exposed before UI work
- `src/shared/error-logging.ts` only if a new structured event is needed

### Checklist

- Add a `LocalLlmRuntime` contract implementation for Ollama.
- Add `healthcheck()` and `listModels()` behavior.
- Filter discovered runtime models through the curated manifest.
- Implement cleanup request execution with timeout and JSON validation.
- Normalize runtime failure codes for unavailable server, missing model, timeout, and invalid response.
- Keep renderer-facing IPC for diagnostics out of this PR unless a test requires it.
- Add focused tests for success and failure paths.

### Tasks

1. Add runtime service interfaces and an Ollama adapter.
2. Implement localhost health checking.
3. Implement model listing and manifest-based filtering.
4. Implement cleanup request submission using structured JSON output expectations.
5. Normalize adapter failures into a small internal error vocabulary.
6. Add unit tests for reachable/unreachable runtime, supported/unsupported models, timeout, and invalid JSON.

### Definition of Done

- Ollama availability can be checked without touching renderer code.
- The adapter returns only curated supported models, capped at 5.
- Invalid or malformed cleanup responses fail closed.
- Tests cover timeout, unreachable runtime, unsupported model, and malformed response behavior.

### Trade-offs

- Native `fetch` keeps dependencies small, but the adapter owns more protocol details.
- Ollama-first is the fastest path, but LM Studio remains deferred until the contract proves stable.
- Structured-output enforcement increases adapter code now, but sharply reduces cleanup-stage silent corruption risk.

### Example code sketch

```ts
const response = await fetch(`${baseUrl}/api/generate`, {
  method: 'POST',
  body: JSON.stringify({
    model,
    prompt,
    format: cleanupResponseSchema,
    stream: false
  }),
  signal: abortSignal
})
```

### Confidence

- 90 for Ollama-first HTTP adapter
- 84 for structured-output parsing via plain HTTP
- 76 for adding LM Studio in the same PR

Low-confidence note:
- LM Studio should stay out of this PR. Confidence is below 80 because it would widen testing and diagnostics scope without helping the first cleanup path ship safely.

## Ticket 3: Cleanup execution in the capture pipeline with fail-closed fallback

### Goal

Insert cleanup into the existing capture pipeline so that:
- transcription still completes normally
- dictionary replacement remains first
- cleanup is optional and best-effort
- original transcript output is preserved on any cleanup failure

### Approach

Do not let the runtime adapter decide final user-visible behavior. The pipeline already owns output fallback semantics for transformation; cleanup should follow the same discipline. The cleanup stage should only run when:
- cleanup is enabled
- the selected model resolves through the curated manifest

For the first shipping pass, keep validation fail-closed but narrow. Output validation should reject:
- empty cleanup output for non-empty transcript
- invalid JSON
- protected-term loss only if the implementation remains small and directly testable

Phase 1 should not rely on a model self-report such as `meaning_changed`. That signal is not trustworthy enough to gate replacement of user text.

### Files in scope

- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/services/settings-service.ts` only if cleanup settings need new read paths in the snapshot builder

### Checklist

- Run cleanup after dictionary replacement.
- Skip cleanup entirely when disabled.
- Preserve transcript output on every cleanup failure.
- Add tests for successful cleanup, disabled cleanup, runtime failure, invalid cleanup output, and empty-output fallback.
- Document protected-term validation as explicit follow-up hardening if it is deferred.

### Tasks

1. Extend the capture snapshot with cleanup settings or resolved cleanup config.
2. Add a cleanup stage after dictionary replacement.
3. Validate cleanup output before it can replace transcript text, without depending on model self-assessment.
4. Treat request failure, timeout, invalid JSON, and empty output as transcript-fallback cases.
5. Preserve transcript output and continue history/output recording on failure.
6. Add focused pipeline tests for fallback behavior.

### Definition of Done

- Cleanup never runs before dictionary replacement.
- Cleanup failure never downgrades transcript delivery to a terminal failure when transcription succeeded.
- History and output behavior remain coherent whether cleanup succeeds, is skipped, or fails.
- Pipeline tests prove the transcript fallback contract.
- Pipeline execution does not depend on a cached UI health state.

### Trade-offs

- Reusing the capture pipeline keeps behavior centralized, but it increases pressure on pipeline test coverage.
- Deferring semantic validation keeps the first pipeline PR smaller, but it leaves some trust hardening for a later pass.

### Example code sketch

```ts
const correctedTranscript = applyDictionaryReplacement(result.text, snapshot.correctionDictionaryEntries)

const finalTranscript =
  cleanupResult.ok && cleanupResult.cleanedText.trim().length > 0
    ? cleanupResult.cleanedText
    : correctedTranscript
```

### Confidence

- 89 for insertion point and fallback shape
- 78 for semantic validation beyond parse/transport/empty-output failures

Low-confidence note:
- Protected-term validation should stay in this ticket only if it remains trivially testable and does not expand the diff much. Otherwise it should become a follow-up hardening ticket after the transport and fallback path is stable.

## Ticket 4: Settings UI and runtime/model diagnostics

### Goal

Expose the new feature safely in Settings with:
- cleanup enable/disable control
- runtime selector
- supported model selector
- actionable empty-state or health diagnostics when the runtime is unavailable or no curated model is installed

### Approach

Keep the UI deliberately narrow. Phase 1 should not add aggressiveness knobs or a generic model browser. The UI should expose only the minimum trusted product surface:
- whether cleanup is on
- which runtime is selected
- which curated model is selected
- why cleanup cannot currently run

### Files in scope

- `src/renderer/settings-output-react.tsx` or the most appropriate existing settings panel
- `src/renderer/settings-output-react.test.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-validation.ts`
- `src/main/ipc/register-handlers.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`

### Checklist

- Add cleanup toggle in Settings.
- Add runtime selector only if the product wants runtime choice visible in phase 1; otherwise keep `ollama` fixed in UI and leave runtime choice internal until a second runtime exists.
- Add model selector populated from curated supported models discovered from the runtime.
- Show actionable diagnostics when no supported model is installed or the runtime is unreachable.
- Prevent the UI from implying that arbitrary installed models are supported.

### Tasks

1. Add renderer settings controls for cleanup.
2. Add IPC path for runtime health and supported-model inventory.
3. Add empty states for unreachable runtime and no compatible installed model.
4. Add renderer tests for enabled, disabled, empty-state, and supported-model list behavior.

### Definition of Done

- Settings can enable or disable cleanup without breaking existing settings flows.
- The model selector never shows more than 5 supported options.
- Diagnostics tell the user whether the problem is runtime availability or missing compatible models.
- Renderer tests cover the primary happy and empty states.

### Trade-offs

- A constrained UI keeps the rollout safe, but advanced users may want direct arbitrary model input sooner.
- Deferring aggressiveness controls keeps the first PR small, but it also limits user tuning until cleanup quality is better understood.

### Example code sketch

```tsx
<Switch checked={settings.cleanup.enabled} onCheckedChange={setCleanupEnabled} />

{supportedModels.length === 0 ? (
  <p>No supported local cleanup model is installed for the selected runtime.</p>
) : (
  <Select value={settings.cleanup.localModelId}>{/* curated options */}</Select>
)}
```

### Confidence

- 87 for the UI scope
- 78 for landing LM Studio selection UI in the same ticket

Low-confidence note:
- Keep LM Studio out of the visible phase-1 UI unless the adapter already exists and is tested. Otherwise the UI gets ahead of runtime truth.

## Ticket 5: Durable docs, ADR closeout, verification, and review

### Goal

Align durable docs with shipped behavior, convert the draft ADR to accepted or superseded state as appropriate, and close the rollout only after verification and two review passes.

### Approach

Keep this PR documentation- and verification-focused. Any product behavior fix discovered during this phase should go back to the owning ticket unless it is trivially local and review-safe.

### Files in scope

- `specs/spec.md`
- `specs/user-flow.md`
- `docs/adr/0003-local-llm-cleanup-runtime-and-fallback.md`
- completed temporary local-LLM planning or research docs only if they should truly be archived or deleted

### Checklist

- Update durable spec text for cleanup settings, pipeline order, and fallback behavior.
- Update user-flow docs if cleanup changes a visible flow materially.
- Accept, supersede, or explicitly keep the ADR as proposed with a reason.
- Run verification commands.
- Run sub-agent review.
- Run second-model review.
- Fix or document findings before closeout.

### Tasks

1. Update `specs/spec.md`.
2. Update `specs/user-flow.md` if needed.
3. Update ADR status and consequences based on shipped implementation.
4. Run targeted tests and docs validation.
5. Run review pass 1 with a sub-agent focused on risks and ticket granularity.
6. Run review pass 2 with Claude.
7. Fix findings or document remaining risks.

### Definition of Done

- Durable docs match shipped cleanup behavior.
- The ADR state is no longer ambiguous relative to implementation.
- Verification passes are recorded.
- Review findings are resolved or explicitly accepted with rationale.

### Trade-offs

- Keeping docs cleanup at the end preserves one-ticket/one-PR discipline, but it requires resisting the temptation to sneak behavior fixes into the documentation PR.

### Example code sketch

```md
- Cleanup runs after dictionary replacement and before transformation.
- If cleanup fails, Dicta outputs the corrected transcript unchanged.
```

### Confidence

- 93 for the closeout shape

## Risks and review prompts

### Main risks

- Backward compatibility: older settings files may not have cleanup fields and must normalize safely.
- Forward compatibility: if persisted settings expose unshipped runtime values now, future migration paths will create dead or ambiguous config states.
- Forward compatibility: if the runtime contract leaks Ollama-specific assumptions now, LM Studio or embedded runtime support will become expensive later.
- Maintainability: letting runtime inventory drive the Settings UI directly will create support drift and model-sprawl pressure.
- Trust: cleanup overreach can silently delete names, numbers, or domain-specific terms.
- UX drift: UI that exposes unsupported runtimes or arbitrary models before the adapters exist will create broken configuration states.

### Review prompts

- Is there a cleaner option than native `fetch` for phase 1 that still avoids dependency and packaging risk?
- Is any ticket too large for one reviewable PR?
- Does any ticket mix contract work, runtime work, and UI work too early?
- Are the 5-model cap and curated-manifest rules enforced in code, not just in docs?
- Are fallback rules owned by the pipeline instead of the adapter?
- Is anything below 80 confidence being pulled into the first shipping slice anyway?

## Explicit defer list

These items should not enter the first cleanup rollout unless the plan is revised:
- embedded `llama.cpp`
- `@electron/llm`
- `node-llama-cpp`
- LM Studio adapter implementation
- cleanup aggressiveness sliders
- more than 5 supported local models
- transformation reuse beyond keeping the shared runtime seam ready
