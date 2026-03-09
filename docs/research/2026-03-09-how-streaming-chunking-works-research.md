<!--
Where: docs/research/2026-03-09-how-streaming-chunking-works-research.md
What: Detailed research note on how streaming chunking currently works across renderer, main, and provider adapters.
Why: Give a precise model for debugging chunk-boundary issues before changing the implementation.
-->

# Research: How Streaming Chunking Works In This Repo

Date: 2026-03-09
Status: code-backed research, no implementation changes

## Executive Summary

This repo has multiple different things that can all be called "chunking", and they are easy to confuse.

There are really five layers:

1. **Worklet frame chunking**
   - fixed-size PCM frames emitted by the `AudioWorklet`
2. **Renderer transport batching**
   - several frames grouped into one renderer -> main IPC payload
3. **Renderer speech chunk detection**
   - pause / max-duration / short-blip logic that decides when a speech chunk boundary happened
4. **Provider-side audio chunking**
   - for Groq rolling upload, those boundaries become actual uploaded audio chunks
   - for whisper.cpp native stream, they mostly do not
5. **Final text segmentation**
   - provider final segments committed into ordered output

If a user says "chunking is wrong", the bug could live in any of those layers.

The most important practical distinction is:

- **Whisper.cpp path** is closer to real streaming. Renderer chunk boundaries do not define final STT output; they mostly shape transport and short-blip discard behavior.
- **Groq rolling-upload path** is not true native streaming. It is deliberate **pause-bounded chunk upload**. In that path, chunk boundaries are first-class and directly affect what audio gets uploaded together.

## Key Terms

### Frame

A small PCM block emitted by the renderer worklet.

Current default:

- `processorBufferSize = 2048` samples in [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)
- at `16000 Hz`, one full frame is about `128 ms`

Source:

- [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js)

### Batch

A transport unit sent over IPC from renderer to main.

Current default:

- `maxFramesPerBatch = 6` in [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)
- at `16000 Hz` and `2048`-sample frames, one full transport batch is about `768 ms` of audio

### Chunk

An audio window bounded by speech logic, not just transport limits.

Chunk boundaries come from:

- `speech_pause`
- `max_chunk`
- `session_stop`
- `discard_pending`

These reasons are carried as `flushReason`.

### Segment

A finalized text unit emitted by the provider runtime and committed by main.

Source:

- [segment-assembler.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/segment-assembler.ts)
- [streaming-segment-router.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-segment-router.ts)

## End-To-End Flow

## 1. AudioWorklet produces fixed-size PCM frames

Source:

- [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js)

The worklet reads microphone samples from `inputs[0][0]`.

It accumulates samples into `pendingSamples` until it reaches `frameSize`.

When full, it posts:

- `type: 'audio_frame'`
- `samples: Float32Array`
- `timestampMs`

On stop, the renderer sends a `flush` control message. The worklet then:

1. posts one final partial `audio_frame` if samples are buffered
2. posts `flush_complete`

Important property:

- this layer is **not speech aware**
- it only knows about sample counts and stop flush

## 2. Renderer receives frames and feeds both ingress and chunker

Source:

- [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)

Every `audio_frame` is turned into:

- `samples`
- `timestampMs`

Then two subsystems see it:

1. `StreamingAudioIngress.pushFrame(frame)`
2. `StreamingSpeechChunker.observeFrame(frame, sampleRateHz)`

That split is important:

- ingress is about **transport**
- chunker is about **speech boundaries**

## 3. Renderer transport batching

Source:

- [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)
- decision: [2026-03-07-streaming-audio-frame-batching-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-07-streaming-audio-frame-batching-decision.md)

Ingress keeps:

- `pendingFrames`
- `queuedBatches`
- one shared `activeDrain`

Behavior:

- each incoming frame is copied into `pendingFrames`
- once `pendingFrames.length >= maxFramesPerBatch`, ingress enqueues a batch with `flushReason: null`
- a chunker-triggered flush enqueues a batch with a non-null `flushReason`
- `discard_pending` enqueues a control batch with `frames: []`
- `stop()` turns remaining pending audio into a `session_stop` batch

Current defaults:

- `maxFramesPerBatch = 6`
- `maxQueuedBatches = 3`

If queue pressure exceeds the bound, ingress throws instead of silently dropping audio.

Why this exists:

- one IPC call per frame would be too chatty
- batching lowers IPC overhead
- batching is transport-level, not semantic STT segmentation

## 4. Renderer speech chunk detection

Source:

- [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)
- tests: [streaming-speech-chunker.test.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.test.ts)
- decision: [2026-03-08-streaming-chunker-short-blip-reset.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-08-streaming-chunker-short-blip-reset.md)

The chunker is a simple RMS + time policy.

Defaults:

- `speechRmsThreshold = 0.015`
- `trailingSilenceMs = 550`
- `minSpeechMs = 160`
- `maxChunkMs = 12000`

The chunker tracks:

- `chunkStartedAtMs`
- `lastSpeechAtMs`
- `hasSpeech`

For each frame:

1. compute frame RMS
2. decide whether the frame counts as speech
3. update current chunk timing state
4. possibly emit one of three outcomes:

- no action
- `shouldFlush = true`
- `shouldDiscardPending = true`

### `speech_pause`

If the chunk has enough speech and silence lasts at least `trailingSilenceMs`, the chunker flushes with `reason = 'speech_pause'`.

Meaning:

- "the speaker probably finished an utterance"

### `max_chunk`

If total chunk lifetime reaches `maxChunkMs`, the chunker flushes with `reason = 'max_chunk'`.

Meaning:

- "force a chunk boundary even without silence"

This is the continuity safety valve for long uninterrupted speech.

### `discard_pending`

If the chunk was armed by a short blip but total spoken time stays below `minSpeechMs`, the chunker resets and tells ingress to drop buffered audio.

Meaning:

- "this looked like speech briefly, but not enough to keep"

This is the anti-noise / anti-clipped-start guard.

## 5. How renderer chunk decisions affect transport

The live capture loop reacts to chunker observations like this:

- `shouldDiscardPending` -> `ingress.discardPendingChunk()`
- `shouldFlush` -> `ingress.flush(reason)`

So chunking is not performed by the worklet itself.
It is imposed later, in the renderer main-thread capture logic.

That means:

- worklet frame size changes transport cadence
- chunker thresholds change semantic chunk boundaries
- ingress batching changes IPC shape

All three interact.

## 6. Main-process meaning of those batches depends on provider

Source:

- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- [types.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/types.ts)

Main accepts `StreamingAudioFrameBatch` and forwards them into the active provider runtime.

But the provider runtime decides what those boundaries mean.

## 7. Whisper.cpp path: batches are transport, not semantic chunks

Source:

- [whispercpp-streaming-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/whispercpp-streaming-adapter.ts)

For whisper.cpp:

- each accepted batch is serialized to JSONL and sent to the child process
- `discard_pending` is ignored
- other `flushReason` values are effectively ignored at the adapter boundary

This means:

- renderer speech chunk boundaries do **not** directly define final transcript segmentation
- whisper.cpp itself owns the eventual final-segment timing and chunking internally

So if you are debugging "bad chunking" on whisper.cpp, you must ask:

- is the bug actually in renderer pause detection?
- or is it the provider runtime's own segmentation logic?

The answer is often the second one.

## 8. Groq path: chunking is the actual upload model

Source:

- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- [chunk-window-policy.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/chunk-window-policy.ts)
- decision: [2026-03-07-groq-rolling-upload-boundary-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-07-groq-rolling-upload-boundary-decision.md)
- research: [2026-03-07-groq-rolling-upload-dedupe-research.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-07-groq-rolling-upload-dedupe-research.md)

Groq is not using a native realtime stream here.
It uses **rolling uploaded audio chunks**.

Adapter behavior:

- accumulate incoming frames into `currentChunkFrames`
- when `flushReason !== null`, package those frames into one chunk upload
- upload the chunk as a WAV file
- hold completed chunk results until all earlier chunk indices are ready
- emit final text in chunk order

This is real chunking, not just transport batching.

### Overlap behavior

Only `max_chunk` creates carryover overlap.

Policy:

- `continuationOverlapMs = 800`
- overlap only for `max_chunk`
- no overlap for `speech_pause`
- no overlap for `session_stop`
- no overlap for `discard_pending`

Why:

- `speech_pause` is treated as a clean utterance boundary
- `max_chunk` is an artificial split inside continuous speech, so continuity overlap is needed

### Dedupe behavior

If a chunk had overlap:

- prefer timestamp-based dedupe using `verbose_json` segment timings
- fall back to text-prefix trimming if only plain text is available

This is why Groq chunking has more moving pieces than whisper.cpp.

## 9. Final text segmentation is another layer again

Source:

- [segment-assembler.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/segment-assembler.ts)
- [streaming-segment-router.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-segment-router.ts)

Providers emit final segments with:

- `sequence`
- `text`
- `startedAt`
- `endedAt`

Those become canonical app-owned segments, then get committed in order.

This is not audio chunking.
It is output segmentation.

For `stream_transformed`, these finalized text segments also feed:

- `ContextManager`
- rolling summary refresh
- transformation worker pool

So bad audio chunking upstream can ripple into transformation context quality downstream.

## 10. Stop semantics interact with chunking

Relevant docs:

- [2026-03-08-streaming-user-stop-drain-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-08-streaming-user-stop-drain-decision.md)
- [2026-03-08-streaming-renderer-ingress-drain-contract.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-08-streaming-renderer-ingress-drain-contract.md)
- [2026-03-08-streaming-command-contract-and-ack-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-08-streaming-command-contract-and-ack-decision.md)

### `user_stop`

Goal:

- preserve final legitimate tail audio
- let late final text drain safely

Renderer:

- asks the worklet to flush
- pushes remaining audio with `session_stop`
- waits for ingress drain

Main:

- blocks fresh audio ingress once stop begins
- still accepts late final text segments for `user_stop`

### `user_cancel`

Goal:

- destructive stop
- do not preserve tail

Renderer:

- cancels ingress

Main:

- does not drain late final segments

### `fatal_error`

Also destructive.

So if you are debugging "it lost the end of what I said", always ask whether the observed stop path was:

- `user_stop`
- `user_cancel`
- `fatal_error`

Those are intentionally different.

## 11. Why the same user symptom can come from very different causes

Example user complaint:

"It split my sentence badly."

Possible real causes:

- worklet frame cadence too coarse for the observed timing
- `speechRmsThreshold` too sensitive or not sensitive enough
- `trailingSilenceMs` too short
- `minSpeechMs` too high, causing discard of short utterances
- `maxChunkMs` too low, forcing continuation splits
- Groq overlap/dedupe issue after a `max_chunk` boundary
- whisper.cpp provider-side segmentation, not renderer chunking
- stop flush timing loss near `session_stop`

These are not the same bug.

## 12. Practical Debug Strategy

If you still get "the same issue", debug in layers.

## 12.1 First isolate the provider path

Ask:

- is this happening on `local_whispercpp_coreml`?
- or on `groq_whisper_large_v3_turbo`?

If it is whisper.cpp:

- renderer chunk boundaries are not the final text segmentation authority
- provider runtime behavior matters more

If it is Groq:

- chunk boundaries are the upload model
- renderer pause logic matters directly

## 12.2 Log `flushReason` transitions

Add temporary logs around:

- `StreamingSpeechChunker.observeFrame(...)`
- `StreamingAudioIngress.flush(...)`
- `StreamingAudioIngress.discardPendingChunk(...)`
- `GroqRollingUploadAdapter.scheduleChunkUpload(...)`

Useful fields:

- frame `timestampMs`
- frame duration
- computed RMS
- current `spokenMs`
- `trailingSilenceMs`
- chosen `flushReason`
- current chunk frame count

If the flush reason itself is surprising, the bug is probably renderer-side.

## 12.3 Measure actual frame and batch durations

At `16000 Hz`:

- `2048` samples ~= `128 ms`
- `6` frames ~= `768 ms`

If someone expects sub-100 ms response, current defaults are already too coarse for that expectation.

So log:

- `frame.samples.length`
- `batch.frames.length`
- effective audio duration per batch

This often explains "laggy chunking" reports immediately.

## 12.4 Verify whether the problem is pause detection or max-chunk rollover

If boundaries appear during silence:

- inspect `speech_pause`

If boundaries happen mid-sentence:

- inspect `max_chunk`

If short utterances vanish:

- inspect `minSpeechMs`
- inspect `discard_pending`

That triage tells you which threshold family is actually involved.

## 12.5 For Groq, inspect overlap and dedupe explicitly

Log per upload:

- `chunkIndex`
- `flushReason`
- `chunkStartMs`
- `chunkEndMs`
- whether carryover existed
- overlap frame timestamps

If duplicate text only appears after long continuous speech, the likely culprit is:

- `max_chunk` split
- overlap carryover
- dedupe logic

Not plain pause chunking.

## 12.6 Compare audio chunk boundaries to committed text segments

The right debug view is a timeline table:

- frame timestamp
- flush reason
- provider chunk index
- provider final segment start/end
- committed output text

Without this, it is too easy to blame the wrong layer.

## 12.7 Use the existing tests as probes

Good places to start:

- [streaming-speech-chunker.test.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.test.ts)
- [streaming-live-capture.test.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.test.ts)
- [groq-rolling-upload-adapter.test.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.test.ts)
- [chunk-window-policy.test.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/chunk-window-policy.test.ts)

If the issue is reproducible, write the reproduction first as:

- a chunker unit test
- then an ingress/live-capture test
- then a provider-adapter test

in that order.

## 12.8 Reproduce with controlled input, not live speech first

Use deterministic audio:

- short blip
- long silence
- uninterrupted speech-length tone
- tone-silence-tone pattern

This is much better than trying to debug from microphone variability first.

The repo already has streaming and mic fixture assets in `e2e/fixtures/` and `src/main/test-support/`.

## 13. Is the chunk approach actually the right approach?

Short answer:

- **For Groq rolling-upload: yes, mostly**
- **For whisper.cpp native stream: only partially**
- **For true realtime partial-token UX: not by itself**

## 13.1 Where chunking is the right approach

Chunking is the right approach when the provider surface is fundamentally file-based or pause-bounded.

That is exactly the Groq rolling-upload case.

Why it is right there:

- the upstream API is upload-oriented, not session-stream oriented
- pause chunks are honest to the provider contract
- max-chunk overlap gives continuity during long speech
- ordered emission + dedupe solves the biggest chunking failure modes

For that provider, chunking is not a workaround. It is the architecture.

## 13.2 Where chunking is only transport help

For whisper.cpp native stream:

- transport batching is useful
- short-blip discard is useful
- but speech chunk boundaries are not the main segmentation authority

So if the product goal is "continuous local streaming dictation with provider-native segmentation", the current chunker is not the whole answer.

## 13.3 Where chunking is the wrong mental model

If the product goal is:

- low-latency partial text updates
- token-level or near-token-level continuity
- minimal sentence-boundary lag
- provider-native streaming semantics

then pause-bounded chunking alone is not enough.

You need a true session-oriented streaming model where:

- audio flows continuously
- provider runtime owns segmentation or partial hypotheses
- chunking becomes secondary or provider-specific

This repo already implicitly acknowledges that split:

- `native_stream` for whisper.cpp
- `rolling_upload` for Groq

That is the right abstraction boundary.

## 13.4 My conclusion

The current architecture is directionally correct **if you keep the two modes conceptually separate**:

1. **Transport batching** is always reasonable.
2. **Pause-bounded chunking** is right for rolling-upload providers.
3. **Provider-native streaming** should not be forced into the same mental model.

So the answer is not "chunking is wrong".
The answer is:

- chunking is right for some transports
- chunking is only part of the story for native streams
- debugging must identify which layer is actually misbehaving

## 14. Most Likely Places To Look If The User Still Sees The Same Issue

In priority order:

1. [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)
   - wrong silence / min-speech / max-chunk threshold behavior
2. [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)
   - wrong interaction between frame arrival, chunker observation, and ingress flush/discard
3. [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
   - overlap or dedupe error after `max_chunk`
4. [whispercpp-streaming-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/whispercpp-streaming-adapter.ts)
   - provider-side segmentation expectations mismatch
5. stop-path timing around `session_stop`
   - especially if the complaint is "the very end gets lost"

## 15. Recommended Next Debug Session

Before implementing anything, the cleanest next debug pass would be:

1. Reproduce on one provider only.
2. Add temporary logs for:
   - frame timestamp
   - RMS
   - `spokenMs`
   - `trailingSilenceMs`
   - `flushReason`
   - batch frame count
   - Groq chunk index / overlap
3. Capture one failing trace.
4. Build a timeline:
   - input audio
   - renderer chunk decisions
   - provider chunk uploads or stream pushes
   - final committed segments
5. Only then decide whether the fix belongs in:
   - threshold tuning
   - transport batching
   - Groq overlap/dedupe
   - stop flush behavior
   - provider-native segmentation expectations

## Bottom Line

Chunking in this repo is not one mechanism.

It is a stack:

- fixed worklet frames
- IPC transport batches
- renderer speech chunk boundaries
- provider-specific audio chunk semantics
- final text segment commits

If you debug "chunking" as one thing, you will usually fix the wrong layer.

For Groq, chunking is the real delivery model.
For whisper.cpp, chunking is mostly scaffolding around a truer streaming runtime.
