<!--
Where: docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md
What: Detailed research on Whisper ecosystem APIs, streaming STT approaches (local + cloud), risks, and integration strategy for this codebase.
Why: Prepare a high-confidence implementation plan for adding real-time STT (stream) without coding yet.
-->

# Research: Real-Time STT (Stream) with Local whisper.cpp + Cloud Whisper APIs

Status note on **March 7, 2026**:
- this document remains valid for provider/runtime background research
- the approved near-term cloud baseline is now Groq `whisper-large-v3-turbo` with explicit `rolling_upload` semantics, not OpenAI-first realtime delivery
- the new Epicenter reference research documents a separate pause-chunked architecture that should not be confused with true streaming:
  - `docs/research/2026-03-07-epicenter-whispering-vad-chunked-parallel-stt-architecture-research.md`

## 1. Scope and Goals

This research covers:
- Whisper API behavior, usage patterns, operational risks, and integration design.
- Local streaming path using `whisper.cpp` with Core ML support.
- Cloud streaming path using OpenAI (primary) and Groq (compatibility constraints).
- Language requirements: English (`en`) and Japanese (`ja`/`jp`).
- Required output mode support:
  - MUST: raw dictation stream (new mode label: `stream_raw_dictation`).
  - MAY: transformed text on top of real-time STT stream.
- Feasibility against the current codebase architecture.

Research date: **March 5, 2026**.

## 2. Executive Summary

- The current app is still **batch capture -> transcribe -> optional transform -> output** in production code.
- The spec already defines forward-compatible streaming boundaries, but runtime settings/types are not yet wired for streaming.
- `whisper.cpp` is a practical local streaming baseline on macOS; Core ML acceleration is documented and intended for Apple Silicon.
- `whisper.cpp` is still the practical local streaming baseline on macOS.
- Groq currently documents high-speed Whisper-style transcription for file input; first-class realtime transcription documentation remains weaker/unclear than a native session API.
- A provider-neutral `StreamingSttAdapter` contract and a `StreamingSessionController` can be added with minimal disturbance to existing batch pipeline if integrated through the existing routing boundary.

## 3. External Research: Whisper APIs and Runtime Behavior

## 3.1 Local path: `whisper.cpp` streaming + Core ML

Primary source: `ggml-org/whisper.cpp` README and stream examples.

What matters most:
- `whisper.cpp` supports realtime/streaming style transcription through the `examples/stream` runner (windowed audio + iterative decode).
- Core ML support is documented in repo README, including model conversion/build flow for Apple Silicon acceleration.
- Runtime stream knobs include step/window/overlap and optional VAD mode behavior (important for latency/accuracy tuning).

Integration implications:
- Best fit for offline mode, low cloud cost, and privacy-sensitive workflows.
- Requires shipping local model assets and handling first-run model availability.
- Performance/latency depends heavily on model size, sample rate, Apple Silicon class, and decoding params.

EN/JP language fit:
- Whisper language selection can be explicit (`en`, `ja`) or auto-detect.
- For stable punctuation and lower hallucination in mixed-language sessions, explicit language mode per session is safer than auto in many real-time cases.

Operational notes:
- Stream output from local decoding should be treated as evented segments with clear distinction between partial and finalized text.
- For downstream transformations, segment finalization policy is critical; too-early segment finalization increases edit churn.

## 3.2 Cloud path: OpenAI Whisper / speech-to-text

Primary sources: OpenAI speech-to-text guide, OpenAI API reference, OpenAI Realtime guide.

Status for the current approved plan:
- this section is background research only
- OpenAI is a deferred native-cloud-realtime candidate, not the first cloud implementation target

OpenAI provides two practical patterns:
1. Non-realtime transcription (`/audio/transcriptions`): file upload, fast but not true low-latency stream.
2. Realtime transcription sessions (WebSocket): incremental events and session-based audio ingestion.

Key integration detail:
- Realtime path is the correct cloud counterpart for true streaming UX.
- File transcription can still be a fallback lane when realtime channel is unavailable.

Model notes:
- OpenAI docs list modern transcription models (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`) and legacy `whisper-1` compatibility.
- Output format details differ by endpoint/model; there is doc-surface inconsistency across pages, so implementation should treat format support as runtime-validated capability.

EN/JP support:
- OpenAI STT supports multilingual transcription; explicit language hints generally improve stability and latency.
- For Japanese, post-processing expectations should include spacing/punctuation normalization policy to keep downstream paste quality predictable.

## 3.3 Cloud path: Groq Whisper-compatible transcription

Primary source: Groq docs (Speech-to-Text + OpenAI compatibility pages).

What is clear:
- Groq exposes OpenAI-compatible REST-style transcription for supported Whisper-family models.
- Very strong throughput/latency claims for batch transcription workloads.

What is unclear/at risk:
- Realtime streaming transcription parity (WebSocket session semantics equivalent to OpenAI Realtime) is not as explicitly documented in the same way.
- Treat Groq realtime-STT as **conditional feasibility** until a concrete, current, official realtime contract is verified for your selected model and SDK path.

Practical consequence:
- The approved near-term cloud baseline should be Groq rolling upload, but it must be labeled and implemented as `rolling_upload`, not native realtime.
- Native cloud realtime providers can remain follow-on candidates once the shared streaming contract is stable.

## 4. Risks and Constraints (API, Product, Ops, Compliance)

## 4.1 Product/UX risks

- Partial hypothesis drift: realtime partials can flicker and revise.
- Segment boundary instability: poor finalization policy hurts paste readability.
- Output-mode ambiguity: batch labels (`transcript`/`transformed`) do not directly express streaming raw-dictation semantics.

Mitigation:
- Introduce explicit streaming output mode enum (`stream_raw_dictation`) and optional transformed streaming lane.
- Emit final-only commits to paste/output coordinator unless explicit partial preview is enabled.

## 4.2 Technical risks

- Local model footprint and startup latency (model load warmup) may impact first utterance.
- Cloud websocket reliability and reconnect behavior can reorder/duplicate events unless sequencing is strict.
- API docs drift/model deprecations can break hardcoded assumptions.
- Current code has no streaming settings schema in runtime types; adding it is cross-layer work (shared types, IPC, settings UI, validators).

Mitigation:
- Monotonic segment sequence IDs and idempotent commit logic.
- Capability probing on provider startup (supported model/output format/event type).
- Keep streaming implementation behind mode router with strict fallback to current default pipeline.

## 4.3 Privacy and compliance risks

- Local path minimizes third-party data transfer but still requires local storage/process safeguards.
- OpenAI/Groq cloud paths depend on provider retention/policy terms; these are contractual and can change.

Mitigation:
- Provider-specific privacy disclosure in settings.
- Per-provider opt-in and key scoping.
- Optional local-only mode default for sensitive environments.

## 4.4 Language-specific risks (EN/JP)

- Mixed EN/JP turns can reduce auto-language reliability in realtime.
- Japanese punctuation and sentence segmentation often need explicit policy for readable incremental output.

Mitigation:
- Add language selector for streaming session (`auto`, `en`, `ja`).
- Apply deterministic delimiter/join policy before output commit.

## 5. Current Codebase Analysis (Streaming Readiness)

## 5.1 What already exists and is reusable

- Mode-aware entry boundary exists: `CommandRouter` + `ModeRouter`.
- Immutable request snapshots are already standard for queue isolation.
- Ordered output commit mechanism exists (`SerialOutputCoordinator`).
- Capture and transform queues already split serial STT lane and concurrent transform lane.
- Output service and permission handling are centralized.

Useful files:
- [command-router.ts](/workspace/src/main/core/command-router.ts)
- [mode-router.ts](/workspace/src/main/routing/mode-router.ts)
- [capture-pipeline.ts](/workspace/src/main/orchestrators/capture-pipeline.ts)
- [transform-pipeline.ts](/workspace/src/main/orchestrators/transform-pipeline.ts)
- [ordered-output-coordinator.ts](/workspace/src/main/coordination/ordered-output-coordinator.ts)

## 5.2 What is currently missing for streaming

- Runtime settings schema has no `processing.mode` or `processing.streaming.*` fields (spec-forward docs exist, code does not).
- `ProcessingMode` only supports `'default' | 'transform_only'`; no `'streaming'` branch.
- No `StreamingSessionController`.
- No streaming STT adapter contract (only batch `TranscriptionAdapter`).
- Clipboard streaming policy is still stubbed/permissive.
- IPC has no stream lifecycle channels/events (`startStream`, `stopStream`, `onStreamSegment`, etc.).
- Renderer has no streaming status surface or mode controls.

Gap evidence:
- [domain.ts](/workspace/src/shared/domain.ts)
- [processing-mode.ts](/workspace/src/main/routing/processing-mode.ts)
- [processing-mode-source.ts](/workspace/src/main/routing/processing-mode-source.ts)
- [clipboard-state-policy.ts](/workspace/src/main/coordination/clipboard-state-policy.ts)
- [ipc.ts](/workspace/src/shared/ipc.ts)

## 5.3 Architectural feasibility

Feasibility is high if implemented as additive modules behind current routing boundaries.

Recommended integration seam:
- Keep existing batch pipeline untouched as `default` mode.
- Add a new streaming orchestration branch selected via persisted mode.
- Reuse output and ordered commit concepts, but with segment-level sequencing.

Why this is safe:
- Existing snapshot + queue discipline already enforces non-blocking behavior.
- Existing output and history systems can be extended rather than replaced.
- Spec already anticipates these components and policies.

## 6. Architecture Approaches for Streaming

## 6.1 Approach A: Parallel streaming stack (recommended)

Add new components while preserving batch pipeline unchanged:
- `StreamingSessionController`
- `StreamingSttAdapter` interface with implementations:
  - `WhisperCppStreamingAdapter` (local)
  - `OpenAiRealtimeStreamingAdapter` (cloud)
  - `GroqStreamingAdapter` (only if official realtime contract is verified)
- `SegmentAssembler`
- `SegmentTransformWorkerPool`
- `StreamingOrderedOutputCoordinator`
- Concrete `ClipboardStatePolicy` (append vs new entry)

Pros:
- Lowest regression risk.
- Clear provider abstraction and fallback paths.
- Matches spec section 12 architecture direction.

Cons:
- More initial code surface.

## 6.2 Approach B: Extend existing capture queue to “micro-captures”

Treat each finalized stream chunk as a pseudo-capture and run through current capture pipeline.

Pros:
- Reuses existing processor paths.

Cons:
- Poor fit for true realtime semantics.
- Harder state management for session lifecycle and partial revisions.
- More glue complexity than Approach A over time.

## 6.3 Approach C: Cloud-only first, local second

Groq rolling-upload first, defer `whisper.cpp` local.

Pros:
- Faster first streaming milestone.

Cons:
- Misses required local target.
- Harder to normalize later if contracts are shaped around rolling uploads instead of a true streaming substrate.

## 7. Output Modes and Behavior Mapping

Required target mapping:
- `stream_raw_dictation` (MUST): streaming finalized source text committed with ordered side effects.
- `stream_transformed` (MAY): each finalized source segment optionally transformed then committed in source order.

Recommended setting model extension (high level):
- `processing.mode = default | streaming`
- `processing.streaming.provider = local_whispercpp_coreml | groq_whisper_large_v3_turbo`
- `processing.streaming.transport = native_stream | rolling_upload`
- `processing.streaming.outputMode = stream_raw_dictation | stream_transformed`
- `processing.streaming.language = auto | en | ja`
- `processing.streaming.delimiterPolicy = none | space | newline | custom`

## 8. Integration Plan Shape (No Implementation Yet)

## 8.1 Phase 0 (validation spikes)

- Verify `whisper.cpp` stream + Core ML performance envelope on target macOS hardware tiers.
- Verify Groq rolling-upload overlap, dedupe, and latency behavior for EN/JP speech.
- Verify whether any native cloud realtime provider is worth adding later; if unclear, keep the contract open but out of the first milestone.

## 8.2 Phase 1 (contracts + settings)

- Add streaming settings schema and validation.
- Extend `ProcessingMode`/`ModeRouter` and IPC contracts for stream lifecycle.
- Add provider capability registry (realtime yes/no, language hints, output formats).

## 8.3 Phase 2 (local/cloud adapters + session runtime)

- Implement `StreamingSessionController` with strict single-active-session policy.
- Implement local `whisper.cpp` adapter and Groq rolling-upload adapter.
- Add sequence-numbered segment events and finalization handling.

## 8.4 Phase 3 (output + optional transform)

- Implement concrete clipboard streaming policy.
- Add ordered segment commit with idempotency.
- Add optional transformed-stream worker pool (`maxInFlightTransforms`).

## 8.5 Phase 4 (hardening)

- Soak tests for back-to-back sessions, interruptions, and reconnects.
- EN/JP quality/latency benchmarks and tuning presets.
- Provider-failure fallbacks and user-facing diagnostics.

## 9. Feasibility Verdict

- **Local streaming (`whisper.cpp` Core ML): Feasible and aligned with requirements.**
- **Cloud rolling upload (Groq): Feasible as a near-realtime baseline if overlap, dedupe, and ordering are treated as first-class design work.**
- **Native cloud realtime path:** Keep open, but do not make it a dependency of the first milestone without a separate contract review.
- **Codebase integration risk:** Moderate, mainly cross-layer schema/IPC/UI work; core orchestration patterns already support additive expansion.

## 10. Open Questions to Resolve Before Implementation

1. Should a native cloud realtime provider be added later for a second cloud transport once the Groq baseline is stable?
2. Is per-session language selection exposed in UI, or inferred from global transcription language?
3. For transformed streaming mode, should we allow partial-transform preview or final-only transform commits?
4. What is the required first-run model download UX for local whisper.cpp models?

## 11. Technical Deep Dive: Provider Contracts and Session Semantics

## 11.1 Proposed streaming adapter contract (provider-neutral)

```ts
type StreamingEvent =
  | { kind: 'partial'; sessionId: string; sequence: number; text: string; startedAt: string }
  | { kind: 'final'; sessionId: string; sequence: number; text: string; startedAt: string; endedAt: string }
  | { kind: 'error'; sessionId: string; sequence: number; message: string; retryable: boolean }
  | { kind: 'end'; sessionId: string; reason: 'user_stop' | 'provider_end' | 'fatal_error' }

interface StreamingSttAdapter {
  startSession(input: {
    sessionId: string
    provider: string
    model: string
    language: 'auto' | 'en' | 'ja'
    apiKeyRef?: string | null
    baseUrlOverride?: string | null
  }): Promise<void>
  pushAudioFrame(
    frame: ArrayBuffer,
    metadata: { sampleRateHz: number; channels: number; timestampMs: number }
  ): Promise<void>
  stopSession(): Promise<void>
  onEvent(listener: (event: StreamingEvent) => void): () => void
}
```

Why this matters for this codebase:
- Mirrors existing adapter style (`TranscriptionAdapter`) but adds session lifecycle + eventing.
- Keeps `ModeRouter` boundary clean (default vs streaming pipeline isolation).
- Gives `OrderedOutputCoordinator` enough metadata (monotonic `sequence`) to preserve source order.

## 11.2 Local `whisper.cpp` intricacies for macOS/Electron

Operational choices:
- Process model:
  - Spawn `whisper.cpp` executable (`examples/stream`) as a child process.
  - Or integrate native library bindings directly.
- For this repo, process spawning is lower-risk initially because current main-process code is TypeScript and IPC-driven.

Packaging implications:
- Bundle architecture-specific binaries in app resources.
- Bundle model files (`ggml-*`) and Core ML artifacts for the chosen model(s).
- Include checksum/version manifest for deterministic updates.

Audio pipeline implications:
- Renderer currently records with browser media APIs and submits finalized blobs for batch.
- Streaming needs incremental PCM frame push from renderer/main to local adapter.
- Frame normalization (sample rate/channels/bit depth) must be deterministic before inference.

Core ML support implications:
- Core ML acceleration reduces decode latency on Apple Silicon but requires model conversion and deployment discipline.
- Expect hardware variance: M-series tier will materially change throughput and real-time factor.
- Must benchmark at least two device classes before defaulting model size.

## 11.3 OpenAI realtime transcription intricacies

Session-level concerns:
- WebSocket connection lifecycle (auth + connect + stream + close) becomes first-class runtime state.
- Client must handle reconnect and duplicate event suppression.
- Event ordering can be impacted by network jitter; local sequence assignment policy should be explicit.

Output and transform coordination:
- Partial events should not trigger side-effect commits by default.
- Final events should be transformed/committed through ordered coordinator.
- Optional transformed mode must preserve source sequence even if transform workers finish out of order.

Fallback strategy:
- If realtime path fails to initialize, degrade to chunked file transcription only with clear user-facing notice.

## 11.4 Groq integration intricacies

What can be used immediately:
- OpenAI-compatible REST transcription route for non-streaming or chunked near-realtime.

What needs proof before commitment:
- Official, current realtime transcription contract with stable SDK/docs coverage.
- Explicit event schema and rate-limit behavior under continuous speech sessions.

Design guard:
- Model provider capabilities should be runtime-queried and cached:
  - `supportsRealtimeSession`
  - `supportsLanguageHint`
  - `supportsPartialEvents`
  - `supportsWordTimestamps`

## 12. Detailed Codebase Feasibility Map

## 12.1 Shared domain/settings layer impact

Current state:
- `SettingsSchema` lacks `processing.mode` and `processing.streaming`.

Required additions:
- Streaming mode fields and cross-field validation:
  - reject invalid combinations (`mode=default` + `streaming.enabled=true` unless intentionally tolerated).
  - enforce provider/key requirements.

Primary file:
- [domain.ts](/workspace/src/shared/domain.ts)

## 12.2 Routing/orchestration impact

Current state:
- `ProcessingMode` does not include `streaming`.
- `LegacyProcessingModeSource` always resolves `'default'`.

Required additions:
- Add `'streaming'` mode.
- Read mode from persisted settings.
- Route recording commands to stream session controller when active mode is streaming.

Primary files:
- [processing-mode.ts](/workspace/src/main/routing/processing-mode.ts)
- [processing-mode-source.ts](/workspace/src/main/routing/processing-mode-source.ts)
- [mode-router.ts](/workspace/src/main/routing/mode-router.ts)
- [command-router.ts](/workspace/src/main/core/command-router.ts)

## 12.3 IPC/preload/renderer contract impact

Current state:
- No stream lifecycle channels.

Required additions:
- Commands:
  - `startStreamingSession`
  - `stopStreamingSession`
- Events:
  - `onStreamingSegment`
  - `onStreamingSessionState`
  - `onStreamingError`

Primary files:
- [ipc.ts](/workspace/src/shared/ipc.ts)
- [preload/index.ts](/workspace/src/preload/index.ts)
- [register-handlers.ts](/workspace/src/main/ipc/register-handlers.ts)

## 12.4 Main services and provider adapters impact

Current state:
- `TranscriptionService` and adapters are batch-only.

Required additions:
- Add streaming adapter registry separate from or parallel to batch registry.
- Implement local and cloud adapters with capability reporting.

Primary files:
- [transcription-service.ts](/workspace/src/main/services/transcription-service.ts)
- [groq-transcription-adapter.ts](/workspace/src/main/services/transcription/groq-transcription-adapter.ts)
- [types.ts](/workspace/src/main/services/transcription/types.ts)

## 12.5 Output/coordination impact

Current state:
- Ordered coordinator is job-level serial commit.
- Clipboard policy is permissive placeholder.

Required additions:
- Segment-level ordered commits.
- Clipboard append/new-entry policy per streaming usage semantics.
- Idempotent commit tokens to handle retries/reconnect duplicates.

Primary files:
- [ordered-output-coordinator.ts](/workspace/src/main/coordination/ordered-output-coordinator.ts)
- [clipboard-state-policy.ts](/workspace/src/main/coordination/clipboard-state-policy.ts)
- [output-service.ts](/workspace/src/main/services/output-service.ts)

## 13. Testing and Validation Strategy (Research-Level)

Critical automated coverage to add when implementation starts:
- Session lifecycle:
  - start/stop, duplicate start rejection, stop-idempotency.
- Event ordering:
  - out-of-order provider final events still commit in source sequence.
- Mode routing:
  - default mode unchanged; streaming mode path selected correctly.
- Output modes:
  - `stream_raw_dictation` commits source text only.
  - `stream_transformed` commits transformed text with raw fallback on transform failure.
- EN/JP:
  - explicit `en` and `ja` sessions produce expected language hints at adapter boundary.
- Failure handling:
  - network interruption, provider 401/403, local adapter crash, graceful recovery semantics.

Manual validation priorities:
- Mac hardware matrix (M1/M2/M3 class).
- Long-session memory growth.
- Paste behavior under rapid segment arrival.
- Accessibility permission edge cases with concurrent clipboard writes.

## 14. Decision Guidance

Recommended architectural decision now:
- Adopt **Approach A (parallel streaming stack)**.
- Treat provider support status as:
  - Local whisper.cpp Core ML: **go**.
  - Groq rolling-upload transcription: **go** for the first cloud baseline.
  - Native cloud realtime transcription: **conditional** pending separate contract review.

Confidence by topic:
- Local whisper.cpp feasibility: high.
- Groq rolling-upload feasibility: medium-high.
- Native cloud realtime provider fit: medium-low until contract/docs are re-checked for the chosen provider.
- Regression risk to existing batch pipeline if isolated by mode router: medium-low.

## 15. Sources (Primary)

- whisper.cpp README (Core ML support, usage): https://github.com/ggml-org/whisper.cpp
- whisper.cpp stream example source: https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/stream.cpp
- OpenAI speech-to-text guide: https://platform.openai.com/docs/guides/speech-to-text
- OpenAI Realtime transcription guide: https://platform.openai.com/docs/guides/realtime-transcription
- OpenAI audio transcription API reference: https://platform.openai.com/docs/api-reference/audio/createTranscription
- OpenAI model pages (transcribe models): https://platform.openai.com/docs/models/gpt-4o-transcribe and https://platform.openai.com/docs/models/whisper-1
- OpenAI API data usage policies: https://platform.openai.com/docs/guides/your-data
- Groq speech-to-text docs: https://console.groq.com/docs/speech-to-text
- Groq OpenAI compatibility docs: https://console.groq.com/docs/openai
- Groq data usage/retention: https://console.groq.com/docs/your-data
