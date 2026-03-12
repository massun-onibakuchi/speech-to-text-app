<!--
Where: docs/plans/issue-440-groq-browser-vad-execution-plan.md
What: Ticketed execution plan for moving Groq rolling-upload from the current RMS chunker to a browser-VAD utterance architecture.
Why: Freeze the implementation sequence before coding so each PR is scoped, reviewable, and aligned with the approved design.
-->

# Issue 440 Execution Plan: Groq Browser VAD Utterance Chunking

Date: 2026-03-09  
Status: Pre-implementation plan. No production code changes have started from this plan.

## Inputs Reviewed

- Design:
  - [2026-03-09-groq-browser-vad-utterance-chunking-design.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-groq-browser-vad-utterance-chunking-design.md)
- Decision:
  - [2026-03-09-groq-browser-vad-utterance-architecture-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-09-groq-browser-vad-utterance-architecture-decision.md)
- Prior research:
  - [2026-03-09-how-streaming-chunking-works-research.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-how-streaming-chunking-works-research.md)
  - [2026-03-09-issue-440-deep-debug-hypotheses.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-issue-440-deep-debug-hypotheses.md)
  - [2026-03-07-epicenter-whispering-vad-chunked-parallel-stt-architecture-research.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-07-epicenter-whispering-vad-chunked-parallel-stt-architecture-research.md)
- Current runtime files:
  - [native-recording.ts](/workspace/.worktrees/fix/issue-440/src/renderer/native-recording.ts)
  - [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)
  - [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)
  - [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)
  - [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
  - [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
  - [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
  - [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
  - [domain.ts](/workspace/.worktrees/fix/issue-440/src/shared/domain.ts)
- External references:
  - `@ricky0123/vad-web` API docs
  - `@ricky0123/vad-web` algorithm docs
  - Whispering reference code in `resources/references/epicenter-main.zip`

## Planning Constraints

- `1 ticket = 1 PR`.
- Tickets are sorted by priority and dependency.
- This workstream is for the Groq rolling-upload path only.
- `whisper.cpp` must remain on the current continuous frame-stream path.
- Each ticket must include docs and tests.
- No ticket should silently widen scope into generic streaming refactors unless explicitly called out.

## Priority Summary

| Priority | Ticket | PR | Outcome | Depends On | Feasibility | Main Risk |
|---|---|---|---|---|---|---|
| P0 | T440-01 Contract Freeze | PR-1 | Freeze spec, settings, IPC, payload, and provider-specific capture contracts | None | High | Contract drift before implementation |
| P1 | T440-02 Renderer Browser VAD Capture | PR-2 | Add Groq-only browser VAD capture and asset boot path behind provider-aware capture factory | PR-1 | Medium | Asset/runtime startup failures in Electron |
| P2 | T440-03 Transfer-Aware Utterance IPC | PR-3 | Add utterance IPC path, preload bridge, ownership validation, and session-controller ingestion split | PR-1 | Medium | Incorrect transport semantics or renderer/main copy pressure |
| P3 | T440-04 Groq Ordered Utterance Adapter | PR-4 | Refactor Groq adapter to upload ordered utterances instead of frame accumulation | PR-2, PR-3 | Medium | Sequence, backpressure, dedupe regressions |
| P4 | T440-05 Stop, Backpressure, and QA Hardening | PR-5 | Finalize stop race handling, backpressure UX, diagnostics, and manual/automated QA gates | PR-4 | Medium | Tail-loss or pause-regression escaping into release |

Priority rationale:

- PR-1 must freeze the contract first because payload shape, settings shape, and provider-specific capture split are architecture seams.
- PR-2 and PR-3 are split because browser VAD runtime/asset loading and renderer-main transport are different risk domains.
- PR-4 stays Groq-only so the adapter rewrite does not accidentally drag `whisper.cpp` into the same abstraction.
- PR-5 is reserved for hardening because stop, backpressure, and slow-network behavior are where this design can still fail after the happy path works.

## Ticket T440-01 (P0): Contract Freeze -> PR-1

### Goal

Freeze the normative contract for Groq browser-VAD utterance chunking before any runtime code changes start.

### Approach

- Update shared spec and planning docs to make the provider split explicit:
  - Groq uses browser-VAD utterance chunks.
  - `whisper.cpp` stays continuous frame-streaming.
- Lock the Groq utterance payload contract:
  - transfer-aware `ArrayBuffer`
  - WAV PCM16
  - mono
  - `16000 Hz`
- Lock the sequencing contract:
  - `utteranceIndex` for utterance ordering
  - `nextSequence` in main for final segment ordering

### Scope Files

- [spec.md](/workspace/.worktrees/fix/issue-440/specs/spec.md)
- [issue-440-groq-browser-vad-execution-plan.md](/workspace/.worktrees/fix/issue-440/docs/plans/issue-440-groq-browser-vad-execution-plan.md)
- [2026-03-09-groq-browser-vad-utterance-chunking-design.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-groq-browser-vad-utterance-chunking-design.md)
- [2026-03-09-groq-browser-vad-utterance-architecture-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-09-groq-browser-vad-utterance-architecture-decision.md)
- [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
- [domain.ts](/workspace/.worktrees/fix/issue-440/src/shared/domain.ts)

### Trade-offs

- Selected: provider-specific capture contract.
  - Pro: matches transport reality and avoids forcing Groq and `whisper.cpp` through one fake streaming model.
  - Con: less abstract than a single universal capture interface.
- Rejected: keep the current frame-batch contract and reinterpret batches as utterances.
  - Pro: less contract churn.
  - Con: preserves the current conceptual bug and copy-pressure risk.

### Checklist

- [ ] Spec explicitly says Groq rolling-upload uses browser-VAD utterance chunks.
- [ ] Spec explicitly says `whisper.cpp` remains on native continuous frame transport.
- [ ] Payload shape is locked.
- [ ] Sequence allocation is locked.
- [ ] Settings additions are locked.
- [ ] ADR and design doc are consistent with the plan.

### Tasks

1. Add a normative spec subsection for provider-specific streaming capture posture.
2. Add normative payload requirements for Groq utterance IPC.
3. Add normative sequence-ordering requirements.
4. Add normative settings requirements for `streaming.groqVad`.
5. Ensure the plan, ADR, and design doc all use the same contract terms.

### Gates

- No code path work starts until spec, plan, and design use the same payload/ordering/settings vocabulary.
- Reviewers can answer these without ambiguity:
  - what crosses IPC for Groq
  - who assigns utterance order
  - who assigns final segment order
  - whether `whisper.cpp` changes here

### Code Snippet

```ts
export interface StreamingAudioUtteranceChunk {
  sessionId: string
  utteranceIndex: number
  wavBytes: ArrayBuffer
  wavFormat: 'wav_pcm_s16le_mono_16000'
  startedAtMs: number
  endedAtMs: number
  reason: 'speech_pause' | 'session_stop'
  source: 'browser_vad'
}
```

## Ticket T440-02 (P1): Renderer Browser VAD Capture -> PR-2

### Goal

Add a Groq-only browser VAD capture path in the renderer without disturbing the existing `whisper.cpp` live-frame path.

### Approach

- Introduce a provider-aware capture factory in the renderer.
- Add `groq-browser-vad-capture.ts` for the Groq path.
- Keep `streaming-live-capture.ts` for `whisper.cpp`.
- Bootstrap `@ricky0123/vad-web` assets and VAD startup/teardown explicitly in Electron.

### Scope Files

- [native-recording.ts](/workspace/.worktrees/fix/issue-440/src/renderer/native-recording.ts)
- [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)
- new renderer files:
  - `src/renderer/groq-browser-vad-capture.ts`
  - `src/renderer/groq-browser-vad-config.ts`
  - `src/renderer/groq-browser-vad-capture.test.ts`
- possible build/runtime files:
  - `vite.config.*`
  - preload or asset path helpers if required

### Trade-offs

- Selected: add a second renderer capture path.
  - Pro: isolates Groq-specific behavior cleanly.
  - Con: more files and more startup branching.
- Rejected: teach `streaming-live-capture.ts` to do both frame-streaming and VAD-utterance capture.
  - Pro: fewer top-level files.
  - Con: mixes two incompatible capture truths into one module.

### Checklist

- [ ] Renderer capture factory chooses Groq VAD vs `whisper.cpp` frame-streaming.
- [ ] VAD startup has bounded timeout and fatal-error path.
- [ ] Stop/cancel/fatal all destroy the VAD instance and release the microphone.
- [ ] Groq path does not initialize the existing audio worklet capture path.
- [ ] Browser-VAD asset locations are explicit and test-covered.

### Tasks

1. Add provider-aware capture factory in the renderer start path.
2. Implement Groq VAD capture state machine.
3. Implement explicit stop barrier and generation-token guard.
4. Implement cold-start timeout and startup feedback wiring.
5. Add tests for:
   - startup success
   - startup timeout
   - natural `onSpeechEnd`
   - stop during speech
   - cancel/fatal cleanup

### Gates

- Groq path can start and stop without touching the old worklet frame capture.
- `whisper.cpp` tests remain unchanged or only minimally rewired through the factory.
- VAD asset paths are local-app controlled, not CDN-based.

### Code Snippet

```ts
const capture = config.provider === 'groq_whisper_large_v3_turbo'
  ? await startGroqBrowserVadCapture({ sink, vad: groqVadOptions, onFatalError })
  : await startStreamingLiveCapture({ sink, onFatalError, ...frameStreamOptions })
```

## Ticket T440-03 (P2): Transfer-Aware Utterance IPC -> PR-3

### Goal

Add a dedicated renderer-main utterance transport for Groq that does not clone large typed arrays through the existing invoke path.

### Approach

- Add a new IPC channel and preload bridge for utterance chunks.
- Require transfer-aware `ArrayBuffer` ownership handoff.
- Validate session ownership and session state exactly as strictly as the existing frame-batch ingress.
- Split controller/provider interfaces between frame-stream ingestion and utterance-chunk ingestion.

### Scope Files

- [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
- [index.ts](/workspace/.worktrees/fix/issue-440/src/preload/index.ts)
- [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- [types.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/types.ts)
- new tests around IPC registration and session-controller routing

### Trade-offs

- Selected: separate utterance IPC contract.
  - Pro: keeps Groq transport honest and avoids overloading the frame-batch API.
  - Con: adds more IPC surface.
- Rejected: multiplex utterances into `pushStreamingAudioFrameBatch`.
  - Pro: smaller API diff.
  - Con: destroys type clarity and makes ownership/transport rules muddy again.

### Checklist

- [ ] New utterance IPC channel exists in shared/preload/main.
- [ ] Transfer-aware handoff is required by the contract.
- [ ] Session ownership validation matches the current streaming ingress rules.
- [ ] Controller/provider interfaces distinguish frame-stream and utterance ingestion.
- [ ] Tests cover allowed and rejected ownership cases.

### Tasks

1. Add shared utterance types and IPC channel.
2. Expose preload bridge for utterance send.
3. Register main IPC handler with owner-window validation.
4. Add controller/provider split for frame-stream vs utterance ingestion.
5. Add tests for:
   - owner-window allowed
   - owner-window rejected
   - inactive session rejected
   - stopping/cancel state behavior

### Gates

- Groq utterance transport can be reasoned about without reading the frame-batch code.
- No large Groq payload depends on structured-clone copying through the old invoke path.
- Tests prove renderer ownership enforcement still holds.

### Code Snippet

```ts
await window.speechToTextApi.pushStreamingAudioUtteranceChunk({
  ...chunk,
  sessionId
}, [chunk.wavBytes])
```

## Ticket T440-04 (P3): Groq Ordered Utterance Adapter -> PR-4

### Goal

Replace Groq’s current frame-accumulation adapter with an ordered utterance uploader that accepts ready-to-upload WAV utterances.

### Approach

- Keep the adapter Groq-specific.
- Upload one utterance at a time in V1.
- Use `utteranceIndex` only for utterance ordering.
- Use `nextSequence` in main for final segment numbering.
- Preserve dedupe, but retune it for pure utterance boundaries instead of overlap-heavy frame windows.

### Scope Files

- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- [chunk-window-policy.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/chunk-window-policy.ts)
- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- tests:
  - `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
  - stop budget / integration tests

### Trade-offs

- Selected: serial upload in V1.
  - Pro: removes a large amount of ordering ambiguity while the new path is stabilizing.
  - Con: sacrifices some throughput under ideal networks.
- Rejected: keep concurrent uploads immediately.
  - Pro: better top-end throughput.
  - Con: more sequence/backpressure/dedupe complexity during the riskiest migration step.

### Checklist

- [ ] Adapter accepts utterance WAV payloads, not frame batches.
- [ ] Upload ordering is deterministic.
- [ ] `nextSequence` is monotonic and gap-safe.
- [ ] Backpressure state is explicit.
- [ ] Dedupe behavior is covered for:
  - repeated last word
  - short repeated word
  - back-to-back short utterances with small pauses

### Tasks

1. Introduce utterance-ingestion entrypoint in the Groq adapter.
2. Remove frame accumulation from the Groq path.
3. Replace chunk-stride sequencing with monotonic `nextSequence`.
4. Reevaluate dedupe logic against utterance boundaries.
5. Add tests for:
   - one utterance -> many provider segments
   - two utterances in order
   - repeated word boundaries
   - no-overlap normal utterances
   - explicit stop utterance

### Gates

- No Groq code path depends on renderer frame accumulation after this PR.
- Ordered emission still holds under slow uploads.
- Dedupe is validated against utterance-style edges, not just overlap edges.

### Code Snippet

```ts
for (const providerSegment of providerSegments) {
  const sequence = this.nextSequence
  this.nextSequence += 1
  await this.callbacks.onFinalSegment({
    sessionId: this.params.sessionId,
    sequence,
    text: providerSegment.text,
    startedAt: providerSegment.startedAt,
    endedAt: providerSegment.endedAt
  })
}
```

## Ticket T440-05 (P4): Stop, Backpressure, and QA Hardening -> PR-5

### Goal

Harden the Groq VAD path around stop races, slow-network backpressure, diagnostics, and release gates.

### Approach

- Add explicit instrumentation at the renderer and adapter boundaries.
- Convert backpressure into a visible paused state before it becomes terminal.
- Validate stop behavior across natural end, active speech, misfire boundary, and slow upload drain.
- Add a manual QA checklist for real microphone behavior.

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [native-recording.ts](/workspace/.worktrees/fix/issue-440/src/renderer/native-recording.ts)
- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
- [streaming-raw-dictation-manual-checklist.md](/workspace/.worktrees/fix/issue-440/docs/qa/streaming-raw-dictation-manual-checklist.md)

### Trade-offs

- Selected: ship with explicit diagnostics.
  - Pro: lets us debug real device/network behavior quickly.
  - Con: more logging and slightly more code surface.
- Rejected: ship without temporary or structured diagnostics.
  - Pro: cleaner code diff.
  - Con: boundary bugs will be much slower to localize.

### Checklist

- [ ] Stop race is covered by tests.
- [ ] Slow-upload backpressure is visible and test-covered.
- [ ] Manual QA checklist includes natural pause, long speech, stop-during-speech, and low-volume start cases.
- [ ] Logs are high-signal and removable later.

### Tasks

1. Add structured diagnostics around:
   - VAD startup
   - natural utterance completion
   - stop barrier resolution
   - queue-full auto-pause
   - upload begin/end
2. Add tests for:
   - stop during speech
   - stop during misfire boundary
   - queue-full auto-pause and resume
   - startup timeout
3. Update manual QA checklist.
4. Remove or gate any low-value debug noise before merge.

### Gates

- One manual test pass exists for real microphone behavior.
- Stop path is validated under at least one slow-upload scenario.
- Backpressure does not silently drop utterances.

### Code Snippet

```ts
logStructured({
  level: 'info',
  scope: 'renderer',
  event: 'streaming.groq_vad.backpressure_pause',
  message: 'Pausing Groq VAD capture until utterance queue drains.',
  context: {
    sessionId,
    queuedUtterances,
    maxQueuedUtterances
  }
})
```

## Cross-Ticket Risks

- Electron transfer-aware IPC may require preload/protocol adjustments not obvious from the current code.
- `vad-web` asset loading may fail in packaged builds even if dev works.
- Approximate phase-1 timestamps may be good enough for diagnostics but not ideal for future analytics.
- Long uninterrupted speech remains a deliberate V1 limitation for the Groq path.

## Implementation Order

1. PR-1: freeze contract and spec.
2. PR-2: Groq renderer capture path and startup semantics.
3. PR-3: utterance IPC and controller/runtime split.
4. PR-4: Groq adapter rewrite to ordered utterance uploads.
5. PR-5: hardening, QA, and diagnostics.

## Definition of Ready

The implementation can start only when:

- this plan is reviewed and clean
- the design doc and ADR stay consistent with the plan
- the spec update is committed
- Groq browser VAD remains explicitly scoped away from `whisper.cpp`
