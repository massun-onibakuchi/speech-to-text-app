<!--
Where: docs/research/2026-03-11-groq-live-mic-vad-root-cause-report.md
What: Detailed bug report for the Groq live-mic browser-VAD streaming failure.
Why: Capture the observed evidence, architecture, likely root cause, and the
     recommended redesign direction after repeated failed incremental fixes.
-->

# Groq Live-Mic Browser VAD Bug: Root Cause Report and Fix Direction

## Status

- Issue scope: Groq raw dictation streaming with browser `MicVAD` capture
- User symptom: after one or more speech pauses, later utterances are sometimes not transcribed
- Current confidence: high on the failing subsystem, moderate on the exact low-level trigger
- Main conclusion: the primary failing subsystem is renderer-side live browser-VAD continuation between utterances, not Groq transcription, main-process commit, or renderer activity rendering

## Executive Summary

The repeated failure pattern is now well bounded.

For utterances that become `streaming.groq_vad.utterance_ready`, the rest of the
pipeline works:

- main process receives the utterance
- Groq upload begins
- Groq upload completes
- the completed utterance is drained
- a final segment is emitted
- ordered segment commit runs
- output is applied
- the segment is broadcast to the renderer
- the renderer receives and applies it to activity state

The missing transcription cases happen earlier. In the failing runs, the missing
utterance often never becomes `streaming.groq_vad.utterance_ready`. In some
runs, the missing utterance never even gets a later
`streaming.groq_vad.speech_start`.

That means the app is not primarily losing utterances inside Groq, IPC, output,
or UI. The app is primarily losing later utterances inside the live browser-VAD
capture path before they become utterance jobs.

The current Groq renderer integration is significantly more complex than the
reference implementation in `epicenter-main.zip`. The reference app trusts
`MicVAD` much more directly. Our current path adds a second renderer-local
capture state machine on top of `MicVAD`, including:

- custom frame buffering
- custom speech confirmation tracking
- custom continuation splitting
- custom stop flushing
- custom backpressure coordination

That complexity creates a larger failure surface than the reference
implementation and is the leading architectural explanation for why we keep
fixing downstream code without eliminating the user-visible live-mic loss.

## User-Visible Symptom

Typical user report:

- the first sentence is transcribed
- after a speech pause, later sentences are sometimes not transcribed
- the session still appears active
- activity may show some streaming events, but no new transcript text appears

Example reported utterance sequence:

- "Hello everyone."
- "This is a test."
- "Hello."

Observed failure:

- utterance 0 may transcribe
- utterance 1 may transcribe
- utterance 2 may never appear at all

The final short utterance is only one example. The user also reproduced the
failure with longer later utterances, so this is not only a short-utterance
threshold bug.

## Architecture Overview

### Current App: Groq Live-Mic Path

The current live-mic Groq path is roughly:

1. Renderer starts `MicVAD` in [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts)
2. Renderer listens to:
   - `onFrameProcessed`
   - `onSpeechStart`
   - `onSpeechRealStart`
   - `onVADMisfire`
   - `onSpeechEnd`
3. Renderer intentionally disables `submitUserSpeechOnPause` and owns explicit
   stop flushing itself instead of relying on the library pause contract
4. Renderer also keeps its own capture state:
   - `speechDetected`
   - `speechRealStarted`
   - `confirmedSpeechSamples`
   - `preSpeechFrames`
   - `liveFrames`
   - `liveSamples`
5. Renderer decides when to emit utterance chunks:
   - `speech_pause`
   - `max_chunk`
   - `session_stop`
6. Renderer encodes WAV and sends utterance chunks through IPC
7. Main session controller accepts the utterance
8. Groq rolling upload adapter uploads and normalizes the response
9. Main emits a committed streaming segment
10. Segment router applies output and publishes the segment
11. Renderer receives and applies the committed segment to activity/UI state

Relevant files:

- [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts)
- [groq-browser-vad-config.ts](/workspace/src/renderer/groq-browser-vad-config.ts)
- [streaming-session-controller.ts](/workspace/src/main/services/streaming/streaming-session-controller.ts)
- [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- [streaming-segment-router.ts](/workspace/src/main/services/streaming/streaming-segment-router.ts)
- [renderer-app.tsx](/workspace/src/renderer/renderer-app.tsx)

### Reference App: Whispering in `epicenter-main.zip`

The reference implementation is materially simpler.

In `epicenter-main/apps/whispering/src/lib/state/vad-recorder.svelte.ts`:

- `MicVAD.new({...})` is created with `submitUserSpeechOnPause: true`
- `onSpeechEnd(audio)` is treated as the canonical utterance payload
- callback audio is encoded to WAV immediately
- the sealed blob is handed to the next layer
- there is no second renderer-local speech-window state machine
- stop is `destroy()` plus stream cleanup

In `epicenter-main/apps/whispering/src/lib/query/isomorphic/actions.ts`:

- each VAD utterance is sent directly into the normal transcription pipeline
- capture continues listening while downstream transcription/delivery proceed

In `epicenter-main/apps/whispering/src/lib/query/isomorphic/transcription.ts`:

- `transcribeBlob(blob)` is the independent unit of work
- provider selection happens downstream, not inside the VAD state machine

### Key Architectural Difference

Whispering keeps the useful part of parallelism:

- one long listening session
- many independent utterance jobs
- downstream overlap between capture and transcription

But it avoids a second capture state machine before the utterance boundary is
sealed.

Our app currently overlaps work in two places:

- downstream utterance jobs
- renderer-side capture/window management

The first is useful and should remain. The second is where complexity and risk
have grown too large.

## What Upstream `MicVAD` Documents

The official docs describe a narrower contract than the one our current code is
trying to stretch.

Important documented behavior:

- `onSpeechEnd(audio)` is the primary utterance callback
- `submitUserSpeechOnPause: true` makes `pause()` emit `onSpeechEnd` or
  `onVADMisfire`
- `minSpeechMs` gates whether speech becomes a valid utterance
- `processorType: "auto"` may use `ScriptProcessorNode`, which the docs describe
  as less reliable than `AudioWorklet`

Documented defaults:

- `positiveSpeechThreshold: 0.3`
- `negativeSpeechThreshold: 0.25`
- `redemptionMs: 1400`
- `preSpeechPadMs: 800`
- `minSpeechMs: 400`

Our current config in [groq-browser-vad-config.ts](/workspace/src/renderer/groq-browser-vad-config.ts):

- `positiveSpeechThreshold: 0.3`
- `negativeSpeechThreshold: 0.25`
- `redemptionMs: 900`
- `preSpeechPadMs: 400`
- `minSpeechMs: 160`

This means our Groq path is operating outside the library defaults for pause
handling and speech qualification, while also layering additional custom
behavior around the callbacks.

## Relevant Upstream Issue Signals

There is not one exact upstream issue that proves the precise local failure, but
the issue tracker does show that `MicVAD` lifecycle behavior can be fragile in
real-world integrations.

Relevant issues:

- Issue #71: start/stop microphone lifecycle concerns
- Issue #144: field concerns around `onFrameProcessed`
- Issue #194: manual stop / preserving partial speech is not a simple built-in path
- Issue #234: later versions showed start/processing regressions until remount
- Issue #240: start/pause and continued operation can be inconsistent in apps

None of these issues reproduces the exact local symptom directly. They are
supporting context only. They do support the broader conclusion that
continuous-session lifecycle behavior is a real risk area for `MicVAD`,
especially when an app builds more custom control logic around it.

## What We Instrumented

To stop guessing, the app was instrumented end-to-end with bounded structured
logs.

The renderer logs VAD lifecycle events such as
`streaming.groq_vad.start_begin`, `streaming.groq_vad.speech_start`,
`streaming.groq_vad.utterance_ready`, and stop events. The main process logs
Groq upload milestones such as `streaming.groq_upload.begin`,
`streaming.groq_upload.completed`, `streaming.groq_upload.emit_begin`,
`streaming.groq_upload.final_segment`, and failure cases. Router and delivery
are covered by `streaming.segment_router.*` and `streaming.ipc.segment_broadcast`.
Renderer receipt is covered by `streaming.renderer.segment_received`,
`streaming.renderer.segment_deduped`, and `streaming.renderer.segment_applied`.

## Observed Evidence

### Evidence Class 1: Successful Utterances Prove the Downstream Path Can Work

For successful utterances, the logs showed the full chain from
`streaming.groq_vad.utterance_ready` through Groq upload, final segment
creation, ordered commit, IPC broadcast, renderer receipt, and renderer apply.

This is strong evidence that these downstream layers can work once an utterance
exists:

- Groq upload is not the main failure for utterances that reach it
- segment routing/output is not the main failure for utterances that reach it
- renderer activity rendering is not the main failure for utterances that reach it

### Evidence Class 2: Missing Utterances Often Never Reach `utterance_ready` in Live-Mic Repros

The key failing runs showed:

- no later `streaming.groq_vad.utterance_ready` for the missing utterance
- in some runs, no later `streaming.groq_vad.speech_start` either

This is the most important evidence in the whole investigation.

It means the missing utterance is often lost before IPC, before Groq, before the
main session controller, and before the renderer activity UI.

### Evidence Class 3: The Failure Is Intermittent

The user reproduced runs where the second utterance transcribed, runs where it
did not, and runs where utterances 0 and 1 transcribed but utterance 2 did not.
This is consistent with a lifecycle or detection fragility, not a deterministic
business-rule rejection.

### Evidence Class 4: Downstream Fixes Helped Real Bugs but Not the Main Live-Mic Failure

Several real downstream bugs were found and fixed during the investigation,
including upload timeout handling, retry behavior after timeout,
empty-transcript observability, stop/cancel callback invalidation, and the
transcript-first output failure contract. Those were valid fixes, but they did
not remove the core live-mic symptom because the most common missing case is
earlier than all of them.

## Root Cause Assessment

### Root Cause We Can State with High Confidence

The main failing subsystem is:

- renderer-side live `MicVAD` continuation across multiple utterances

More specifically:

- after a prior utterance completes, later speech is sometimes not reopened or
  not sealed as a new utterance in the live browser-VAD path

### Root Cause We Cannot Yet State with Full Confidence

We do not yet have conclusive proof of the precise lowest-level trigger inside
the VAD/browser stack. It may be one or more of:

- `MicVAD` not reliably re-entering a later speech window on the live mic path
- callback timing/lifecycle fragility after prior pause/end handling
- `ScriptProcessorNode` or browser/device-specific instability
- our additional renderer capture state machine interacting badly with the
  library callback flow
- our more aggressive config values reducing the safety margin for live-mic
  continuation

### Most Credible Root Cause Statement

The most defensible current root-cause statement is:

> The live browser-VAD capture path is failing to continue reliably across
> multiple utterances. The leading architectural explanation is that the path is
> over-coupled: it depends on `MicVAD` callbacks while also maintaining a
> second renderer-local speech-window state machine. In intermittent live-mic
> sessions, later utterances are sometimes never reopened or never sealed, so
> they disappear before they become utterance jobs.

This is stronger than a mere hypothesis, because it is directly supported by the
log evidence. It is weaker than a full low-level proof, because we do not yet
know whether the initiating trigger is upstream callback behavior, browser audio
processing behavior, or the interaction between the two.

## Why the Current Design Is Fragile

### 1. Two Boundary Owners

The app currently has two different notions of utterance state:
`MicVAD` callback lifecycle and renderer-local frame/speech-window bookkeeping.
When those drift, the app can produce duplicate flush concerns, missed reopen
concerns, stale state after stop/cancel, and carryover ambiguity.

### 2. Custom Stop Semantics

The app intentionally sets `submitUserSpeechOnPause: false` and owns stop-flush
itself. That is understandable, because it avoids duplicate `onSpeechEnd`
callbacks during explicit stop. But it also means the app has moved away from
the library’s natural pause/stop contract and must now maintain more custom
teardown correctness itself.

### 3. More Aggressive Tuning than Library Defaults

Our current config shortens `redemptionMs`, `preSpeechPadMs`, and
`minSpeechMs`. That may help latency, but it also narrows margins for live-mic
variability.

### 4. Capture Logic Does Too Much

The renderer capture path currently handles speech detection state, frame
buffering, speech qualification, continuation splitting, stop flushing,
backpressure signaling, and transport timing. This is too much responsibility
for the part of the system that is already closest to browser audio timing
fragility.

## Comparison: Parallel Utterance Jobs vs Parallel Capture State

It is important to separate two different ideas.

### Good Parallelism: Independent Utterance Jobs

This is desirable: utterance A uploads while capture continues, utterance B
does not wait for A to finish transcribing, and output/history happen
downstream. Whispering already has this shape. It is not a “single giant job
until stop” design.

### Risky Parallelism: Extra Renderer Capture State Machine

This is the problematic part: custom speech-window ownership before the
utterance is sealed, custom continuation/carryover semantics, custom
stop-flush semantics, and custom frame-level fallback logic. That is the
parallelism we should reduce.

## What We Need to Change

### Design Goal

Keep the good parallelism of many independent utterance jobs downstream.
Reduce the risky capture complexity by simplifying the renderer so `MicVAD`
owns utterance boundaries again.

### Recommended Fix Direction

#### 1. Make `onSpeechEnd(audio)` the Canonical Utterance Payload

For the normal speech-pause path, trust `MicVAD` callback audio, encode that
audio directly, and send it downstream as one utterance job. Do not re-derive
the utterance from our own live-frame accumulation for the normal case.

#### 2. Separate Normal Capture from Explicit Stop Behavior

Use two paths: a normal path for library-sealed pause-bounded utterances and a
stop path for one explicit best-effort flush if the user stops during active
speech. Do not let the stop workaround define the whole continuous capture
architecture.

#### 3. Define `max_chunk` as a Downstream Policy, Not a Capture Boundary Owner

If long uninterrupted speech still requires splitting, keep `speech_pause`
utterances owned by `MicVAD` and treat long-utterance splitting as a separate
policy layer after a sealed utterance exists, or as a clearly isolated
extension. If that is not required for the first stabilization pass, remove
`max_chunk` from the live-mic path temporarily and restore it only after the
normal multi-utterance path is stable.

#### 4. Reduce Renderer Capture Ownership

Renderer should be responsible for starting `MicVAD`, receiving sealed
utterances, WAV encoding, IPC handoff, and bounded debug logs. Renderer should
not also be the main speech-window state machine unless we decide to fully
replace `MicVAD`.

#### 5. Keep Main-Process Utterance Processing Independent

One utterance should remain one unit of work: one upload, one transcription
normalization, one committed segment, then output/paste/history afterward. This
part of the architecture already proved viable once the utterance exists.

#### 6. If Simplification Still Fails, Choose One Owner Fully

If live mic still fails after simplification, the next step should not be more
hybrid logic. It should be a clean choice: either fully trust `MicVAD` or
fully own speech-window detection from raw frames/audio ourselves. The current
hybrid is the worst of both worlds.

## Proposed Target Architecture

### Renderer

- create/start `MicVAD`
- trust `onSpeechStart`, `onSpeechEnd`, `onVADMisfire` as the primary contract
- encode callback audio to WAV
- send utterance chunks immediately
- keep only a narrow stop-flush escape hatch
- keep bounded trace logs

### Main Process

- accept utterance jobs
- upload each utterance to Groq independently
- normalize response to committed text
- publish committed transcript immediately
- run output/paste/history as downstream best-effort work

### UI

- render committed transcript events
- do not depend on output success to show transcript

This is close to the reference implementation’s design, while still preserving
the app’s transcript-first downstream behavior.

## Scope of Change

### Code That Should Be Simplified

Primary candidate:

- [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts)

Supporting config review:

- [groq-browser-vad-config.ts](/workspace/src/renderer/groq-browser-vad-config.ts)

### Code That Should Mostly Stay

These layers already proved useful once the utterance exists:

- [streaming-session-controller.ts](/workspace/src/main/services/streaming/streaming-session-controller.ts)
- [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- [streaming-segment-router.ts](/workspace/src/main/services/streaming/streaming-segment-router.ts)

### Tests That Must Exist

At minimum:

- live-mic style multi-utterance regression coverage
- deterministic browser-VAD pause-bounded fixture coverage
- stop-during-active-speech flush coverage
- no-duplicate-stop-flush coverage
- transcript-first output failure coverage

## Recommended Execution Sequence

1. Freeze the debugging findings in docs
2. Simplify the renderer capture contract around `onSpeechEnd(audio)`
3. Keep explicit stop-flush as a narrow special case only
4. Re-run deterministic multi-utterance VAD fixture tests
5. Re-run live-provider and fake-audio E2E
6. Only if the bug remains, decide whether to:
   - restore closer-to-default `MicVAD` config values
   - or replace `MicVAD` window ownership entirely

## Risks and Trade-offs

### Benefits of the Simplification

- smaller state surface
- easier reasoning
- closer to the upstream library contract
- closer to the known-good reference app
- fewer places for utterances to disappear before becoming jobs

### Costs

- less custom control in renderer capture
- explicit stop behavior still needs a careful edge-case path
- very long uninterrupted speech may need a separate policy if `max_chunk`
  behavior remains necessary

### Why This Trade Is Worth It

The team has already spent many iterations patching the current hybrid design.
At this point, preserving that complexity is more expensive than backing away
from it.

## Final Conclusion

The investigation no longer supports the idea that the main problem is Groq
upload, main-process routing, or renderer display.

The main problem is earlier:

- live browser-VAD continuation between utterances is unreliable in the current
  Groq renderer capture design

The most credible architectural explanation is:

- the renderer is half-trusting `MicVAD` and half-owning utterance state itself

The fix direction should therefore be architectural too:

- keep parallel utterance jobs downstream
- reduce renderer capture to a thin callback-trusting utterance producer
- keep stop flushing as a narrow exception, not the foundation of the capture
  model

That is the clearest path to a stable live-mic Groq dictation flow.
