<!--
Where: docs/research/2026-03-06-streaming-speech-to-text-support-architecture-research.md
What: Deep architecture research for adding streaming speech-to-text support to the current app.
Why: Define a codebase-grounded, implementation-grade architecture for streaming STT before coding.
-->

# Research: Streaming Speech-to-Text Support Architecture

Research date: **March 6, 2026**

## 1. Scope

This research studies what the app needs to change to support real-time streaming speech-to-text.

In scope:
- current codebase architecture and integration seams
- provider/runtime feasibility
- streaming settings, IPC, session, and output architecture
- raw dictation stream and optional transformed stream support
- delivery phases, risks, and test strategy

Out of scope:
- implementation
- final UI copy and visual design
- exact default tuning values for segmentation or backpressure

## 2. Executive Summary

The current production path is still strictly batch-oriented:
- renderer records audio with `MediaRecorder`
- renderer submits a completed blob at stop time
- main persists the file
- batch transcription runs
- optional batch transformation runs
- output is applied once

That means streaming STT support is not a small extension to the current batch path. It requires a new runtime lane with:
- live audio frame transport instead of stop-time blob submission
- session lifecycle management
- provider-specific streaming adapters
- ordered finalized-segment processing
- streaming-aware renderer activity and status surfaces

The most defensible architecture for this codebase is a **parallel streaming stack** behind the existing mode-routing boundary:
- keep `default` batch mode unchanged
- add `streaming` mode with a dedicated `StreamingSessionController`
- introduce provider-neutral `StreamingSttAdapter` contracts
- commit finalized source or transformed segments in source order
- preserve the recently accepted paste-only streaming output rule

Recommended provider posture:
- **Apple Speech framework (`SpeechAnalyzer` / `SpeechTranscriber`)**: preferred local streaming path because it aligns with the current spec and platform direction
- **OpenAI Realtime transcription**: preferred cloud streaming path with mature session/event semantics
- **Groq**: retain as batch STT today; treat realtime streaming support as conditional until an explicit official realtime contract is verified

## 3. Current Architecture Reality

### 3.1 Current end-to-end recording flow

Today’s live path is not live from the main process point of view.

Current sequence:
1. Renderer starts `MediaRecorder`.
2. Renderer accumulates `dataavailable` chunks in memory.
3. User stops recording.
4. Renderer turns the full blob into bytes.
5. Renderer calls `submitRecordedAudio`.
6. Main persists the audio file and enqueues a batch capture snapshot.
7. Batch transcription and optional transformation run.
8. Output is applied once, then history is updated.

Relevant files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/core/command-router.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/orchestrators/recording-orchestrator.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/orchestrators/capture-pipeline.ts`

Architectural consequence:
- there is no frame-level audio ingress contract today
- there is no session object for active STT streaming
- main never sees in-progress audio, only completed captures

### 3.2 What is already reusable

Several current abstractions are useful as integration seams:

1. `CommandRouter` and `ModeRouter`
- already define a mode-aware orchestration entry boundary
- good place to route `default` vs `streaming`

2. Immutable snapshot discipline
- current capture and transform flows freeze work inputs at enqueue time
- useful pattern for finalized segment payloads

3. Ordered output coordination
- current `SerialOutputCoordinator` already expresses “preserve commit order even if work completes out of order”
- concept is reusable even though the current implementation is batch/job scoped

4. Centralized output service
- `OutputService` already owns clipboard write and paste-at-cursor behavior
- useful as the output side-effect boundary for streaming commits

5. Centralized settings and IPC wiring
- `SettingsService`, `register-handlers.ts`, and preload bridge are already the canonical contract layers

6. Active queue/snapshot pipeline
- the live production path is `CommandRouter -> CaptureQueue/TransformQueue -> capture/transform processors`
- this is the correct seam for new work, not older orchestration residue

These are useful seams, not streaming-ready implementations.

### 3.3 What is missing

Missing runtime capabilities:
- `processing.mode=streaming` is not implemented in code
- no persisted `processing.streaming.*` settings in runtime schema
- no live streaming IPC commands or renderer event listeners
- no streaming adapter contract
- no streaming session controller
- no finalized-segment event model
- no streaming backlog/backpressure policy
- no streaming renderer activity/status model
- no replacement for history polling with live session events

Relevant files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/domain.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/ipc.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/preload/index.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode-source.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/mode-router.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transcription/types.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/queues/capture-queue.ts`

## 4. External Capability Landscape

## 4.1 Apple local streaming path

Current Apple platform documentation and WWDC material point toward the Speech framework additions around:
- `SpeechAnalyzer`
- `SpeechTranscriber`
- asset installation and language asset management

Why this matters:
- it aligns with the current spec, which explicitly requires at least one local streaming path through macOS Tahoe Speech APIs
- it avoids shipping third-party model binaries for the first local path
- it fits the app’s macOS-first product shape better than a cross-platform local engine does

Implications:
- the streaming architecture should treat Apple Speech as the **primary local provider target**
- model/asset availability and language asset installation must be represented in session preflight
- local streaming support is not just “no API key”; it still needs capability discovery, asset checks, and session error reporting

## 4.2 OpenAI cloud streaming path

OpenAI’s current official documentation supports real-time transcription sessions with evented audio ingestion and incremental transcription results.

Why this matters:
- it is the clearest official cloud match for the app’s streaming requirements
- session lifecycle, event ordering, and audio-buffer semantics map naturally to a `StreamingSttAdapter`
- explicit language hints and session options can be passed through a stable provider boundary

Implications:
- OpenAI should be the **primary cloud streaming provider**
- reconnect behavior, duplicate event handling, and sequence normalization need to be part of the adapter/session design
- the app should not commit partials by default; finalized segment handling remains the safer baseline

## 4.3 Groq status

Groq’s official speech-to-text docs remain strong for file-style STT and OpenAI-compatible REST-style transcription. Realtime streaming support is less clearly documented as a first-class, evented session surface.

Implications:
- keep Groq as a strong batch STT provider
- do not make Groq a first-streaming milestone dependency
- only add Groq streaming behind explicit capability verification and tests

## 5. Architectural Principles

The streaming architecture should follow these rules:

1. Preserve the current batch lane.
- `default` mode should remain unchanged.
- streaming should be additive, not a mutation of the batch capture pipeline.

2. Make session state first-class.
- streaming is session-driven, not file-driven.

3. Keep providers behind a shared contract.
- Apple local and OpenAI cloud should fit the same orchestration surface.

4. Treat finalized segment order as authoritative.
- provider partials may flicker
- final segments are the unit for output side effects

5. Keep transcription independent from transform/output.
- segment transform latency must not block continued STT ingestion

6. Keep streaming output paste-driven.
- streaming mode forces paste-at-cursor behavior
- clipboard writes remain an implementation detail of paste automation

## 6. Recommended Target Architecture

### 6.1 High-level components

1. `StreamingSessionController`
- starts, stops, and fails one active streaming session
- owns prerequisite validation
- owns session state publication

2. `StreamingAudioIngress`
- captures or receives normalized audio frames
- bridges renderer audio into the streaming adapter contract

3. `StreamingSttAdapter`
- provider-specific session implementation
- Apple and OpenAI implementations behind one shared contract

4. `SegmentAssembler`
- converts provider events into stable canonical segment events
- owns partial/final normalization and local sequence assignment policy

5. `StreamingSegmentRouter`
- decides whether finalized segments go to raw dictation commit or transformed-stream processing

6. `SegmentTransformWorkerPool`
- optional lane for `stream_transformed`
- bounded concurrency
- out-of-order completion allowed

7. `StreamingOrderedOutputCoordinator`
- preserves source segment order at commit time
- segment-level idempotency

8. `StreamingActivityPublisher`
- exposes session state, segment progress, and actionable errors to renderer

### 6.2 Data flow

#### `stream_raw_dictation`

1. User starts recording in `streaming` mode.
2. `StreamingSessionController` validates settings, assets, credentials, permissions.
3. Renderer audio is converted to streaming frames and sent to the session.
4. `StreamingSttAdapter` emits partial/final/error/end events.
5. `SegmentAssembler` turns provider events into canonical finalized segments with monotonic local sequence.
6. Finalized segment is sent to `StreamingOrderedOutputCoordinator`.
7. `OutputService` applies paste-driven output.
8. Renderer receives per-segment and session-level activity updates.

#### `stream_transformed`

1. Steps 1-5 above remain the same.
2. Finalized segment is routed into `ContextManager` + `SegmentTransformWorkerPool`.
3. Transform jobs may finish out of order.
4. `StreamingOrderedOutputCoordinator` waits for source sequence order.
5. Final transformed text is committed.
6. If transform fails, raw fallback policy applies and session continues.

## 7. Critical New Contracts

### 7.1 Settings contract

The runtime schema needs additive streaming settings under `processing`.

Minimum fields:

```yaml
processing:
  mode: default | streaming
  streaming:
    enabled: boolean
    provider: apple_speech | openai_realtime | groq_realtime?
    model: string | null
    apiKeyRef: string | null
    baseUrlOverride: string | null
    outputMode: stream_raw_dictation | stream_transformed
    language: auto | en | ja
    maxInFlightTransforms: number
    delimiterPolicy:
      mode: none | space | newline | custom
      value: string | null
```

Validation rules:
- `mode=streaming` requires `streaming.enabled=true`
- streaming provider/model must be explicit
- provider-specific `apiKeyRef` must be valid when required
- `outputMode=stream_transformed` requires a usable transform preset or explicit transform configuration source
- streaming mode implies effective `pasteAtCursor=true`

### 7.2 IPC contract

Current IPC only supports:
- run recording command
- submit completed recorded audio
- poll history later

Streaming needs:
- `startStreamingSession`
- `stopStreamingSession`
- `pushStreamingAudioFrame` if audio transport stays renderer-driven through IPC
- `onStreamingSessionState`
- `onStreamingSegment`
- `onStreamingError`

Design recommendation:
- keep control-plane IPC explicit (`start`, `stop`, state events)
- avoid high-frequency fine-grained IPC chatter if a provider can run inside the renderer safely
- if streaming STT runs in main, use chunked binary frame IPC with bounded buffering and backpressure

### 7.3 Provider adapter contract

Recommended provider-neutral shape:

```ts
type StreamingEvent =
  | { kind: 'partial'; providerSessionId: string; text: string; startedAt: string }
  | { kind: 'final'; providerSessionId: string; text: string; startedAt: string; endedAt: string }
  | { kind: 'error'; providerSessionId: string; message: string; retryable: boolean }
  | { kind: 'end'; providerSessionId: string; reason: 'user_stop' | 'provider_end' | 'fatal_error' }

interface StreamingSttAdapter {
  startSession(input: {
    sessionId: string
    provider: string
    model: string
    language: 'auto' | 'en' | 'ja'
    apiKeyRef?: string | null
    baseUrlOverride?: string | null
  }): Promise<void>
  pushAudioFrame(frame: ArrayBuffer, metadata: { sampleRateHz: number; channels: number; timestampMs: number }): Promise<void>
  stopSession(): Promise<void>
  onEvent(listener: (event: StreamingEvent) => void): () => void
}
```

Important detail:
- **local source sequence should be assigned by the app**, not trusted blindly from provider event ordering
- provider session IDs and local segment sequence IDs should be kept separate

### 7.4 Canonical segment model

The app needs one internal segment model regardless of provider:

```ts
type CanonicalSegment = {
  sessionId: string
  sequence: number
  provider: string
  providerSessionId: string
  sourceText: string
  state: 'finalized' | 'transformed' | 'committed' | 'failed'
  startedAt: string
  endedAt: string
}
```

Why this matters:
- one consistent segment model keeps output ordering, transform routing, history, and UI simpler
- provider-specific event details should be normalized before leaving the adapter boundary

## 8. Audio Ingress Design

This is the biggest architectural delta from current code.

### 8.1 Current limitation

`native-recording.ts` uses `MediaRecorder`, which is optimized for captured chunks and completed blobs, not deterministic PCM frame streaming.

### 8.2 Recommended direction

Introduce a dedicated streaming audio path that emits normalized frames:
- target mono audio
- deterministic sample rate
- deterministic frame size
- no dependence on `MediaRecorder` stop event for main processing

Two practical options:

1. Renderer-side audio worklet / PCM extraction
- best fit if the provider adapter can accept frame pushes from renderer or a main-process bridge
- lowest latency

2. Main-process native capture adapter
- possible later if renderer/browser capture behavior becomes limiting
- more complex to implement and test

Recommendation:
- **start with renderer-side normalized frame extraction**
- keep it isolated from the existing `MediaRecorder` batch path

### 8.3 Ingress responsibilities

`StreamingAudioIngress` should own:
- device selection reuse
- sample-rate normalization
- mono conversion
- frame sizing
- bounded send queue
- pause/stop cleanup
- metrics for dropped or delayed frames

## 9. Session Lifecycle Architecture

`StreamingSessionController` should own:
- start preflight
- stop and cleanup
- active session exclusivity
- session state transitions
- adapter attach/detach
- output mode routing

Suggested states:
- `idle`
- `starting`
- `active`
- `stopping`
- `ended`
- `failed`

Preflight checks should include:
- settings validity
- provider capability support
- credential presence if required
- local speech asset availability for Apple provider
- microphone permission
- accessibility permission for paste-driven output when streaming mode is active
- transform prerequisites if `stream_transformed`

## 10. Output and Ordering Architecture

### 10.1 Output rule

Per current spec direction:
- streaming mode is paste-driven
- `copyToClipboard` is not a user-facing streaming option
- clipboard writes remain internal implementation details of paste automation

This simplifies the first streaming milestone:
- no user-facing streaming clipboard history semantics
- no append-vs-new-entry product behavior
- no need to model streaming clipboard usage as a settings-facing contract

### 10.2 Ordered commit

The current `SerialOutputCoordinator` proves the pattern but is too small for streaming as-is.

Streaming requirements:
- sequence scope must be per session
- duplicate commit suppression must exist
- later segments must wait for earlier segments
- failures must unblock later segments without corrupting order

Recommended extension:
- replace or wrap the current coordinator with a session-aware ordered coordinator:

```ts
type StreamingCommitKey = `${sessionId}:${sequence}:${variant}`
```

Responsibilities:
- track `nextExpectedSequence` per session
- commit exactly once per segment variant
- release blocked successors when a segment is failed or skipped
- surface commit outcomes for activity/history

## 11. Optional Transformed Streaming Lane

The recently accepted `window + rolling summary` research remains the right design for `stream_transformed`.

That means the raw streaming architecture should be separated from transformed-stream enrichment:
- raw streaming is the foundation
- transformed streaming is a dependent lane on top of finalized raw segments

Target design:
- raw finalized segments are canonical truth
- transformation receives finalized segments only
- `ContextManager` builds `segment + window + summary`
- transform workers run concurrently
- ordered output still commits in source sequence
- transform failure falls back to raw segment and session continues

This is important for delivery:
- **raw streaming should ship first**
- transformed streaming should be a second milestone on top of the same session/segment infrastructure

## 12. Detailed File-Level Impact Map

### 12.1 Shared settings and domain types

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/domain.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/ipc.ts`

Changes:
- add `processing.mode`
- add `processing.streaming.*`
- add streaming session/segment IPC event payloads
- add provider/model/output-mode enums or validated string unions

### 12.2 Main routing and orchestration

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode-source.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/mode-router.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/core/command-router.ts`

Changes:
- add `streaming` mode
- resolve mode from settings
- route recording shortcut into batch or streaming session controller

### 12.3 Main IPC and preload

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/ipc/register-handlers.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/preload/index.ts`

Changes:
- register streaming commands and event channels
- instantiate streaming services and provider registry
- expose stream state/events to renderer

### 12.4 Transcription service layer

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transcription-service.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transcription/types.ts`
- new `src/main/services/streaming/*`

Changes:
- keep existing batch `TranscriptionService`
- add parallel streaming service and adapter contract
- do not overload the batch `audioFilePath` contract with fake micro-captures

### 12.5 Renderer recording/UI

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/settings-output-react.tsx`
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/settings-stt-provider-form-react.tsx`
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/settings-mutations.ts`

Changes:
- split batch recording from streaming audio ingress
- add streaming mode settings UI
- force paste semantics in streaming mode UI
- surface active session state, provider state, and segment activity

### 12.6 Output and coordination

Files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/output-service.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/ordered-output-coordinator.ts`

Changes:
- keep output side effects centralized
- add session-aware ordered commits
- preserve paste-only semantics for streaming

## 13. Risks and Tradeoffs

### 13.1 Main technical risks

1. Audio ingress complexity
- biggest architecture risk
- current code has no streaming-safe PCM frame lane

2. Provider divergence
- Apple and OpenAI will differ in session and event details
- normalization burden must stay inside adapters

3. Backpressure and long-session stability
- transform or paste output may lag behind STT
- system must bound queues and define degradation behavior

4. Session stop semantics
- user stop, provider end, adapter failure, and renderer teardown all need consistent cleanup

5. Accessibility and focus behavior
- paste automation can fail even when STT works
- session should continue surfacing text and actionable errors instead of crashing

6. Legacy abstraction drift
- older orchestration files still exist in the repo outside the active path
- streaming work should target the live queue/snapshot pipeline, not revive obsolete orchestration layers by accident

### 13.2 Product tradeoffs

1. Final-only commits vs partial preview
- final-only is simpler and more stable
- partial preview is richer but much noisier

2. Apple-first local support vs whisper.cpp-first local support
- Apple-first aligns with spec and platform direction
- whisper.cpp gives broader local control, but increases packaging and model lifecycle complexity

3. Raw-first rollout vs transformed-first ambition
- raw-first is the correct first milestone
- transformed streaming should wait for stable finalized-segment infrastructure

## 14. Recommended Delivery Plan

### Phase A: contracts and settings
- add streaming settings schema
- add streaming mode routing
- add IPC event contracts

### Phase B: raw streaming session foundation
- add `StreamingSessionController`
- add `StreamingAudioIngress`
- add one streaming provider path:
  - Apple Speech local first
  - OpenAI cloud second or in parallel if capacity allows

### Phase C: ordered output and UI
- add session-aware ordered output coordinator
- add renderer session state and segment activity
- harden paste-only output behavior

### Phase D: transformed streaming
- add context manager
- add transform worker pool
- add raw fallback on transform failure

### Phase E: hardening
- long-session tests
- backpressure tests
- EN/JA behavior validation
- provider failure and reconnect testing

## 15. Testing Strategy

Automated coverage to add with implementation:
- mode routing: `default` remains unchanged, `streaming` selects streaming lane
- session lifecycle: start, duplicate start reject, stop idempotency, fatal fail cleanup
- adapter normalization: provider events become canonical segments
- ordered commit: out-of-order transform completion still commits in source order
- streaming output mode rules: paste forced, copy not user-configurable
- transform failure: raw fallback and session continuity
- EN/JA session hint propagation

Manual validation priorities:
- microphone permission flows
- accessibility permission flows
- focus-target behavior under rapid streaming commits
- long-session memory growth
- Apple speech asset install and missing-asset messaging

## 16. Final Recommendation

Proceed with streaming STT support as a **new parallel runtime lane**, not an extension of the current batch blob-submission path.

Recommended order:
1. implement streaming mode contracts and session architecture
2. ship raw dictation streaming first
3. add transformed streaming on top of finalized raw segments

Recommended provider priority:
1. Apple Speech framework for local streaming
2. OpenAI Realtime for cloud streaming
3. Groq streaming only after explicit official realtime-contract verification

This is the architecture with the best fit to:
- the current codebase boundaries
- the current spec
- the newly accepted paste-only streaming output rule
- the existing transformed-stream context strategy

No implementation was performed in this research step.

## 17. Sources

Primary external sources:
- Apple Speech framework docs: https://developer.apple.com/documentation/speech
- Apple WWDC session, "Bring advanced speech-to-text capabilities to your app": https://developer.apple.com/videos/play/wwdc2025/277/
- OpenAI Realtime transcription guide: https://platform.openai.com/docs/guides/realtime-transcription
- OpenAI speech-to-text guide: https://platform.openai.com/docs/guides/speech-to-text
- Groq speech-to-text docs: https://console.groq.com/docs/speech-to-text

Internal sources:
- `/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md`
- `/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md`
- `/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md`
- `/workspace/.worktrees/docs/streaming-stt-research/docs/decisions/2026-03-06-streaming-mode-paste-only-output.md`
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/core/command-router.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/orchestrators/capture-pipeline.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transcription-service.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transcription/types.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/ipc/register-handlers.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/preload/index.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/output-service.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/ordered-output-coordinator.ts`
