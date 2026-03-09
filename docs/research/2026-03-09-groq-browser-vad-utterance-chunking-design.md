<!--
Where: docs/research/2026-03-09-groq-browser-vad-utterance-chunking-design.md
What: Detailed design for replacing the current Groq chunking heuristic with a Whispering-style browser VAD utterance pipeline.
Why: The current Groq path is still pause-bounded and relies on coarse RMS thresholding. This document designs a better utterance detector without collapsing the whisper.cpp path into the same architecture.
-->

# Groq Browser VAD Utterance Chunking Design

## Scope

This is a design-only document.
No code changes are proposed here.

This design targets only:

- `processing.streaming.provider = groq_whisper_large_v3_turbo`
- `processing.streaming.transport = rolling_upload`

This design explicitly does **not** change the fundamental model for:

- `processing.streaming.provider = local_whispercpp_coreml`
- `processing.streaming.transport = native_stream`

## Problem statement

The current Groq streaming path is not true continuous upstream streaming.
It is pause-bounded rolling upload.

That is acceptable as a transport model for Groq.
The problem is that the current utterance boundary detector is too primitive.

Today, the renderer uses:

- fixed PCM frames from [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js)
- a simple RMS threshold + silence timer in [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)

That current approach has predictable failure modes:

- quiet starts can be dropped
- boundary timing is coarse
- pause detection is acoustic but not robust
- last words near pauses can be clipped
- short utterances can be misclassified and discarded

The user wants Groq chunking to work more like Whispering.

## What Whispering actually does

I checked the actual Whispering code in `resources/references/epicenter-main.zip`, especially:

- `apps/whispering/src/lib/state/vad-recorder.svelte.ts`

Whispering uses:

- `@ricky0123/vad-web`
- `MicVAD.new({ submitUserSpeechOnPause: true, model: 'v5' })`

That means it does not implement its own RMS chunker.
It uses a model-based browser VAD pipeline and receives complete utterance audio when speech ends.

Whispering is therefore:

- utterance-first
- VAD-driven
- pause-bounded
- not true continuous token streaming

For Groq, that is a much better fit than our current heuristic.

## Real browser VAD behavior

Sources:

- Whispering reference code in `resources/references/epicenter-main.zip`
- official docs for `@ricky0123/vad-web`: https://docs.vad.ricky0123.com/user-guide/api/
- algorithm docs: https://docs.vad.ricky0123.com/user-guide/algorithm/
- upstream package README: https://github.com/ricky0123/vad/tree/master/packages/web

## Library surface

The `MicVAD` API exposes:

- `onSpeechStart`
- `onSpeechRealStart`
- `onSpeechEnd(audio: Float32Array)`
- `onVADMisfire`
- `onFrameProcessed(probabilities, frame)`
- `submitUserSpeechOnPause`
- `positiveSpeechThreshold`
- `negativeSpeechThreshold`
- `redemptionMs`
- `preSpeechPadMs`
- `minSpeechMs`
- `getStream`
- `pauseStream`
- `resumeStream`

Important behavioral facts from the docs:

- `onSpeechEnd` returns audio as `Float32Array` at sample rate `16000`
- the VAD algorithm runs on model-sized frames
- for model `v5`, frame size is `512` samples
- at `16 kHz`, that is `32 ms` per frame
- speech state transitions are based on speech probability, not raw RMS energy
- `preSpeechPadMs` prepends context before detected speech
- `redemptionMs` controls how much speech-negative time is tolerated before closing the utterance
- `submitUserSpeechOnPause: true` lets pause/end-of-session force emission of the current utterance
- `MicVAD` does **not** expose a direct "emit the current utterance buffer now" API during active speech

Verified-library constraint:

- this design assumes a pinned `vad-web` release whose API includes `onSpeechRealStart`
- if the pinned release lacks `onSpeechRealStart`, phase 1 must fall back to `onSpeechStart` plus local confirmed-speech sample counting
- implementation must not proceed on an unpinned floating version of the VAD package

Implementation constraint for this design:

- phase 1 should **not** rely on `submitUserSpeechOnPause`
- phase 1 should treat natural `onSpeechEnd` as the only VAD-owned utterance completion path
- explicit stop should be handled by the renderer-owned live buffer instead of asking MicVAD to flush

## Why this is materially better than the current chunker

Our current chunker operates on about:

- `2048`-sample worklet frames
- about `128 ms` frame cadence at `16 kHz`

The browser VAD model operates on:

- `512`-sample frames for `v5`
- about `32 ms` cadence at `16 kHz`

That improves boundary precision by roughly `4x` before any tuning changes are considered.

More importantly, the model is using speech probability rather than RMS only.
That means the detector is less likely to confuse:

- soft consonants
- quiet syllables
- background noise changes
- breath and plosive boundaries

## Design goals

1. Improve Groq utterance boundaries significantly.
2. Keep the existing streaming session control plane.
3. Avoid rewriting the entire main process transport.
4. Do not degrade or complicate `whisper.cpp` native streaming.
5. Preserve the ability to stop, cancel, and fail sessions deterministically.
6. Make boundary behavior observable and tunable.

## Non-goals

1. Do not convert Groq into true native token streaming.
2. Do not replace `whisper.cpp` with browser VAD chunking.
3. Do not unify Groq and `whisper.cpp` under one fake "streaming" abstraction.
4. Do not add transformation-layer changes in this design.

## Current architecture summary

Current Groq path:

1. worklet emits PCM frames
2. ingress batches frames over IPC
3. speech chunker decides `speech_pause`, `max_chunk`, or `discard_pending`
4. main Groq adapter accumulates batches
5. upload starts only when `flushReason !== null`
6. overlap/dedupe manage repeated boundary text

This means the renderer currently has two different responsibilities mixed together:

- transport frame batching
- utterance boundary detection

That is the main thing the redesign should clean up.

## Proposed target architecture

## High-level model

Split the renderer capture layer into two provider-specific modes:

### Mode A: native continuous stream

Used only for:

- `local_whispercpp_coreml`

Behavior:

- keep the current frame-based live capture model
- keep transport batching
- remove semantic dependency on renderer chunk boundaries

### Mode B: browser VAD utterance chunking

Used only for:

- `groq_whisper_large_v3_turbo`

Behavior:

- browser VAD owns utterance detection
- renderer emits complete utterance audio units
- main Groq adapter uploads those utterances
- overlap/dedupe become simpler and narrower

This design intentionally makes the renderer path provider-aware.
That is correct here, because the providers have different transport truths.

## Proposed renderer components

### 1. `groq-browser-vad-capture.ts`

New renderer module responsibility:

- create and manage `MicVAD`
- maintain a bounded renderer-owned PCM shadow buffer from `onFrameProcessed`
- request microphone stream
- emit utterance-level audio payloads
- surface speech lifecycle signals
- support graceful stop/cancel semantics

Ownership rule:

- `groq-browser-vad-capture.ts` owns the `MicVAD` instance lifecycle
- microphone stream acquisition is supplied through the `MicVAD.new({ getStream })` option
- stop, cancel, fatal error, and init failure must all converge on `MicVAD.destroy()` plus stream cleanup

Suggested interface:

```ts
export interface GroqVadUtteranceCapture {
  stop(reason?: StreamingSessionStopReason): Promise<void>
  cancel(): Promise<void>
}

export interface GroqVadUtteranceCaptureOptions {
  deviceConstraints: MediaTrackConstraints
  sink: GroqUtteranceSink
  onFatalError: (error: unknown) => void
  vad: GroqBrowserVadOptions
}
```

### 2. `groq-browser-vad-config.ts`

New pure module responsibility:

- own Groq VAD defaults
- centralize tuning
- prevent magic numbers from spreading into tests and wiring

Suggested defaults:

- `model = 'v5'`
- `positiveSpeechThreshold = 0.3`
- `negativeSpeechThreshold = 0.25`
- `redemptionMs = 900-1400` search range for tuning, not a pre-validated default
- `preSpeechPadMs = 300-800` range, default chosen by testing
- `minSpeechMs = 160-250` range, default chosen by testing

Important point:

We should not blindly copy Whispering defaults.
Whispering is optimized for hands-free dictation UX in its own app.
Groq latency and boundary loss may benefit from smaller `preSpeechPadMs` and possibly smaller `redemptionMs`.

## Proposed IPC contract changes

The current IPC contract is frame-batch-centric:

- `pushStreamingAudioFrameBatch(batch)`

For Groq VAD utterances, we should not force utterance blobs through a frame-batch API that was designed for continuous transport.

Recommended approach:

- keep the existing frame-batch IPC for `whisper.cpp`
- add a second IPC path for utterance chunks

Suggested shared type:

```ts
export interface StreamingAudioUtteranceChunk {
  sessionId: string
  wavBytes: ArrayBuffer
  wavFormat: 'wav_pcm_s16le_mono_16000'
  startedAtMs: number
  endedAtMs: number
  source: 'browser_vad'
  utteranceIndex: number
  reason: 'speech_pause' | 'session_stop'
}
```

Suggested renderer API:

- `pushStreamingAudioUtteranceChunk(chunk)`

Why separate IPC is better:

1. It matches the transport truth for Groq.
2. It avoids pretending utterance chunks are just another frame batch.
3. It simplifies invariants in the main adapter.
4. It keeps `whisper.cpp` fast-path unchanged.

Why `ArrayBuffer`-backed WAV instead of `Float32Array`:

1. It makes IPC payload size and representation explicit.
2. It avoids silently relying on large structured-clone copies of `Float32Array`.
3. It matches the Groq adapter's eventual WAV construction needs more closely.
4. It makes transfer and ownership decisions easier to reason about.

Refinement for the first implementation:

- the renderer should emit `wavBytes`, not raw `pcm16le`
- this keeps the Groq adapter simple because it uploads a ready-to-send WAV payload
- timestamp metadata still travels alongside the WAV payload for ordering and diagnostics
- the utterance IPC path must transfer the `ArrayBuffer` to main rather than clone it

Locked payload contract:

- RIFF/WAV container
- PCM signed 16-bit little-endian payload
- mono only
- `16000 Hz` sample rate
- one utterance per payload

Transport requirement:

- the new utterance IPC must use transfer-aware transport, not plain invoke-style structured-clone only IPC
- if a transfer-aware preload bridge is not practical, the fallback should be a `MessagePort`-based bridge rather than large typed-array cloning
- a new shared browser-safe WAV encoder module is required because the current helper in [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts) is main-process-specific
- the shared encoder must operate on browser-compatible typed arrays rather than Node `Buffer`

## Proposed main-side adapter changes

## New adapter model for Groq

Instead of accumulating `currentChunkFrames` from arbitrary frame batches, the Groq adapter should accept already-formed utterances.

New responsibilities:

- upload one utterance at a time
- preserve output ordering
- optionally add overlap only when needed
- dedupe only where overlap or provider repetition requires it

This changes the Groq adapter from:

- "frame accumulator + upload scheduler"

to:

- "ordered utterance uploader"

That is a cleaner and more honest architecture.

Ordering policy for the first implementation:

- uploads may remain concurrent
- the existing main-side ordered-emission behavior should be preserved
- `utteranceIndex` is required so out-of-order HTTP completions can still be reassembled deterministically before segment emission

## Should overlap still exist?

Yes, but in a narrower form.

Today overlap is used for `max_chunk`.
In the new design:

- `speech_pause` utterances should usually not need overlap
- phase 1 should not use overlap between naturally completed VAD utterances

So overlap should become tied to:

- forced mid-speech continuity splits

not to:

- normal VAD-completed utterances

## What about long uninterrupted speech?

This is the most important design question after adopting VAD.

A pure "emit only on pause" strategy is not enough if the user speaks continuously for a long time.

Recommended phase 1 policy:

1. Primary boundary mechanism:
   - browser VAD utterance completion on pause
2. Explicit stop boundary:
   - renderer-owned live buffer emits a final `session_stop` utterance
3. Long uninterrupted speech:
   - accepted as a known limitation of phase 1
   - documented as a follow-up problem rather than forced into the first implementation
   - guarded by a hard renderer-side maximum utterance byte budget that fails the session with an explicit provider-limit error before a likely 413 upload

Why phase 1 deliberately excludes forced splits:

- `MicVAD` has no direct API to flush the current utterance mid-speech
- combining forced splits with later `onSpeechEnd` reconciliation creates a much more complex duplicate/loss problem
- the pause-bounded model is already a substantial improvement over the current RMS chunker

Future phase 2 option:

- if long uninterrupted speech remains a real product problem, introduce a hybrid forced-split layer on top of the bounded shadow PCM buffer
- that phase should be designed separately, because it changes dedupe, overlap, and stop behavior materially

## Stop and cancel semantics in the VAD model

## Stop (`user_stop`)

Desired behavior:

1. set renderer state to `flushing_stop`
2. create a renderer-owned stop barrier promise
3. synchronously set `ignoreVadSpeechEnd = true` and increment a stop generation token before the first `await`
4. prevent any new utterance emission paths from arming
5. pause or destroy VAD without relying on `submitUserSpeechOnPause`
6. finalize the renderer-owned live utterance buffer
7. emit at most one final utterance chunk with `reason = 'session_stop'`
8. resolve the renderer stop barrier when one of these happens:
   - the final utterance chunk is handed off successfully
   - there is no valid buffered speech to submit
   - a terminal timeout is hit
9. only after the renderer stop barrier settles does main consume the remaining Groq stop budget for upload drain
10. end session

The renderer-owned live buffer is the source of truth for explicit stop.
To avoid double emission races, phase 1 should configure `MicVAD` with:

- `submitUserSpeechOnPause = false`

Stop precedence rule:

- once `flushing_stop` begins, stop becomes the sole terminal utterance emitter
- any later `onSpeechEnd` callback is ignored if its captured generation token does not match the current live generation
- this avoids trying to merge a VAD-completed utterance with a stop-time utterance in the same boundary window

Budget ownership rule:

- renderer owns `stop -> final utterance handoff or timeout`
- main owns `post-handoff upload drain within adapter budget`

## Cancel (`user_cancel`)

Desired behavior:

1. destroy/pause VAD immediately
2. discard unsubmitted speech buffers
3. abort in-flight uploads
4. clear ordering state

## Fatal error

Desired behavior:

1. terminate VAD
2. stop renderer capture path
3. notify main
4. clear pending buffers
5. abort uploads

## Recommended state machine

Groq renderer VAD state should be explicit.

Suggested states:

- `idle`
- `initializing`
- `listening`
- `speech_detected`
- `speech_confirmed`
- `flushing_stop`
- `stopped`
- `failed`

Why this matters:

- `onSpeechStart` is not the same as durable speech
- `onSpeechRealStart` indicates enough frames for a stronger "confirmed speech" signal
- misfire handling should not be confused with real utterance completion

Cold-start rule:

- `initializing` has a bounded startup timeout
- if VAD assets or microphone startup do not complete in time, the session fails before entering `listening`
- user speech that happens before `listening` is not recoverable in V1 and must be surfaced as startup latency, not silently treated as captured audio

Stop-race guardrails:

- once `flushing_stop` begins, no new utterance may be started
- exactly one terminal utterance emission is allowed during stop
- late `onSpeechEnd` callbacks must be ignored unconditionally once `ignoreVadSpeechEnd = true`
- cancel/fatal paths discard all pending renderer-owned utterance buffers immediately
- the transition to `flushing_stop` must happen before any VAD pause/destroy call

## Detailed callback mapping

Map `MicVAD` callbacks to our app behavior like this.

### `onSpeechStart`

Purpose:

- UI activity only
- optional diagnostics

Do not upload anything here.

### `onSpeechRealStart`

Purpose:

- transition renderer state to confirmed speech
- mark the utterance as legitimate
- useful for diagnostics and eventual UI indicators

### `onVADMisfire`

Purpose:

- log a dropped candidate utterance
- increment diagnostics counters
- do not upload

This replaces our current `discard_pending` semantics with a library-native concept.
Misfires must not consume `utteranceIndex`.

Stop interaction rule:

- during `flushing_stop`, `onVADMisfire` is a no-op for upload behavior
- if stop lands after `onSpeechStart` but before the library would misfire or end speech, the renderer stop path decides whether the shadow buffer contains enough confirmed speech to emit `session_stop`
- otherwise stop resolves with no final utterance

### `onSpeechEnd(audio)`

Purpose:

- confirm a naturally completed utterance boundary
- finalize the current natural utterance
- clear the renderer-owned live buffer
- send one utterance payload to main

This becomes the primary Groq audio delivery event.

## Timestamps and utterance metadata

`MicVAD.onSpeechEnd` returns samples at `16000 Hz`, but we still need useful session-relative timing metadata for:

- segment assembly
- ordering
- debugging
- overlap calculations for forced splits

Recommended utterance metadata:

- `startedAtMs`
- `endedAtMs`
- `durationMs`
- `reason`
- `sessionId`
- `utteranceIndex`

`utteranceIndex` semantics:

- contiguous and monotonic across emitted utterances only
- misfires do not consume an index
- ordering in the Groq adapter must wait only for emitted indices, never for misfire counters

How to derive timing:

- phase 1 must not assume `onFrameProcessed` is already in the final 16 kHz model domain unless runtime verification proves it
- maintain a monotonically increasing renderer monotonic clock for session-relative diagnostics
- derive `durationMs` from the emitted utterance WAV payload length at `16000 Hz`
- derive `endedAtMs` from the renderer monotonic clock when the utterance is sealed
- derive `startedAtMs = endedAtMs - durationMs`, clamped to `0`

Important constraint:

- `MicVAD.onSpeechEnd` does not itself provide sample-accurate timestamps
- therefore phase-1 timestamps are approximate session-relative audio-window diagnostics, not canonical segment-ordering inputs
- utterance ordering must rely on `utteranceIndex`, not timestamp precision

Bounded shadow-buffer policy:

- keep only the current live utterance buffer plus a rolling pre-speech ring sized to `preSpeechPadMs + safety`
- do not retain the entire session PCM history
- once an utterance is emitted, the live utterance buffer is cleared and the rolling pre-speech ring continues

Pre-speech alignment rule:

- the emitted WAV payload is sourced from `onSpeechEnd(audio)` for natural utterances and from the renderer shadow buffer only for explicit stop
- timestamp metadata is derived to match the emitted payload length, not an independently reconstructed hypothetical window

## Proposed settings design

Current `StreamingSettingsSchema` has no provider-specific VAD config.

That is a real gap.

Recommended new nested settings:

```ts
streaming: {
  ...
  groqVad: {
    model: 'v5'
    positiveSpeechThreshold: number
    negativeSpeechThreshold: number
    redemptionMs: number
    preSpeechPadMs: number
    minSpeechMs: number
  }
}
```

Why settings-backed:

1. Tunables must not be hard-coded across files.
2. We will need empirical tuning.
3. Tests should derive defaults from one place.

Why there is no `enabled` flag:

- for the Groq rolling-upload path, browser VAD is the intended capture architecture
- a boolean flag would create an undesigned fallback to the legacy RMS chunker
- if we ever need fallback behavior, it should be expressed as an explicit capture mode, not a hidden boolean escape hatch

Suggested future-proof expression if rollback is needed:

- `processing.streaming.groqCaptureMode = 'browser_vad' | 'legacy_rms'`

That is intentionally not part of the first design because it would commit us to maintaining both paths indefinitely.

## Recommended defaults

Initial proposed defaults for Groq:

- `model = 'v5'`
- `positiveSpeechThreshold = 0.3`
- `negativeSpeechThreshold = 0.25`
- `redemptionMs = 900` as an initial hypothesis, not a validated production number
- `preSpeechPadMs = 400`
- `minSpeechMs = 160`

Rationale:

- lower `redemptionMs` than the package default reduces post-pause lag
- `900 ms` is still slower than the current `550 ms` silence heuristic and is proposed only as a starting tradeoff for better VAD quality, not as a proven latency win over the current implementation
- lower `preSpeechPadMs` than Whispering default reduces repeated lead-in context
- `minSpeechMs = 160` avoids regressing short valid utterances relative to the current path

These are starting points only.

Settings migration requirement:

- the settings repository must default-fill the new `streaming.groqVad` object for existing users
- validation must treat the block as required when the provider is Groq streaming
- migration/default-fill must happen during persisted-settings load, not only at UI write time

## Detailed migration plan

## Phase 1: Introduce provider-specific capture abstraction

Create a small renderer capture factory:

- `createStreamingCaptureForProvider(config, sink, ...)`

Behavior:

- `groq` -> VAD utterance capture
- `whisper.cpp` -> existing live frame capture

This is the architectural separation point.

Explicit Groq-mode rule:

- do not start [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js) in Groq VAD mode
- MicVAD owns microphone capture for the Groq path

## Phase 2: Add utterance IPC path

Introduce:

- `pushStreamingAudioUtteranceChunk`

Keep:

- `pushStreamingAudioFrameBatch`

Main controller should route:

- frame batches only to native-stream runtimes
- utterance chunks only to rolling-upload runtimes

Contract change requirement:

- the shared IPC surface must add the new utterance channel
- the preload bridge must explicitly expose it
- main IPC registration must validate session ownership for utterance chunks the same way frame batches are validated today
- the session controller/runtime interfaces must distinguish frame-stream ingestion from utterance-chunk ingestion instead of overloading one method ambiguously
- the preload bridge must support transferred `ArrayBuffer` payloads for utterance WAV bytes
- specifically, the runtime surface should expose separate contracts for:
  - continuous frame ingestion used by native-stream providers
  - utterance-chunk ingestion used by rolling-upload providers

## Phase 3: Refactor Groq adapter

Replace frame-accumulation semantics with utterance-acceptance semantics.

The new Groq adapter should:

- accept one utterance at a time
- accept a ready-to-upload WAV payload plus timing metadata
- use serial upload/drain in V1
- preserve emission order
- keep model-level dedupe even when there is no audio overlap
- keep overlap-specific dedupe available for any later forced-split follow-up work
- assign final segment `sequence` from a monotonic `nextSequence` counter rather than a stride formula
- cap `maxInFlightUploads = 1` in V1
- cap `maxQueuedUtterances = 2` in V1 and auto-pause VAD after the current utterance if the queue is full
- surface a user-visible backpressure state while the queue drains
- resume VAD only after queue capacity returns
- fail the session only if backpressure cannot clear within a bounded watchdog window

Ordering contract:

- `utteranceIndex` is a zero-based, session-local counter assigned in the renderer
- main owns one monotonic `nextSequence` counter for emitted final segments
- each provider segment emitted from the current utterance consumes the next sequence number in order
- `utteranceIndex` is for utterance ordering only, not final segment numbering

## Phase 4: Instrumentation and tuning

Before broad rollout, log:

- speech start
- speech real start
- misfire
- speech end
- utterance duration
- upload duration
- segment dedupe

That should happen before any UX claims about quality improvement.

Explicit IPC payload policy:

- phase 1 requires transfer-aware IPC for utterance `ArrayBuffer` payloads
- plain structured-clone copying is not an acceptable implementation for utterance WAV payloads

## Optional Phase 5: Long-speech hybrid follow-up

Only if needed after phase 1 tuning:

- add a separate design for long uninterrupted speech splitting
- keep it explicitly distinct from the base VAD utterance design
- require a reconciliation algorithm between renderer-emitted forced splits and any later VAD completion callbacks

## Risks and tradeoffs

## Risk 1: Browser VAD asset/runtime complexity

`vad-web` requires:

- model assets
- ONNX runtime wasm assets
- worklet support or fallback

This is more operationally complex than our current local chunker.

Mitigation:

- scope it to Groq only
- package assets explicitly
- bundle and resolve the VAD worklet, Silero model, and ONNX runtime wasm from app-controlled local asset paths
- validate Electron renderer/CSP compatibility for those local asset URLs before implementation starts
- add startup validation and good fatal errors

## Risk 2: Different browser/device behavior

Microphone constraints, AGC, noise suppression, and echo cancellation can affect VAD quality.

Mitigation:

- provide custom `getStream`
- log real audio constraints
- tune on representative devices
- request mono constraints explicitly, but tolerate browser fallback if mono is not honored
- the capture module should own stream lifecycle explicitly through custom `getStream`, `pauseStream`, and teardown logic so microphone tracks are stopped exactly once

## Risk 3: Forced split still needed

Pure pause-based utterances can stall for uninterrupted speech.

Mitigation:

- accept this in phase 1 and measure it explicitly
- only add a hybrid split layer in a follow-up design if the measured UX cost justifies the complexity
- explicitly call out that long uninterrupted speech plus the existing Groq stop budget may still produce weak tail latency when the user stops after a very long utterance

## Risk 4: Session stop semantics are still subtle

Stop must coordinate:

- VAD pause
- final utterance submit
- upload drain
- session controller stop

Mitigation:

- treat stop as a first-class design path
- test explicit stop during:
  - silence
  - active speech
  - immediately after speech end
  - concurrently with a natural `onSpeechEnd` callback

## Risk 5: Not all benefits apply to whisper.cpp

Trying to share the same capture architecture across Groq and `whisper.cpp` would reintroduce the current conceptual confusion.

Mitigation:

- keep provider-specific capture modes

## Why not keep the current chunker and just tune thresholds?

Because the current chunker is fundamentally based on:

- coarse worklet frame windows
- RMS thresholding
- silence duration

That can be tuned, but it will remain:

- less precise
- less robust
- more error-prone on soft speech and boundary words

The problem is not just the threshold values.
It is the quality of the detector itself.

## Why not use browser VAD for whisper.cpp too?

Because that would downgrade the conceptual model for a provider that already supports a truer continuous stream.

For `whisper.cpp`, the correct optimization targets are:

- frame cadence
- stop/drain correctness
- child-process transport reliability

For Groq, the correct optimization target is:

- utterance quality

These are different problems.

## Recommended implementation direction

The right architecture is:

1. keep `whisper.cpp` on continuous frame streaming
2. move Groq to browser-VAD utterance chunks
3. introduce provider-specific renderer capture paths
4. add a dedicated utterance IPC contract
5. keep the first Groq implementation pause-bounded plus stop-safe
6. preserve ordered emission and model-level dedupe in the Groq adapter
7. defer any forced long-speech split layer to a separate follow-up design

## Stop-time minimum-content rule

For a stop-triggered utterance:

- emit only if either:
  - `onSpeechRealStart` has already fired, or
  - the renderer has accumulated at least `minSpeechMs` worth of confirmed speech-domain samples
- otherwise treat the stop-time buffer as a misfire and discard it

Misfire reset rule:

- `onVADMisfire` clears the current live utterance buffer
- the rolling pre-speech ring continues
- there is no overlap carryover state in phase 1 normal VAD utterances, so nothing else must be preserved across misfires

## Proposed acceptance criteria

This design is successful if Groq shows these improvements:

1. quiet utterance starts are preserved better than today
2. end-of-utterance clipping is reduced
3. short valid utterances are dropped less often
4. long uninterrupted speech behavior is measured and documented explicitly in V1
5. stop during active speech reliably produces the final utterance
6. repeated words at chunk boundaries are reduced, not increased
7. back-to-back short utterances with pauses shorter than `preSpeechPadMs` do not regress dedupe quality

## Final recommendation

Adopt a Whispering-style browser VAD utterance pipeline for Groq only.

Do not try to "improve streaming" by making every provider obey the same chunker.
That is the mistake the current architecture is already too close to making.

For Groq, chunking is the transport truth, so improve chunk quality with real VAD.
For `whisper.cpp`, keep continuous streaming and treat chunking as secondary scaffolding only.
