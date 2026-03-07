<!--
Where: docs/plans/2026-03-07-streaming-stt-prioritized-execution-plan.md
What: Prioritized ticket-by-ticket execution plan for streaming STT, grounded in PR 396 review findings, current codebase architecture, and current provider documentation.
Why: Freeze a realistic implementation sequence before coding so raw streaming lands first, transformed streaming lands on stable foundations, and each PR stays reviewable.
-->

# Execution Plan: Streaming STT

Date: 2026-03-07  
Status: Planning only. No implementation started.

## Inputs Reviewed

- PR 396 review report:
  - `docs/reviews/2026-03-06-pr-396-streaming-transform-window-plus-rolling-summary-review.md`
- Streaming research and decisions:
  - `docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md`
  - `docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md`
  - `docs/research/2026-03-06-streaming-speech-to-text-support-architecture-research.md`
  - `docs/decisions/2026-03-06-streaming-mode-paste-only-output.md`
  - `docs/decisions/2026-03-06-streaming-transform-window-plus-rolling-summary-decision.md`
- Current runtime files:
  - `src/renderer/native-recording.ts`
  - `src/main/core/command-router.ts`
  - `src/main/orchestrators/recording-orchestrator.ts`
  - `src/main/orchestrators/capture-pipeline.ts`
  - `src/main/orchestrators/transform-pipeline.ts`
  - `src/main/coordination/ordered-output-coordinator.ts`
  - `src/main/services/output-service.ts`
  - `src/main/services/transcription-service.ts`
  - `src/main/services/transformation/types.ts`
  - `src/main/services/transformation/prompt-format.ts`
  - `src/main/ipc/register-handlers.ts`
  - `src/preload/index.ts`
  - `src/shared/domain.ts`
  - `src/shared/ipc.ts`
- Current official provider/runtime docs reviewed on 2026-03-07:
  - Groq Speech-to-Text docs: <https://console.groq.com/docs/speech-to-text>
  - Groq Audio Transcriptions API: <https://console.groq.com/docs/api-reference#tag/audio/post/audio/transcriptions>
  - `whisper.cpp` README: <https://github.com/ggml-org/whisper.cpp/blob/master/README.md>
  - `whisper.cpp` streaming example: <https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream>

## Planning Constraints

- `1 ticket = 1 PR`.
- Tickets are sorted by dependency and shipping value, not by team preference.
- Mid-term goal is raw dictation stream only.
- Long-term goal is real-time dictation plus transformed text.
- The current batch path must remain intact while streaming is added as a new lane.
- Each ticket must land with at least one automated test update and docs updates.
- Each implementation PR must pass two review passes:
  - sub-agent review first
  - Claude review second

## Architecture Readout

### Current Architecture Reality

The current runtime is batch-only:

1. Renderer starts a browser `MediaRecorder`.
2. Renderer buffers `dataavailable` chunks in memory.
3. Renderer waits for `stop`.
4. Renderer sends one completed blob through `submitRecordedAudio`.
5. Main persists one file and builds one frozen capture snapshot.
6. `CaptureQueue` runs batch STT, optional batch transform, then one output commit.

That means there is currently:

- no frame-level PCM ingress contract
- no active streaming session state
- no provider-neutral streaming adapter
- no canonical finalized-segment model
- no live session event surface in IPC/preload/renderer
- no per-session ordered output coordinator

### What PR 396 Changed for Planning

PR 396 is useful because it settles one long-term direction and exposes five immediate gaps:

1. `window + rolling summary` is acceptable for transformed streaming, but only after raw finalized-segment infrastructure exists.
2. The current codebase is materially less streaming-ready than the original transform research implied.
3. Streaming output semantics should be paste-only from the user point of view.
4. Provider strategy must be reconciled with actual implementation goals.
5. The transform contract must become structured before `stream_transformed` is implementable.

### Recommended Target Stack

The right architecture is a parallel streaming lane, not micro-captures pushed through the batch queue:

```ts
type ProcessingMode = 'default' | 'streaming' | 'transform_only'

CommandRouter
  -> default: existing CaptureQueue / TransformQueue
  -> streaming: StreamingSessionController

StreamingSessionController
  -> StreamingAudioIngress
  -> StreamingSttAdapter
  -> SegmentAssembler
  -> stream_raw_dictation => StreamingOrderedOutputCoordinator -> OutputService
  -> stream_transformed => ContextManager -> SegmentTransformWorkerPool -> StreamingOrderedOutputCoordinator -> OutputService
```

### Provider Posture

This plan intentionally changes the provider posture from the earlier Apple/OpenAI-first research to match the requested product goal and current official docs.

Selected posture:

- Local mid-term provider: `local_whispercpp_coreml`
- Cloud mid-term provider: `groq_whisper_large_v3_turbo_chunked`
- Long-term cloud-native realtime candidate: leave open behind adapter contract

Reasoning:

- `whisper.cpp` already documents realtime microphone streaming and Core ML acceleration, so it can serve as the first true streaming reference implementation.
- Groq currently documents high-speed file transcription, but not a first-class realtime STT session contract equivalent to a native streaming socket/session API.
- If Groq is forced into the first provider slot, the architecture risks being shaped around rolling uploads instead of true session streaming.
- Therefore the platform and adapter contracts must be truly model/provider agnostic, but the first technically correct streaming implementation should be local `whisper.cpp` with Core ML.

### Delivery Principle

Raw streaming must be the canonical substrate. Transformed streaming is a dependent lane.

That means:

- `stream_raw_dictation` ships before `stream_transformed`
- finalized raw segments are the source of truth
- transform work may be concurrent, but output commit order must follow finalized source sequence
- transform failure falls back to raw and must not terminate the session

### Rejected Approaches

- Rejected: route streaming through fake batch micro-captures.
  - Why: it leaks session semantics into a file-based queue and makes provider normalization, output ordering, and retries harder.
- Rejected: design around Groq as if it already had native realtime STT sessions.
  - Why: current official docs do not justify that assumption.
- Rejected: implement transformed streaming before raw finalized-segment ordering exists.
  - Why: PR 396 review explicitly shows that the transform lane depends on missing lower-layer runtime work.

## Priority and Sequencing

| Priority | Ticket | PR | Outcome | Depends On | Feasibility | Main Risk |
|---|---|---|---|---|---|---|
| P0 | SSTT-01 Contract and provider reconciliation | PR-1 | Freeze streaming schema, mode rules, provider posture, and docs | None | High | Leaving spec/runtime/provider drift unresolved |
| P1 | SSTT-02 Streaming control plane and routing | PR-2 | Add streaming mode, IPC, and router/session entry contracts | PR-1 | High | Mode drift between main/renderer/settings |
| P2 | SSTT-03A Streaming session state and event runtime | PR-3 | Add session lifecycle implementation and activity publication without audio ingress | PR-2 | High | Controller boundary ambiguity between routing and renderer |
| P3 | SSTT-03B Renderer audio ingress and IPC frame transport | PR-4 | Add PCM ingress, AudioWorklet transport, batching, and backpressure | PR-3 | Medium | Audio ingress and IPC copy-pressure mistakes |
| P4 | SSTT-03C Segment assembly, per-session ordering, and clipboard safety | PR-5 | Add canonical final segments, delimiter rules, and ordered raw commit substrate | PR-4 | Medium | Weak output semantics causing rework in every provider |
| P5 | SSTT-04 Local `whisper.cpp` + Core ML provider | PR-6 | First true streaming raw dictation provider | PR-4, PR-5 | Medium | Packaging, model lifecycle, and latency on real hardware |
| P6 | SSTT-05 Cloud provider baseline + Groq rolling-upload adapter | PR-7 | Cloud raw dictation lane with model-agnostic adapter surface | PR-4, PR-5 | Medium | Mistaking near-realtime chunking for native streaming |
| P7 | SSTT-06 Raw streaming UX, hardening, and release gates | PR-8 | User-facing settings/UI, session diagnostics, hardening, QA gates | PR-6, PR-7 | Medium | Paste/focus failures and poor operator visibility |
| P8 | SSTT-07 Structured transformed-stream contract and context manager | PR-9 | Implementation-ready `segment + window + summary` payload contract | PR-8 | Medium | Vague payload design causing prompt drift and weak tests |
| P9 | SSTT-08 `stream_transformed` execution lane | PR-10 | Concurrent transformed streaming with raw fallback and ordered commit | PR-9 | Medium-Low | Out-of-order completion, fallback, and long-session decay |

Priority rationale:

- PR-1 must land first because the current spec, research, and requested provider goals do not match.
- PR-2 through PR-5 establish the irreversible architecture seam; delaying them makes later provider work unstable.
- PR-4 and PR-5 are split because renderer frame transport and main-process ordered output touch different failure domains.
- PR-6 is intentionally ahead of PR-7 because `whisper.cpp` is the first true streaming provider and de-risks the session/audio/event model.
- PR-7 then proves the cloud adapter surface without forcing the entire design around Groq chunk uploads.
- PR-6 and PR-7 can proceed in parallel after PR-5 if the shared adapter contract is stable.
- PR-9 and PR-10 are long-term by design because PR 396 shows transformed streaming should not be treated as a small additive patch.

---

## Ticket SSTT-01 (P0): Contract and Provider Reconciliation -> PR-1

### Goal

Freeze one implementation-grade streaming contract that matches the requested roadmap:

- mid-term: raw dictation only
- local provider: `whisper.cpp` + Core ML
- cloud baseline: model-agnostic contract, initial Groq `whisper-large-v3-turbo`
- long-term: transformed streaming on top of finalized raw segments

### Approach

- Extend shared settings schema with `processing.mode` and `processing.streaming.*`.
- Update spec/research/decision docs so local streaming is no longer Apple-only and cloud streaming no longer assumes native realtime support where docs do not prove it.
- Encode paste-only streaming semantics directly in validation rules.
- Add a streaming provider taxonomy that distinguishes native session streaming from rolling-upload streaming.

### Scope Files

- `src/shared/domain.ts`
- `src/shared/domain.test.ts`
- `specs/spec.md`
- `docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md`
- `docs/research/2026-03-06-streaming-speech-to-text-support-architecture-research.md`
- `docs/decisions/2026-03-06-streaming-mode-paste-only-output.md`
- New:
  - `contracts/provider-contract-manifest.json`
  - `src/main/services/provider-contract-manifest.ts`
  - `src/main/services/provider-contract-manifest.test.ts`
  - `docs/decisions/2026-03-07-streaming-provider-posture-decision.md`

### Trade-offs

- Selected: provider-agnostic schema with explicit transport capability.
  - Pros: keeps Groq viable now without pretending it is native realtime.
  - Cons: slightly more schema surface up front.
- Rejected: keep Apple/OpenAI-specific spec while implementing `whisper.cpp`/Groq.
  - Pros: less doc churn immediately.
  - Cons: guarantees architectural drift and future confusion.

### Proposed Snippets (non-applied)

```ts
export type StreamingTransportKind = 'native_stream' | 'rolling_upload'
export type StreamingProvider =
  | 'local_whispercpp_coreml'
  | 'groq_whisper_large_v3_turbo'

export interface StreamingSettings {
  enabled: boolean
  provider: StreamingProvider | null
  transport: StreamingTransportKind | null
  model: string | null
  apiKeyRef: string | null
  outputMode: 'stream_raw_dictation' | 'stream_transformed' | null
  language: 'auto' | 'en' | 'ja'
  delimiterPolicy: { mode: 'none' | 'space' | 'newline' | 'custom'; value: string | null }
}
```

### Tasks

1. Add `processing.mode` and `processing.streaming.*` to the canonical settings schema.
2. Add validation rules for:
   - `mode=streaming` requires `streaming.enabled=true`
   - streaming requires explicit provider/model
   - `stream_raw_dictation` and `stream_transformed` force effective paste semantics
   - `stream_transformed` is blocked until transform prerequisites are present
3. Extend provider contract manifest with streaming transport metadata and verification date.
4. Add an explicit decision doc that supersedes the earlier Apple/OpenAI-first posture for the mid-term implementation sequence.
5. Rewrite spec/research language that currently hardcodes Apple/OpenAI as the immediate implementation path.
6. Document that Groq is the first cloud provider implementation but currently uses rolling upload, not native session realtime.
7. Add validation coverage to prove the new settings matrix is deterministic, including delimiter policy.

### Checklist

- [ ] Shared schema contains `processing.mode` and `processing.streaming.*`.
- [ ] Streaming validation rejects conflicting output/credential combinations.
- [ ] Delimiter policy is part of the canonical streaming settings shape.
- [ ] Provider manifest distinguishes native streaming vs rolling-upload capability.
- [ ] Provider posture decision doc exists and is referenced by plan/spec text.
- [ ] Spec/docs align with requested mid-term and long-term goals.
- [ ] At least one automated validation/provider-manifest test is added or updated.

### Gates

- [ ] `pnpm test -- src/shared/domain.test.ts src/main/services/provider-contract-manifest.test.ts`
- [ ] `pnpm typecheck`
- [ ] Search gate: `rg -n "Apple Speech|OpenAI Realtime" specs docs | rg "required|preferred local|preferred cloud"` shows only intentional, reconciled references.
- [ ] Schema gate: invalid streaming setting combinations fail validation in tests.

---

## Ticket SSTT-02 (P1): Streaming Control Plane and Routing -> PR-2

### Goal

Add the streaming control plane without changing the batch data plane:

- settings-driven `streaming` mode
- start/stop session commands
- streaming session and segment event IPC
- `CommandRouter` entry point for the streaming lane

### Approach

- Extend `ProcessingMode` and resolve it from persisted settings rather than `DefaultProcessingModeSource`.
- Add explicit IPC contracts for `startStreamingSession`, `stopStreamingSession`, `onStreamingSessionState`, `onStreamingSegment`, and `onStreamingError`.
- Introduce a `StreamingSessionController` interface and wire it in `register-handlers.ts`, but keep provider/runtime internals minimal until PR-3.
- Preserve existing batch `submitRecordedAudio` path unchanged.

### Scope Files

- `src/main/routing/processing-mode.ts`
- `src/main/routing/processing-mode-source.ts`
- `src/main/routing/processing-mode-source.test.ts`
- `src/main/routing/mode-router.ts`
- `src/main/routing/mode-router.test.ts`
- `src/main/core/command-router.ts`
- `src/main/core/command-router.test.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/ipc/register-handlers.test.ts`
- New:
  - `src/main/services/streaming/streaming-session-controller.ts` (interface/minimal stub only)
  - `src/main/services/streaming/streaming-session-controller.test.ts`

### Trade-offs

- Selected: explicit streaming IPC/control plane.
  - Pros: clear contracts, easier testing, better preload isolation.
  - Cons: more up-front surface area.
- Rejected: overload `runRecordingCommand` and `submitRecordedAudio` with hidden streaming semantics.
  - Pros: fewer API names.
  - Cons: ambiguous behavior and weak testability.

### Proposed Snippets (non-applied)

```ts
export interface IpcApi {
  startStreamingSession(): Promise<void>
  stopStreamingSession(): Promise<void>
  onStreamingSessionState(listener: (state: StreamingSessionState) => void): () => void
  onStreamingSegment(listener: (segment: StreamingSegmentEvent) => void): () => void
}
```

```ts
if (mode === 'streaming') {
  return this.streamingSessionController.start()
}
```

### Tasks

1. Add `'streaming'` to `ProcessingMode`.
2. Replace hardcoded `DefaultProcessingModeSource` behavior with settings-backed resolution.
3. Add start/stop streaming router commands and event channels.
4. Expose streaming IPC through preload with unsubscribe-safe listeners.
5. Wire a controller interface in the main composition root.
6. Keep `StreamingSessionController` as an interface or minimal stub only in this PR; runtime state logic lands in PR-3.
7. Add tests proving:
   - batch mode still routes to batch capture
   - streaming mode routes to streaming controller
   - IPC channels are registered and removed correctly

### Checklist

- [ ] `processing.mode` is authoritative for routing.
- [ ] Streaming commands exist without disturbing batch blob submission.
- [ ] Preload exposes streaming listeners and commands.
- [ ] Main composition root can construct the streaming controller.
- [ ] Tests cover both default and streaming mode routing.

### Gates

- [ ] `pnpm test -- src/main/routing/processing-mode-source.test.ts src/main/routing/mode-router.test.ts src/main/core/command-router.test.ts src/main/ipc/register-handlers.test.ts`
- [ ] `pnpm typecheck`
- [ ] Contract gate: no streaming path requires `submitRecordedAudio`.
- [ ] Regression gate: batch capture tests still pass unchanged.

---

## Ticket SSTT-03A (P2): Streaming Session State and Event Runtime -> PR-3

### Goal

Build the controller runtime without audio transport complexity:

- active session state machine
- live activity publication
- terminal reasons and duplicate-start/stop behavior

### Approach

- Implement the full `StreamingSessionController` state machine behind the PR-2 interface stub.
- Publish session lifecycle updates through `StreamingActivityPublisher`.
- Keep audio ingress, segment assembly, and per-session ordering out of this PR.
- Use fake/in-memory segment-free controller tests to prove lifecycle semantics first.

### Scope Files

- New:
  - `src/main/services/streaming/streaming-session-controller.ts`
  - `src/main/services/streaming/streaming-session-controller.test.ts`
  - `src/main/services/streaming/streaming-activity-publisher.ts`
  - `src/main/services/streaming/streaming-activity-publisher.test.ts`
  - `src/main/services/streaming/types.ts`
- `src/shared/ipc.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/ipc/register-handlers.test.ts`

### Trade-offs

- Selected: split lifecycle/controller work away from audio ingress.
  - Pros: smaller PR, clearer failure modes, easier tests.
  - Cons: one extra foundational PR before the first provider.
- Rejected: combine controller, ingress, segment assembly, and ordering in one runtime PR.
  - Pros: fewer top-level tickets.
  - Cons: too much coupled change for one reviewable PR.

### Proposed Snippets (non-applied)

```ts
type StreamingSessionState = 'idle' | 'starting' | 'active' | 'stopping' | 'ended' | 'failed'

interface StreamingSessionController {
  start(): Promise<void>
  stop(reason?: 'user_stop' | 'provider_end' | 'fatal_error'): Promise<void>
  getState(): StreamingSessionState
}
```

### Tasks

1. Replace the PR-2 controller stub with a real lifecycle implementation.
2. Add one active-session state machine with duplicate-start rejection and idempotent stop.
3. Define session state and terminal-reason event types.
4. Publish live session updates to the renderer through `StreamingActivityPublisher`.
5. Add tests for:
   - duplicate start rejection
   - stop cleanup
   - terminal error transition
   - renderer event publication

### Checklist

- [ ] Session state transitions are explicit and test-covered.
- [ ] Renderer can observe lifecycle transitions before audio ingress exists.
- [ ] Controller runtime is clearly separated from adapter and ingress concerns.

### Gates

- [ ] `pnpm test -- src/main/services/streaming/streaming-session-controller.test.ts src/main/ipc/register-handlers.test.ts`
- [ ] `pnpm typecheck`
- [ ] Runtime gate: starting a second streaming session while one is active is rejected.
- [ ] Lifecycle gate: start -> active -> stopping -> ended and failure transitions are deterministic in tests.

---

## Ticket SSTT-03B (P3): Renderer Audio Ingress and IPC Frame Transport -> PR-4

### Goal

Add the renderer-side streaming capture path on top of the PR-3 controller runtime:

- renderer-side PCM/audio-frame ingress
- AudioWorklet or equivalent extraction path
- IPC frame transport with batching and backpressure
- clean stop/cancel cleanup

### Approach

- Split `native-recording.ts` into two paths:
  - existing batch `MediaRecorder` path
  - new streaming ingress path for normalized audio frames
- Prefer renderer-side PCM extraction/worklet over a main-process native capture rewrite.
- Add `StreamingAudioIngress` and a provider-neutral frame sink.
- Choose and document the IPC binary transfer strategy up front:
  - batched structured-clone typed arrays
  - or `MessagePort` transfer if structured-clone cost is too high
- Keep segment assembly and ordered output out of this PR; use a fake sink to prove transport only.

### Scope Files

- `src/renderer/native-recording.ts`
- `src/renderer/native-recording.test.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/ipc/register-handlers.test.ts`
- `electron.vite.config.ts`
- New:
  - `src/renderer/streaming-audio-ingress.ts`
  - `src/renderer/streaming-audio-ingress.test.ts`
  - `src/renderer/streaming-audio-worklet.ts`
- `src/main/services/streaming/types.ts`

### Trade-offs

- Selected: renderer PCM/worklet ingress.
  - Pros: lower latency, lower architectural churn, keeps device selection logic near current renderer flow.
  - Cons: more IPC/frame-pressure care required.
- Rejected: native main-process capture first.
  - Pros: avoids renderer binary frame IPC.
  - Cons: much larger implementation and testing surface for the first milestone.

### Proposed Snippets (non-applied)

```ts
await controller.pushAudioFrame({
  pcm16: frame,
  sampleRateHz: 16000,
  channels: 1,
  timestampMs
})
```

### Tasks

1. Split streaming ingress from batch `MediaRecorder` buffering.
2. Add a renderer worklet/extraction path for mono PCM frame emission.
3. Wire the worklet/build entry in the Electron/Vite build pipeline.
4. Choose and document the IPC frame transfer strategy and batching policy.
5. Add bounded queue/backpressure handling between renderer and main.
6. Publish provider-neutral frame payloads through the streaming runtime.
7. Add tests for:
   - no stop-time blob dependency on the streaming path
   - frame batching/transport behavior
   - stop/cancel cleanup
   - backpressure does not leave dangling recorder/worklet state

### Checklist

- [ ] Batch recording path still works unchanged.
- [ ] Streaming path no longer depends on stop-time blob submission.
- [ ] IPC frame transport strategy is explicit and documented.
- [ ] Backpressure behavior is explicit and test-covered.
- [ ] Stop/cancel cleanup works in both modes.

### Gates

- [ ] `pnpm test -- src/renderer/native-recording.test.ts src/renderer/streaming-audio-ingress.test.ts src/main/ipc/register-handlers.test.ts`
- [ ] `pnpm typecheck`
- [ ] Data-plane gate: streaming ingress can emit final segments without using `submitRecordedAudio`.
- [ ] Transport gate: chosen IPC strategy is documented and has passing transport/backpressure tests.

---

## Ticket SSTT-03C (P4): Segment Assembly, Per-Session Ordering, and Clipboard Safety -> PR-5

### Goal

Add the provider-neutral commit substrate on top of the PR-4 frame transport:

- canonical finalized segments
- per-session ordered output coordination
- delimiter policy
- non-permissive clipboard safety for streaming commits

### Approach

- Add `SegmentAssembler` as the only place where provider output becomes canonical app segments.
- Extend ordered output coordination from global batch sequencing to per-session sequencing.
- Apply delimiter policy and clipboard safety at the ordered output boundary, not inside adapters.
- Keep provider-specific logic out of this PR; use fake finalized segments to prove the substrate.

### Scope Files

- New:
  - `src/main/services/streaming/segment-assembler.ts`
  - `src/main/services/streaming/segment-assembler.test.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/coordination/ordered-output-coordinator.test.ts`
- `src/main/coordination/clipboard-state-policy.ts`
- `src/main/services/output-service.ts`
- `src/main/services/output-service.test.ts`
- `src/main/services/streaming/types.ts`

### Trade-offs

- Selected: centralize segment assembly and output ordering before providers land.
  - Pros: every provider inherits the same commit semantics.
  - Cons: another foundational PR before the first provider.
- Rejected: let each provider own its own segment/finalization/output rules.
  - Pros: faster first provider prototype.
  - Cons: guaranteed semantic drift and harder tests.

### Proposed Snippets (non-applied)

```ts
interface CanonicalFinalSegment {
  sessionId: string
  sequence: number
  sourceText: string
  delimiter: string
  startedAt: string
  endedAt: string
}
```

### Tasks

1. Add canonical final segment/session event types, including delimiter metadata.
2. Extend ordered output coordination from global batch sequencing to per-session sequencing.
3. Implement explicit clipboard safety behavior for streaming commit cadence.
4. Publish final-only segment updates through the streaming runtime.
5. Add tests for:
   - out-of-order ready events still commit in source sequence
   - final-only segment commits
   - delimiter application and clipboard-policy behavior

### Checklist

- [ ] Segment events are canonicalized before leaving the adapter boundary.
- [ ] Delimiter policy is centralized and test-covered.
- [ ] Clipboard safety is explicit, not permissive-only.
- [ ] Ordered commit is per session, not global only.

### Gates

- [ ] `pnpm test -- src/main/coordination/ordered-output-coordinator.test.ts src/main/services/output-service.test.ts src/main/services/streaming/segment-assembler.test.ts`
- [ ] `pnpm typecheck`
- [ ] Ordering gate: sequence `2` cannot commit before sequence `1`.
- [ ] Output gate: delimiter policy and clipboard policy produce deterministic per-segment commit behavior.

---

## Ticket SSTT-04 (P5): Local `whisper.cpp` + Core ML Provider -> PR-6

### Goal

Ship the first true raw streaming provider using `whisper.cpp` with Core ML acceleration on macOS Apple Silicon.

### Approach

- Add a `WhisperCppStreamingAdapter` that drives a packaged `whisper.cpp` streaming binary as a child process.
- Keep the adapter behind the shared `StreamingSttAdapter` contract.
- Package the executable separately from model assets:
  - small runtime binary in app resources
  - model assets managed in app data with explicit install/check flow
- Normalize provider output into canonical finalized segments before output commit.

### Scope Files

- `package.json`
- `resources/**` for runtime binary/config templates
- `scripts/**` for build/install verification helpers
- New:
  - `src/main/services/streaming/whispercpp-streaming-adapter.ts`
  - `src/main/services/streaming/whispercpp-streaming-adapter.test.ts`
  - `src/main/services/streaming/whispercpp-model-manager.ts`
  - `src/main/services/streaming/whispercpp-model-manager.test.ts`
  - `src/main/infrastructure/child-process-stream-client.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/streaming/types.ts`
- `docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md`
- New:
  - `docs/research/2026-03-07-whispercpp-coreml-streaming-feasibility-spike.md`

### Trade-offs

- Selected: package binary, manage models separately.
  - Pros: keeps installer smaller and avoids bundling large model weights by default.
  - Cons: adds first-run asset/install complexity.
- Rejected: bundle all models inside the app artifact.
  - Pros: simplest runtime startup.
  - Cons: installer bloat and slower release iteration.

### Proposed Snippets (non-applied)

```ts
const proc = spawn(whisperStreamBinaryPath, [
  '--model', modelPath,
  '--language', language,
  '--step', '0',
  '--length', '3000'
])
```

```ts
export type StreamingProvider = 'local_whispercpp_coreml' | 'groq_whisper_large_v3_turbo'
```

### Tasks

1. Add the `whisper.cpp` adapter implementation and child-process integration.
2. Run and record a feasibility spike on target Apple Silicon hardware tiers before the adapter is treated as accepted.
3. Add model/binary path resolution and installation checks.
4. Add Core ML capability gating and missing-asset error reporting.
5. Map `whisper.cpp` streaming output to canonical final segment events.
6. Define mid-session child-process crash behavior, retry/no-retry policy, and user-facing failure semantics.
7. Verify latency and accuracy on target Apple Silicon hardware tiers.
8. Add tests for:
   - missing binary/model error
   - final segment normalization
   - clean process shutdown on stop/fail
   - unexpected child-process exit during an active session

### Checklist

- [ ] Local streaming can start without any API key.
- [ ] Missing binary/model assets produce actionable errors.
- [ ] Finalized segments reach ordered raw output commit.
- [ ] Packaging path is documented and test-backed where possible.
- [ ] Feasibility spike captures first-utterance latency and real-time factor before the adapter is accepted.
- [ ] Mid-session child-process failure behavior is explicit and test-covered.
- [ ] At least one Apple Silicon manual QA checklist is added.

### Gates

- [ ] `pnpm test -- src/main/services/streaming/whispercpp-streaming-adapter.test.ts src/main/services/streaming/whispercpp-model-manager.test.ts`
- [ ] `pnpm typecheck`
- [ ] Packaging gate: `pnpm run build` remains valid after resource additions.
- [ ] Manual-only packaging gate: `pnpm run dist:mac` remains valid on macOS after resource additions.
- [ ] Spike gate: feasibility notes document acceptable latency on at least one supported Apple Silicon tier before the adapter is considered merge-ready.
- [ ] Manual gate: local streaming session starts, emits text, and stops cleanly on supported Apple Silicon hardware.

---

## Ticket SSTT-05 (P6): Cloud Provider Baseline + Groq Rolling-Upload Adapter -> PR-7

### Goal

Add the cloud streaming baseline contract and the first cloud implementation for Groq `whisper-large-v3-turbo`, while being explicit that this is rolling-upload near-realtime rather than native session streaming.

### Approach

- Introduce a transport-aware cloud adapter registry:
  - `native_stream`
  - `rolling_upload`
- Implement Groq as overlapping chunk uploads against `/audio/transcriptions`.
- Make the dedupe approach explicit:
  - prefer provider timestamp/segment metadata when available
  - fall back to bounded suffix/prefix diff heuristics when not
- Keep this provider strictly raw dictation only for the first cloud milestone.

### Scope Files

- `src/main/services/provider-contract-manifest.ts`
- `src/main/services/provider-contract-manifest.test.ts`
- New:
  - `src/main/services/streaming/groq-rolling-upload-adapter.ts`
  - `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
  - `src/main/services/streaming/cloud-streaming-provider-registry.ts`
  - `src/main/services/streaming/cloud-streaming-provider-registry.test.ts`
  - `src/main/services/streaming/chunk-window-policy.ts`
  - `src/main/services/streaming/chunk-window-policy.test.ts`
- `src/main/services/streaming/segment-assembler.ts`
- `src/main/services/streaming/types.ts`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-stt-provider-form-react.test.tsx`

### Trade-offs

- Selected: model-agnostic cloud contract with a Groq rolling-upload implementation.
  - Pros: matches current official docs while keeping future realtime providers open.
  - Cons: higher latency and more boundary/dedupe work than native streaming.
- Rejected: label Groq as native realtime streaming now.
  - Pros: cleaner marketing language.
  - Cons: technically misleading and likely to create bad assumptions in code/tests.

### Proposed Snippets (non-applied)

```ts
interface CloudStreamingAdapter {
  transport: 'native_stream' | 'rolling_upload'
  pushAudioFrame(frame: Int16Array): Promise<void>
}
```

```ts
const request = {
  model: 'whisper-large-v3-turbo',
  file: rollingChunkFile,
  language
}
```

### Tasks

1. Add a transport-aware cloud provider registry.
2. Implement rolling window chunk policy and overlap defaults for Groq.
3. Add a documented dedupe/merge algorithm for overlapping chunk outputs.
4. Wire Groq API key checks and model selection into the streaming provider contract.
5. Expose the cloud provider choice in settings/UI.
6. Add tests for:
   - overlap dedupe
   - retry behavior
   - no duplicate ordered commits on repeated chunk results
   - behavior when only segment-level timestamps are available

### Checklist

- [ ] Cloud streaming contract does not assume native realtime.
- [ ] Groq uses canonical `whisper-large-v3-turbo`.
- [ ] Overlap policy is centralized and configurable.
- [ ] Segment dedupe is test-covered.
- [ ] Dedupe strategy is explicit about timestamp-first vs heuristic fallback behavior.
- [ ] Settings/UI accurately describes the provider behavior.
- [ ] Dependency rule is explicit: this PR starts after PR-5 and does not wait on PR-6 unless shared adapter interfaces are still moving.

### Gates

- [ ] `pnpm test -- src/main/services/provider-contract-manifest.test.ts src/main/services/streaming/groq-rolling-upload-adapter.test.ts src/main/services/streaming/chunk-window-policy.test.ts`
- [ ] `pnpm typecheck`
- [ ] Contract gate: provider manifest labels Groq transport as rolling upload.
- [ ] Regression gate: chunk retries do not produce duplicate committed text.

---

## Ticket SSTT-06 (P7): Raw Streaming UX, Hardening, and Release Gates -> PR-8

### Goal

Make raw streaming shippable from the user point of view:

- settings UI for mode/provider/language/raw output mode
- live session status and actionable errors
- paste/focus/accessibility hardening
- long-session and backpressure release gates

### Approach

- Add streaming settings controls while keeping transformed-stream controls hidden or disabled until PR-10.
- Keep paste-only semantics explicit in the UI.
- Surface session state, active provider, local/cloud readiness, and per-session errors in renderer activity.
- Add raw-stream release criteria around focus loss, accessibility denial, long sessions, and duplicate suppression.

### Scope Files

- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-output-react.test.tsx`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-stt-provider-form-react.test.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/native-recording.ts`
- `src/renderer/ipc-listeners.ts`
- `src/main/services/output-service.ts`
- `src/main/services/output-service.test.ts`
- `src/main/coordination/clipboard-state-policy.ts`
- New:
  - `docs/qa/streaming-raw-dictation-manual-checklist.md`

### Trade-offs

- Selected: expose only raw dictation for the first releaseable UX.
  - Pros: aligns with mid-term goal and avoids UI promises the backend cannot yet honor.
  - Cons: transformed-stream settings surface is deferred.
- Rejected: expose transformed-stream toggle early behind unstable plumbing.
  - Pros: more “complete” settings UI.
  - Cons: creates a false contract and harder support burden.

### Proposed Snippets (non-applied)

```ts
const streamingRawOnly = settings.processing.mode === 'streaming'
const effectivePasteAtCursor = streamingRawOnly ? true : destinations.pasteAtCursor
```

```tsx
<SelectItem value="stream_raw_dictation">Raw dictation stream</SelectItem>
```

### Tasks

1. Add renderer settings controls for streaming mode, provider, language, and raw output mode.
2. Enforce paste-only streaming semantics in UI and mutation helpers.
3. Add session activity/toast surfaces for:
   - starting
   - active
   - stopping
   - missing permission
   - provider failure
4. Implement `ClipboardStatePolicy` behavior for streaming paste safety rather than leaving it as a permissive stub.
5. Harden clipboard/paste behavior for streaming commit cadence.
6. Add long-session, focus, accessibility, and duplicate suppression manual QA checklist.
7. Add tests for settings UI, output-service behavior, clipboard policy, and mutation constraints.

### Checklist

- [ ] User can select streaming mode and a supported provider.
- [ ] Streaming raw dictation forces paste semantics in the UI.
- [ ] Permission and focus failures are actionable.
- [ ] Long-session/backpressure QA checklist exists.
- [ ] Raw streaming is shippable without any transformed-stream dependency.

### Gates

- [ ] `pnpm test -- src/renderer/settings-output-react.test.tsx src/renderer/settings-stt-provider-form-react.test.tsx src/renderer/settings-mutations.test.ts src/main/services/output-service.test.ts`
- [ ] `pnpm typecheck`
- [ ] UX gate: transformed streaming is not user-selectable before PR-10.
- [ ] Manual gate: accessibility denied, focus lost, and long-session scenarios have reproducible QA steps and expected results.

---

## Ticket SSTT-07 (P8): Structured Transformed-Stream Contract and Context Manager -> PR-9

### Goal

Convert the accepted PR 396 transform strategy into an implementation-ready contract:

- concrete `segment + window + summary + metadata` payload shape
- deterministic serialization
- budget and truncation policy
- explicit summary refresh rules

### Approach

- Extend transformation input types beyond flat `text`.
- Add a `TransformationContextPayload` with versioned structure.
- Move prompt formatting from string-only `{{text}}` substitution to structured block composition with deterministic delimiters.
- Add a `ContextManager` that owns rolling window extraction, summary refresh, and token-budget enforcement.

### Scope Files

- `src/main/services/transformation/types.ts`
- `src/main/services/transformation/prompt-format.ts`
- `src/main/services/transformation/prompt-format.test.ts`
- New:
  - `src/main/services/streaming/context-manager.ts`
  - `src/main/services/streaming/context-manager.test.ts`
  - `src/main/services/streaming/context-budget.ts`
  - `src/main/services/streaming/context-budget.test.ts`
  - `src/main/services/streaming/summary-refresh-policy.ts`
  - `src/main/services/streaming/summary-refresh-policy.test.ts`
- `docs/decisions/2026-03-06-streaming-transform-window-plus-rolling-summary-decision.md`
- `docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md`

### Trade-offs

- Selected: versioned structured context payload.
  - Pros: deterministic tests, clearer prompt contract, easier budget enforcement.
  - Cons: more code than flat text concatenation.
- Rejected: keep prompt input as plain `text` plus ad hoc formatter magic.
  - Pros: smaller diff.
  - Cons: not implementation-grade for transformed streaming.

### Proposed Snippets (non-applied)

```ts
interface TransformationContextPayloadV1 {
  version: 'v1'
  currentSegment: { sequence: number; text: string }
  recentWindow: Array<{ sequence: number; text: string }>
  rollingSummary: string
  metadata: { sessionId: string; language: 'auto' | 'en' | 'ja' }
}
```

```ts
const blocks = [
  ['Current Segment', payload.currentSegment.text],
  ['Recent Window', serializeWindow(payload.recentWindow)],
  ['Rolling Summary', payload.rollingSummary]
]
```

### Tasks

1. Define a versioned transformation context payload.
2. Add deterministic serialization rules and prompt block formatting.
3. Add context budgeting and truncation priority rules.
4. Add rolling summary refresh policy and rebuild rules.
5. Update research/decision docs to match the concrete contract.
6. Add tests for payload composition, truncation, and summary refresh.

### Checklist

- [ ] Transform input is no longer flat-text only for streaming.
- [ ] Prompt composition is deterministic and versioned.
- [ ] Token-budget policy is explicit and test-covered.
- [ ] Summary refresh behavior is documented and test-covered.
- [ ] PR 396 strategy is now implementation-ready rather than descriptive only.

### Gates

- [ ] `pnpm test -- src/main/services/transformation/prompt-format.test.ts src/main/services/streaming/context-manager.test.ts src/main/services/streaming/context-budget.test.ts`
- [ ] `pnpm typecheck`
- [ ] Contract gate: payload tests assert exact structure and truncation ordering.
- [ ] Docs gate: decision/research references the concrete payload version.

---

## Ticket SSTT-08 (P9): `stream_transformed` Execution Lane -> PR-10

### Goal

Add transformed streaming on top of the stable raw streaming substrate:

- bounded transform worker pool
- `window + rolling summary` context injection
- ordered transformed output commit
- raw fallback when a segment transform fails

### Approach

- Consume finalized raw segments only.
- Route them through `ContextManager` and `SegmentTransformWorkerPool`.
- Preserve source sequence order at commit time even if transforms finish out of order.
- When one segment transform fails, emit raw text for that segment and continue the session.

### Scope Files

- `src/main/services/streaming/types.ts`
- New:
  - `src/main/services/streaming/segment-transform-worker-pool.ts`
  - `src/main/services/streaming/segment-transform-worker-pool.test.ts`
  - `src/main/services/streaming/streaming-segment-router.ts`
  - `src/main/services/streaming/streaming-segment-router.test.ts`
- `src/main/services/transformation-service.ts`
- `src/main/services/transformation/types.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/coordination/ordered-output-coordinator.test.ts`
- `src/main/services/output-service.ts`
- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-output-react.test.tsx`

### Trade-offs

- Selected: final-only transform processing with raw fallback.
  - Pros: stable output semantics and better operational behavior.
  - Cons: transformed output appears later than raw.
- Rejected: partial transformed preview.
  - Pros: more immediate UI.
  - Cons: flicker, reordering pain, and significantly more complexity.

### Proposed Snippets (non-applied)

```ts
const result = await workerPool.transform(segment, contextPayload)
orderedCommit.submit(segment.sessionId, segment.sequence, async () => {
  return outputService.applyOutputWithDetail(result.text ?? segment.sourceText, rawStreamingRule)
})
```

### Tasks

1. Add segment transform worker pool with bounded concurrency.
2. Route finalized segments into raw or transformed lane by `outputMode`.
3. Integrate `ContextManager` payload generation with transform requests.
4. Add raw fallback policy for per-segment transform failure.
5. Expose transformed-stream state only after the lane is stable.
6. Add tests for:
   - out-of-order transform completion
   - raw fallback on one segment
   - session continuity after transform failure

### Checklist

- [ ] Transformed streaming only consumes finalized raw segments.
- [ ] Transform worker concurrency is bounded.
- [ ] Ordered output is preserved under out-of-order completion.
- [ ] Raw fallback is deterministic and test-covered.
- [ ] Session continues after per-segment transform failure.

### Gates

- [ ] `pnpm test -- src/main/services/streaming/segment-transform-worker-pool.test.ts src/main/services/streaming/streaming-segment-router.test.ts src/main/coordination/ordered-output-coordinator.test.ts`
- [ ] `pnpm typecheck`
- [ ] Continuity gate: one segment transform failure does not end the session.
- [ ] Ordering gate: transformed segment `N+1` cannot commit before segment `N`.

---

## Deferred Items

These are intentionally not in the first ten tickets:

- native cloud realtime STT provider beyond Groq rolling uploads
- Apple Speech-specific local provider path
- partial preview commits
- multi-session support
- clipboard fingerprint/ownership tracking beyond paste safety hardening
- whole-session post-pass refinement after transformed streaming

## Recommended Branch Naming

- `docs/streaming-stt-plan`
- `feat/streaming-contracts`
- `feat/streaming-control-plane`
- `feat/streaming-session-runtime`
- `feat/streaming-frame-ingress`
- `feat/streaming-segment-ordering`
- `feat/streaming-whispercpp-coreml`
- `feat/streaming-groq-rolling-upload`
- `feat/streaming-raw-ux-hardening`
- `feat/streaming-transform-contract`
- `feat/streaming-transform-lane`

## Definition of Done for the Mid-Term Goal

The mid-term goal is done only when all of these are true:

- `processing.mode=streaming` routes to a real session runtime.
- Local `whisper.cpp` + Core ML raw dictation is usable on supported Macs.
- Groq `whisper-large-v3-turbo` works through the cloud adapter baseline with explicit rolling-upload semantics.
- Streaming output is raw dictation only and paste-driven.
- Ordered commit, duplicate suppression, permission handling, and long-session QA gates are in place.

## Definition of Done for the Long-Term Goal

The long-term goal is done only when all of these are true:

- transformed streaming uses the versioned structured payload contract
- `window + rolling summary` context is implemented and budgeted
- transformed segments can complete out of order but commit in source order
- one transform failure falls back to raw output without ending the session
- transformed-stream UX is explicit and test-covered
