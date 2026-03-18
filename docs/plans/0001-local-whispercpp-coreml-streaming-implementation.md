---
title: Implement local whisper.cpp Core ML streaming STT
description: Step-by-step ticket plan for adding Apple Silicon local streaming STT with raw dictation and transformed output using the existing STT settings flow.
date: 2026-03-18
status: active
review_by: 2026-03-25
links:
  decision: ADR-0001, ADR-0002
tags:
  - plan
  - streaming
  - whispercpp
  - coreml
  - stt
---

<!--
Where: docs/plans/0001-local-whispercpp-coreml-streaming-implementation.md
What: Execution plan for delivering local whisper.cpp Core ML streaming support in small PR-sized tickets.
Why: Keep implementation scoped, reviewable, and aligned with the approved architecture before coding begins.
-->

# Local Whisper.cpp Core ML Streaming Implementation Plan

## Goal

Deliver Apple Silicon macOS local streaming STT through the existing STT provider/model settings flow, with:

- install-if-missing model management
- raw dictation streaming output
- transformed streaming output using the existing default preset
- utterance-finalized chunk processing rather than word-by-word transformation
- locked paste-at-cursor output semantics while local streaming is selected

## Constraints

- one ticket maps to one PR
- tickets are ordered by dependency and delivery priority
- do not start implementation outside the current ticket
- keep current cloud batch STT behavior working throughout
- target support is Apple Silicon macOS only

## Architecture Baseline

This plan assumes the architecture chosen in ADR-0002:

- helper-backed native session for `local_whispercpp_coreml`
- renderer PCM capture and coarse-batched IPC into main
- main-process ownership of lifecycle, transform dispatch, activity state, and ordered output
- no localhost service, renderer-side inference path, or first-version Node addon path

## Delivery Order

1. Ticket 1: settings and provider contract introduction
2. Ticket 2: output lock and legacy routing removal
3. Ticket 3: local model install manager
4. Ticket 4: main-process local session orchestration and renderer PCM capture
5. Ticket 5: native whisper.cpp helper and main-process supervision
6. Ticket 6: raw dictation streaming output lane
7. Ticket 7: transformed streaming output lane
8. Ticket 8: hardening, observability, and end-to-end validation

## Ticket 1

### Title

Settings contract and provider introduction

### Priority

P0

### Goal

Introduce the local provider and model contract in shared settings and UI, without yet removing legacy routing code, so later tickets can land on a stable user-facing selection model.

### Approach

Use the existing STT settings UI and domain schema. Add `local_whispercpp_coreml` with canonical model ids `whispercpp-base-streaming` and `whispercpp-small-streaming`, and gate visibility to Apple Silicon macOS.

### Scope files

- `src/shared/domain.ts`
- `src/shared/*settings*`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/main/*settings*`
- `specs/spec.md`

### Checklist

- add provider id `local_whispercpp_coreml`
- add canonical model ids `whispercpp-base-streaming` and `whispercpp-small-streaming`
- expose local options only on Apple Silicon macOS
- infer local streaming from selected provider/model

### Tasks

- extend shared settings/domain types for the new local provider and models
- add platform gating helper in renderer and main
- update provider/model form rendering and validation
- add focused unit tests for settings validation and UI gating

### Gates

- local provider cannot be selected on unsupported platforms
- tests cover provider gating and canonical local model ids

### Trade-offs

- splitting schema/UI introduction from legacy cleanup costs one extra PR, but it keeps the first contract change reviewable
- platform gating in UI plus runtime is slightly duplicated, but prevents both bad UX and unsupported execution

### Code shape

```ts
const isLocalStreamingProvider =
  settings.transcription.provider === "local_whispercpp_coreml";
```

## Ticket 2

### Title

Output lock and legacy routing removal

### Priority

P0

### Goal

Remove duplicate routing state and enforce the local provider’s paste-only output semantics in UI and runtime.

### Approach

Delete stale `processing.mode` style routing and output-mode scaffolding. Replace it with provider-derived routing and effective output policy when `local_whispercpp_coreml` is selected.

### Scope files

- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-recording-react.tsx`
- `src/main/routing/*`
- `src/main/core/command-router.ts`
- `src/main/services/output-service.ts`
- `src/main/tests/*routing*`
- `specs/spec.md`

### Checklist

- remove duplicate processing-mode routing state
- derive routing only from STT provider/model
- lock output controls to paste-only when local provider is selected
- show explanatory hover or helper text for locked controls
- preserve existing cloud batch output behavior

### Tasks

- delete obsolete route-selection code paths and tests
- update command routing to branch on provider/model only
- update output settings UI to enforce effective local-streaming policy
- add unit tests for provider-derived routing and locked output semantics

### Gates

- no remaining runtime path depends on `processing.mode` or equivalent duplicate routing state
- local provider selection forces paste-at-cursor and disables copy-to-clipboard in the UI
- hover/help text explains the lock reason

### Trade-offs

- removing legacy scaffolding early is riskier than keeping compatibility shims, but it prevents every later ticket from carrying invalid state branches
- enforcing locked output in both UI and runtime adds duplication, but avoids accidental drift between presentation and behavior

### Code shape

```ts
const effectiveOutput = isLocalStreamingProvider(settings)
  ? { copyToClipboard: false, pasteAtCursor: true }
  : loadUserOutputPolicy(settings);
```

## Ticket 3

### Title

Local model installation and preparation manager

### Priority

P0

### Goal

Guarantee the selected local model artifacts are present and valid before a session starts, with explicit install failure handling instead of hidden partial failures.

### Approach

Introduce a main-process `LocalModelManager` that owns model presence checks, download, extraction, integrity checks, and install failure mapping. Store assets in app-managed writable data storage, never in the signed app bundle. Core ML prepare and warm-up remain the responsibility of the native helper ticket.

### Scope files

- `src/main/services/local-model-manager.ts`
- `src/main/services/download-service.ts`
- `src/main/config/*`
- `src/main/ipc/*`
- `src/shared/domain.ts`
- `src/shared/events/*`
- `src/main/tests/*model*`
- `specs/spec.md`

### Checklist

- define install root and model metadata
- support `ggml-base.bin` and `ggml-small.bin`
- support matching Core ML encoder bundle downloads and extraction
- expose install-phase failure mapping
- fail fast if encoder bundle is missing or unreadable
- add retry-safe atomic install behavior

### Tasks

- define manifest/constants for model URLs and expected artifacts
- implement presence check for `.bin` and `-encoder.mlmodelc`
- download to temp paths and move atomically into final location
- expose progress/status events to main session control
- map install failures to `model_install_failed`
- add unit tests around partial installs, corrupted zip, and resume behavior

### Gates

- session startup cannot proceed until both model artifacts are valid
- partial installs cannot be reported as ready
- failed installs surface actionable errors with model id and phase
- emitted terminal statuses align with `model_install_failed` ownership

### Trade-offs

- bundling models in the app would simplify runtime but explode package size and release complexity
- runtime install is more complex but keeps the app distributable and lets users choose `base` vs `small`

### Code shape

```ts
type SessionTerminalStatus =
  | "session_start_failed"
  | "model_install_failed"
  | "model_prepare_failed"
  | "stream_interrupted";
```

## Ticket 4

### Title

Main-process local session orchestration and renderer PCM capture

### Priority

P0

### Goal

Replace stop-then-submit blob behavior for the local provider path with continuous PCM frame delivery and a main-process session controller suitable for a long-lived local session.

### Approach

Keep the existing blob recording path for cloud providers. Add a local renderer capture branch that produces PCM batches, and introduce a main-process session controller that bridges renderer IPC directly to the helper-backed native session defined in ADR-0002 and delivered in Ticket 5.

### Scope files

- `src/renderer/native-recording.ts`
- `src/renderer/*recording*`
- `src/preload/*`
- `src/shared/ipc.ts`
- `src/main/ipc/*recording*`
- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/renderer/tests/*recording*`
- `src/main/tests/*streaming-session*`

### Checklist

- start local session
- stream PCM batches
- stop local session
- cancel local session during install/prepare/start/active
- avoid tiny per-frame IPC messages
- pass selected language into the local session start request
- keep cloud recording path unchanged

### Tasks

- add local session controller state machine
- add renderer capture branch for local provider selection
- choose batch size target, for example 50-100 ms PCM chunks
- add IPC methods for `startLocalStreamingSession`, `appendLocalStreamingAudio`, `stopLocalStreamingSession`, `cancelLocalStreamingSession`
- bridge controller state to model manager readiness and the helper-backed session lifecycle
- add renderer cleanup for device change, cancel, and focus loss cases
- pass `outputLanguage` through session startup
- test command responsiveness during in-flight streaming

### Gates

- cloud providers still use the old blob-based path
- local provider uses only PCM session IPC
- cancel works during install, prepare, start, and active phases

### Trade-offs

- `MessagePort` or shared memory may be ideal later, but a coarse-batched IPC path is a lower-risk first delivery
- keeping two capture paths adds branching, but avoids destabilizing cloud transcription

### Code shape

```json
{ "kind": "startLocalStreamingSession", "sessionId": "uuid", "model": "whispercpp-base-streaming", "language": "en" }
{ "kind": "appendLocalStreamingAudio", "sessionId": "uuid", "pcm": "..." }
{ "kind": "stopLocalStreamingSession", "sessionId": "uuid" }
```

## Ticket 5

### Title

Native whisper.cpp helper and main-process supervision

### Priority

P0

### Goal

Provide a supervised native helper that owns whisper.cpp model loading, Core ML prepare/warm-up, recognition hints, utterance finalization, and helper health signaling, isolated from the Electron main process.

### Approach

Build a bundled helper process around whisper.cpp with `WHISPER_COREML=1`. Communicate with Electron main over a narrow session protocol. The helper owns model load, Core ML prepare/warm-up, dictionary hint mapping, max-utterance forced boundaries, and VAD-bounded chunk finalization.

### Scope files

- `native/local-whisper-helper/*`
- `scripts/*build*`
- `package.json`
- `electron-builder*` or packaging config
- `src/main/services/local-whisper-process-supervisor.ts`
- `src/main/tests/*helper*`
- `specs/spec.md`

### Checklist

- helper starts with selected model and language
- helper loads Core ML encoder bundle
- helper receives recognition hints when available
- helper exposes explicit prepare/warm-up state
- helper emits finalized chunk events
- helper enforces a max-utterance forced-boundary safeguard
- helper crash or unhealthy state becomes a typed session failure

### Tasks

- define helper protocol messages
- wire helper process lifecycle, stderr/stdout, and health monitoring
- implement model load, frame append, stop, and cancel commands
- pass `language` and recognition hints in the start message
- emit `installing_model`, `preparing_model`, `active`, `error`, and `end` status events
- emit `final`, `error`, and `end` events with sequence numbers
- force a finalized boundary when utterance duration exceeds the configured maximum
- add failure tests for startup, load, crash, and unhealthy-session cases

### Gates

- no silent non-Core-ML fallback in the local path
- helper failure is distinguishable from normal session end
- prepare/warm-up state is observable before the session becomes active
- recognition hints and language are passed into helper startup
- continuous speech without pauses still produces finalized chunks

### Trade-offs

- a helper process adds packaging and protocol work, but isolates crashes and keeps native complexity out of TypeScript
- a `.node` addon would reduce IPC overhead but would increase Electron ABI and crash-coupling risk

### Code shape

```ts
helperSupervisor.start({
  sessionId,
  model,
  language,
  dictionaryTerms,
});
```

## Ticket 6

### Title

Raw dictation streaming output lane

### Priority

P1

### Goal

Commit finalized local chunks immediately as raw dictation while preserving source order, active-session cancel behavior, and paste-only output semantics.

### Approach

Introduce a local session controller and ordered output path for finalized chunks. Raw dictation bypasses transformation entirely and commits each finalized chunk directly once it is eligible in sequence order, while leaving a clear transform dispatch seam for Ticket 7.

### Scope files

- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/services/output-service.ts`
- `src/main/services/activity-publisher.ts`
- `src/main/tests/*streaming*`
- `src/renderer/*activity*`

### Checklist

- session starts and stops cleanly
- finalized chunks are emitted immediately
- output commits stay in speech order
- cancel during an active local session stops future commits cleanly
- paste-only semantics are enforced
- raw text remains visible in activity/debug state

### Tasks

- add local session controller state machine
- adapt ordered output coordinator for session-scoped chunk sequencing and a future transform dispatch seam
- commit raw finalized chunks to output
- publish per-chunk activity and terminal state to renderer
- ensure active-session cancel discards uncommitted future chunks
- add tests for out-of-order arrival, output ordering, and active cancel behavior

### Gates

- raw dictation never waits for full-session completion
- output is ordered even if helper timing varies
- no clipboard-copy user mode is exposed while local provider is selected
- active cancel stops future output commits for the cancelled session

### Trade-offs

- reusing the ordered output coordinator reduces duplication, but Ticket 6 must leave a stable transform dispatch seam so Ticket 7 is additive rather than a refactor
- exposing raw text in activity state helps debugging, but should stay out of user-facing output when transformed mode is selected

### Code shape

```ts
orderedOutput.enqueue({
  streamId: sessionId,
  sequence,
  text: finalizedText,
  mode: "stream_raw_dictation",
});
```

## Ticket 7

### Title

Transformed streaming output lane

### Priority

P1

### Goal

Transform each finalized utterance chunk exactly once using the existing default transformation preset, while keeping chunk output ordered and bounded under backpressure.

### Approach

Bind the current default preset when each chunk is enqueued, run transforms concurrently through a bounded worker pool, retain raw chunk text in activity/debug state, and commit only transformed text to user-facing output.

### Scope files

- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/main/services/transformation-service.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/tests/*transform*`
- `src/renderer/*activity*`
- `specs/spec.md`

### Checklist

- transform runs once per finalized chunk
- no per-word transform behavior exists
- preset binding occurs at enqueue time
- raw text remains visible in activity/debug state
- transformed output commits in original chunk order
- failed chunk transforms do not stop later chunks
- transform backpressure is bounded and observable

### Tasks

- map `output.selectedTextSource=transformed` to effective mode `stream_transformed`
- bind `defaultPresetId` snapshot per chunk
- run chunk transforms through a bounded worker pool with explicit backpressure behavior
- update ordered output coordinator to wait for missing earlier transforms
- publish both raw and transformed chunk states to activity/debug UI
- test transform failure isolation, backpressure, and preset snapshot behavior

### Gates

- chunks are transformed only after utterance finalization
- transformed output is ordered even when transform completion is out of order
- later chunks continue after one chunk transform fails
- bounded in-flight transforms and backpressure behavior are covered by tests

### Trade-offs

- preserving raw chunk text improves debugging, but increases temporary runtime state
- ordered commit may delay a ready transformed chunk behind an earlier slow chunk, but it keeps pasted text coherent

### Code shape

```ts
transformPool.enqueue({
  sessionId,
  sequence,
  sourceText: finalizedText,
  preset: boundDefaultPreset,
});
```

## Ticket 8

### Title

Hardening, observability, packaging, and end-to-end validation

### Priority

P2

### Goal

Make the feature operationally safe enough to ship by covering install, startup, crash, ordering, packaging, and UX edge cases with tests and diagnostics.

### Approach

Use focused logs and activity states around install, prepare, active, stopping, and failed phases. Add end-to-end and integration coverage for the critical paths rather than over-mocking the session. Keep helper packaging/signing visible as an explicit ship gate, not background work.

### Scope files

- `src/main/services/*logger*`
- `src/main/services/activity-publisher.ts`
- `test/e2e/*`
- `test/integration/*`
- `electron-builder*` or packaging config
- `docs/e2e-playwright.md`
- `docs/release-checklist.md`
- `specs/spec.md`

### Checklist

- install, prepare, active, stop, fail states are observable
- helper crash and model failure are diagnosable
- Apple Silicon-only exposure is verified
- e2e coverage exists for raw and transformed streaming
- docs are updated for release and test workflow
- helper packaging/signing wiring is validated in a packaged build path

### Tasks

- add correlation ids for local sessions and chunk sequences
- add integration tests for helper crash, forced utterance boundary, and cancel during prepare
- add Playwright coverage for settings gating and locked output UI
- add manual validation steps for first-run model install and warm-up UX
- add packaged-build checks for bundled helper signing/notarization wiring
- update release/testing docs for native helper packaging checks

### Gates

- failures identify phase, model, and session id
- end-to-end coverage exists for raw dictation and transformed chunk mode
- release checklist covers helper packaging and model-install smoke checks
- helper packaging/signing is tested before declaring the feature shippable

### Trade-offs

- more instrumentation adds code surface, but local native helpers are too opaque to ship without it
- full live-model e2e will be slower and more brittle, so keep most cases at integration level and reserve e2e for core user flows

### Code shape

```ts
logger.info("local_stream_chunk_committed", {
  sessionId,
  sequence,
  mode,
  model,
  status,
});
```

## Risks Across Tickets

- native helper packaging and signing may block functional progress late if deferred
- large model install and first-run Core ML warm-up can look like hangs without explicit UI state
- ordered output can mask throughput issues if transform backpressure is not bounded
- renderer PCM transport can become CPU-heavy if batch sizing is wrong
- explicit spec safeguards to track across implementation:
  - max-utterance forced-boundary handling
  - spec terminal status names
  - helper crash and unhealthy-session detection
  - per-chunk activity/debug state

## Recommended PR Sequence

- PR 1: Ticket 1 only
- PR 2: Ticket 2 only
- PR 3: Ticket 3 only
- PR 4: Ticket 4 only
- PR 5: Ticket 5 only
- PR 6: Ticket 6 only
- PR 7: Ticket 7 only
- PR 8: Ticket 8 only
