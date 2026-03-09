<!--
Where: docs/research/2026-03-09-issue-440-deep-debug-hypotheses.md
What: Deep follow-up research note for issue 440, focused on remaining chunking-related failure modes and debugging strategy.
Why: The first issue-440 fix hardened session ownership and stop semantics, but the user still reproduces the symptom. This document separates likely remaining defects from architecture-driven behavior.
-->

# Issue 440 Deep Debug Hypotheses

## Scope

This note is a follow-up to:

- [2026-03-09-how-streaming-chunking-works-research.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-how-streaming-chunking-works-research.md)
- [issue-440-streaming-capture-bug-audit.md](/workspace/.worktrees/fix/issue-440/docs/research/issue-440-streaming-capture-bug-audit.md)

The first document explains the chunking pipeline.
The second documents bugs that were already fixed.

This document answers a narrower question:

> If the user still sees issue 440 after the stop/session fix, what are the most plausible remaining causes?

## Executive conclusion

The most important remaining fact is this:

1. The renderer always captures continuously.
2. The renderer always sends IPC batches continuously.
3. But the Groq adapter does **not** upload continuously.
4. It uploads only when a batch arrives with a non-null `flushReason`.

That means the Groq path is still fundamentally **pause-bounded chunk upload**, not true continuous upstream streaming.

So if the user-visible symptom is one of these:

- "it only transcribes after I pause"
- "it still waits too long before text appears"
- "the last word before a pause is sometimes clipped"
- "the end of the utterance still disappears or arrives late"

then the remaining problem may be:

- a real chunk-boundary bug, or
- the current architecture behaving as designed but not matching the expected UX

Both are plausible.

## What the code is actually doing now

### 1. Worklet framing

File:

- [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js)

The worklet emits fixed-size PCM frames.

Default frame size:

- `2048` samples

At `16000 Hz`, one frame is about:

- `2048 / 16000 = 0.128 s`
- about `128 ms`

This matters because all chunk observations are quantized by that frame size.
The system cannot react at sub-frame precision.

### 2. Renderer transport batching

File:

- [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)

Default ingress limits:

- `maxFramesPerBatch = 6`
- `maxQueuedBatches = 3`

At `128 ms` per frame, a full auto batch is about:

- `6 * 128 ms = 768 ms`

For whisper.cpp, those batches go straight to the runtime.
For Groq, those batches do **not** automatically trigger upload.

### 3. Speech chunking

File:

- [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)

Defaults:

- `speechRmsThreshold = 0.015`
- `trailingSilenceMs = 550`
- `minSpeechMs = 160`
- `maxChunkMs = 12000`

The chunker emits only these semantic decisions:

- `speech_pause`
- `max_chunk`
- `discard_pending`

`session_stop` comes from ingress stop, not from the chunker.

### 4. Live capture wiring

File:

- [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)

Each worklet frame is sent to two places:

- ingress, for transport batching
- chunker, for semantic boundary decisions

When chunker says flush, `streaming-live-capture.ts` calls:

- `ingress.flush('speech_pause')`, or
- `ingress.flush('max_chunk')`

When chunker says discard, `streaming-live-capture.ts` calls:

- `ingress.discardPendingChunk()`

### 5. Provider meaning diverges here

Files:

- [whispercpp-streaming-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/whispercpp-streaming-adapter.ts)
- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)

#### whisper.cpp path

Whisper.cpp receives every non-discard batch immediately.

Meaning:

- transport batching matters
- semantic chunking matters much less
- final transcription boundaries are mostly decided by the provider runtime

#### Groq path

Groq accumulates `currentChunkFrames` on every incoming batch.
It schedules a network upload **only when** `batch.flushReason !== null`.

Meaning:

- plain auto batches with `flushReason = null` do not create near-realtime server work
- `speech_pause` and `session_stop` are actual upload boundaries
- `max_chunk` is a forced upload boundary for long uninterrupted speech

This is the single most important architectural fact behind issue 440.

## Most plausible remaining causes

## Hypothesis 1: The user is observing architecture, not a regression

If the provider is Groq, the app is not true streaming.
It is chunked rolling upload.

That means the earliest upload usually happens at one of these points:

- enough trailing silence to trigger `speech_pause`
- `maxChunkMs` during uninterrupted speech
- explicit stop

So if the complaint is "I still do not get continuous live transcription while speaking", that is consistent with the current design.

This is not fixed by the earlier session/stop patch, because that patch made stop and session ownership safer. It did not convert Groq into a true streaming transport.

## Hypothesis 2: `speech_pause` is too coarse because the worklet frame is large

The chunker sees one RMS value per frame.
With `2048` samples at `16 kHz`, boundary decisions happen in about `128 ms` chunks.

That creates several effects:

- speech start can be detected late by up to almost one frame
- trailing silence can be recognized late by up to almost one frame
- short soft consonants near a boundary can be swallowed into silence
- stop-time flush can feel late even when it is technically correct

A `550 ms` trailing silence threshold plus `128 ms` frame granularity means actual flush timing can effectively be closer to:

- about `550-678 ms`, depending on frame alignment

That is before IPC scheduling, upload, inference, and output commit.

## Hypothesis 3: `discard_pending` can still hide quiet starts or short phrases

Files:

- [streaming-speech-chunker.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-speech-chunker.ts)
- [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)

If speech energy stays below threshold, or total speech duration stays below `minSpeechMs`, the renderer can send:

- `discard_pending`

That causes:

- pending ingress audio to be cleared
- Groq `currentChunkFrames` to be cleared
- Groq `carryoverFrames` to be cleared
- whisper.cpp to ignore the control batch

If the user symptom is "quiet first syllables disappear" or "short utterances vanish", this is a prime suspect.

## Hypothesis 4: Groq boundary overlap is missing on pause boundaries

File:

- [chunk-window-policy.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/chunk-window-policy.ts)

Current rule:

- overlap only for `max_chunk`
- overlap is `0` for `speech_pause`
- overlap is `0` for `session_stop`

That policy is coherent if pause boundaries are truly clean.
But in reality, pause detection is based on frame RMS and a silence timer, not on linguistic boundaries.

So the last phoneme or word near a pause can straddle the boundary.

If the user symptom is:

- "the last word before a pause gets clipped"
- "the first word after a pause is repeated or missing"

then the current no-overlap-on-`speech_pause` rule is a strong suspect.

This is especially plausible because the boundary detector is intentionally coarse and acoustic, not transcript-aware.

## Hypothesis 5: The remaining issue is downstream from chunking

Files:

- [segment-assembler.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/segment-assembler.ts)
- [streaming-segment-router.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-segment-router.ts)

The user may describe the symptom as chunking, but the actual failure may be later:

- provider final segments may be correct
- router ordering may delay visible emission
- transformation fallback may alter output
- dedupe may trim too aggressively

This matters most on the Groq path, where overlap and dedupe intentionally manipulate output around chunk boundaries.

## Hypothesis 6: Stop is now safer, but still not equivalent to "flush everything instantly"

The prior fix made explicit stop surface errors instead of silently succeeding.
That removed one major blind spot.

But even with that fix:

- worklet flush happens first
- ingress drain happens second
- provider stop drain happens third

On Groq, `user_stop` still has a budgeted drain.
If uploads are slow, stop can still behave like "best effort within the budget" rather than "guaranteed final result no matter how long it takes."

If the symptom appears specifically at the end of dictation, stop-path instrumentation is still required.

## Likely root-cause ranking

If the provider is `groq`:

1. The current architecture is still pause-bounded, so "still not really streaming" is expected.
2. `speech_pause` boundary timing is too coarse because of `2048`-sample frames.
3. No overlap on `speech_pause` can clip or gap words near pause boundaries.
4. `discard_pending` can drop quiet starts and short utterances.
5. Stop drain timing can still make the tail feel unreliable under slow network conditions.

If the provider is `local_whispercpp_coreml`:

1. Chunking is probably not the main culprit.
2. The most likely issue is capture cadence, worklet frame size, or child-process runtime behavior.
3. `discard_pending` still matters for quiet starts or short utterances.
4. Stop-path timing remains worth checking, but provider segmentation owns more of the result here.

## Easiest ways to debug locally

These are the cheapest checks that do not require architecture changes.

## 1. First isolate the provider

Do not debug Groq and whisper.cpp together.

Run the same utterance on:

- `local_whispercpp_coreml`
- `groq`

If only Groq reproduces, the issue is probably not renderer capture alone.
It is likely pause-bounded upload semantics, overlap, or dedupe.

If both reproduce the same way, the issue is more likely in:

- worklet frame sizing
- chunker thresholds
- ingress stop/drain timing

## 2. Use one deterministic utterance pattern

Use the same spoken script every time, for example:

1. "alpha bravo charlie"
2. pause for about `700 ms`
3. "delta echo"
4. stop immediately after `echo`

This single script exercises:

- `speech_pause`
- post-pause restart
- final stop flush

If you test random speech, boundary failures are much harder to localize.

## 3. Correlate one timeline, not just one transcript

For the same utterance, capture these moments:

1. first frame arrives
2. first frame above RMS threshold
3. `speech_pause` or `max_chunk` decision
4. ingress batch sent
5. provider upload begins
6. provider result arrives
7. final segment is emitted to UI

Without one joined timeline, chunking bugs and routing bugs look identical.

## 4. Distinguish these failure shapes

Ask which of these you see:

- text appears only after pauses
- tail words disappear on stop
- quiet beginnings disappear
- repeated words appear near boundaries
- long uninterrupted speech stalls until `max_chunk`

Each one points to a different layer.

## 5. Measure actual frame and batch durations

Do not assume the actual input sample rate equals the requested sample rate.

Check:

- actual `audioContext.sampleRate`
- actual `frame.samples.length`
- time delta between consecutive worklet frames
- time delta between ingress batches

If the browser is running at a different real sample rate than expected, timing assumptions can drift.

## If you want temporary logging code, these are the best probe points

If local debugging without code changes is not enough, these are the highest-value temporary logs to add.

## Probe A: Renderer frame/chunker log

File:

- [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)

Log for each frame:

- `sessionId`
- `timestampMs`
- `samples.length`
- computed RMS
- chunker decision
- whether `discardPendingChunk()` was called
- whether `flush()` was called and with what reason

This tells us whether the bug starts before IPC.

## Probe B: Ingress queue log

File:

- [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)

Log:

- pending frame count before enqueue
- queued batch count
- flush reason
- frame timestamps in the batch
- total samples per batch

This proves whether frames were captured but never drained.

## Probe C: Worklet stop log

File:

- [streaming-audio-capture-worklet.js](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-capture-worklet.js)

Log:

- when `flush` message is received
- pending sample count at that moment
- timestamp of the final partial frame
- when `flush_complete` is posted

This isolates the stop-tail path.

## Probe D: Groq upload boundary log

File:

- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)

Log per upload:

- `chunkIndex`
- `flushReason`
- live frame count
- carryover frame count
- chunk start/end ms
- overlap ms
- request start/end time
- emitted segments after dedupe

This is the most important probe if the issue happens only on Groq.

## Probe E: Final segment routing log

Files:

- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- [streaming-segment-router.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-segment-router.ts)

Log:

- accepted final segment sequence
- canonicalized text
- commit order
- transform fallback versus transformed output

This tells us whether the transcript was correct before routing changed it.

## Is chunking really the right approach?

## For Groq

Mostly yes, because the provider surface is chunk-upload oriented rather than true session streaming.

But one clarification matters:

- chunking is the correct **transport architecture**
- it is not enough by itself to deliver a true token-by-token live streaming UX

So if the product expectation is "continuous live text while the user is still speaking", then this approach is only an approximation.

## For whisper.cpp

Only partly.

For whisper.cpp, transport batching is sensible.
But pause-bounded chunking is not the core model.
The provider runtime is already closer to native streaming, so renderer chunk boundaries should not be treated as the semantic source of truth.

## Bottom line

The chunk approach is the right way to go when:

- the provider only supports chunk/file transcription
- you are willing to trade exact realtime behavior for simpler bounded uploads

The chunk approach is not the full answer when:

- the expected UX is continuous live text with minimal latency
- boundary clipping near pauses is unacceptable
- the provider already has a truer streaming model

## Recommended next debugging step

Before changing architecture, add temporary logs only at these three places:

1. [streaming-live-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-live-capture.ts)
2. [streaming-audio-ingress.ts](/workspace/.worktrees/fix/issue-440/src/renderer/streaming-audio-ingress.ts)
3. [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)

That is the smallest useful logging set.

If the timeline shows:

- frames captured correctly
- chunker flushes correctly
- Groq uploads only on pause/stop

then the remaining "issue 440" is probably architecture or tuning, not another hidden stop-session bug.
