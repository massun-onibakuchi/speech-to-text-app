<!--
Where: docs/research/2026-03-07-epicenter-whispering-vad-chunked-parallel-stt-architecture-research.md
What: Detailed architecture research on Epicenter Whispering's voice-activation mode and its pause-bounded chunked parallel STT pipeline.
Why: Ground our upcoming streaming STT design in a real reference implementation while separating pause-chunked VAD behavior from true frame-level streaming.
-->

# Research: Epicenter Whispering VAD Chunked Parallel STT Architecture

Research date: **March 7, 2026**

## 1. Scope

This document studies the `apps/whispering` architecture from the historical `resources/references/epicenter-main.zip` reference archive, with emphasis on the voice-activation mode.

Primary question:
- how voice activation automatically chunks audio on speaker pauses and runs STT work in parallel

Secondary questions:
- which layer owns chunk detection
- which layer owns transcription dispatch
- how delivery and optional transformation fit into the same flow
- what parts are useful references for this repo
- what parts must not be confused with true streaming STT

This is research only. It does not propose implementation patches for the current repo.

## 2. Executive Summary

Epicenter Whispering's voice-activation mode is **not** a true realtime streaming STT system.

It is a **pause-bounded chunking architecture**:
- one long-lived VAD listening session stays open
- speech start is detected by `@ricky0123/vad-web`
- when the speaker pauses, the VAD library emits one finished speech buffer
- that buffer is encoded into a WAV `Blob`
- the blob is pushed through the same blob-based transcription pipeline used by manual recording and file upload

The important architectural consequence is:
- the user experiences one voice-activated session
- the runtime actually processes **many independent blob jobs**

Parallelism exists, but not at the transport level:
- each chunk is transcribed as its own blob request
- blob save and transcription start in parallel per chunk
- later chunks can be detected while earlier chunks are still transcribing or transforming

This reference is valuable for:
- a future pause-chunked voice-activation mode
- non-blocking chunk processing
- clean separation of hardware/VAD state from query/mutation orchestration

This reference is **not** a substitute for:
- a renderer-to-main frame transport
- a true session-oriented streaming control plane
- provider-native realtime STT adapters
- canonical finalized segment ordering across one continuous streaming session

## 3. Sources Reviewed

Archive provenance:
- historical repo path: `resources/references/epicenter-main.zip`
- archive-introducing commit discovered in history: `64af14b`
- app studied inside archive: `apps/whispering`

Files reviewed in detail:
- `apps/whispering/ARCHITECTURE.md`
- `apps/whispering/README.md`
- `apps/whispering/src/lib/state/vad-recorder.svelte.ts`
- `apps/whispering/src/lib/state/settings.svelte.ts`
- `apps/whispering/src/lib/query/isomorphic/actions.ts`
- `apps/whispering/src/lib/query/isomorphic/transcription.ts`
- `apps/whispering/src/lib/query/isomorphic/delivery.ts`
- `apps/whispering/src/lib/query/isomorphic/transformer.ts`
- `apps/whispering/src/lib/services/isomorphic/device-stream.ts`
- `apps/whispering/src/lib/services/isomorphic/recorder/navigator.ts`
- `apps/whispering/src/lib/services/isomorphic/recorder/types.ts`
- `apps/whispering/src/lib/constants/audio/index.ts`
- `apps/whispering/src/lib/constants/audio/recording-modes.ts`
- `apps/whispering/src/lib/constants/audio/recording-states.ts`
- `apps/whispering/src/routes/(app)/(config)/+layout.svelte`
- `apps/whispering/src/routes/(app)/(config)/settings/recording/+page.svelte`
- `apps/whispering/src/routes/(app)/_components/AppLayout.svelte`
- `apps/whispering/src/routes/(app)/_layout-utils/register-commands.ts`
- `apps/whispering/src/routes/(app)/_layout-utils/alwaysOnTop.svelte.ts`

## 4. High-Level Architecture

The reference app follows the documented three-layer split:
- UI layer: Svelte screens, controls, selectors, settings views
- Query layer: TanStack-backed mutations and queries that own orchestration
- Service layer: pure functions with platform abstraction

Voice activation is not implemented as one monolithic recorder class. It is split across:

1. `vad-recorder.svelte.ts`
- owns live VAD detector lifecycle
- owns microphone stream acquisition for VAD
- owns reactive VAD hardware state
- emits speech-end blobs upward

2. `actions.ts`
- owns start/stop voice-activation commands
- owns user notifications and sounds
- owns the chunk handoff into the shared recording pipeline

3. `transcription.ts`
- owns provider selection and blob-to-text transcription

4. `delivery.ts` and `transformer.ts`
- own output side effects and optional transformation after transcription

The design is disciplined:
- hardware state is singleton state
- orchestration lives in mutations
- provider dispatch stays blob-oriented

## 5. The Core Control Flow

### 5.1 Session Start

Voice activation starts from a command callback:

```ts
callback: () => rpc.commands.toggleVadRecording(undefined)
```

That command resolves into `startVadRecording`, which:
- switches recording mode to `vad`
- shows a starting toast
- calls `vadRecorder.startActiveListening(...)`
- installs callbacks for `onSpeechStart` and `onSpeechEnd`

Mode switching is important. `settings.switchRecordingMode('vad')` first stops other active recording modes before activating VAD mode. That means the app treats voice activation as a peer of manual/upload modes, not as a sub-mode of manual recording.

### 5.2 Stream Acquisition

`vadRecorder.startActiveListening`:
- reads the selected navigator device id from settings
- calls `getRecordingStream(...)`
- stores the returned `MediaStream`
- creates `MicVAD` with that validated stream

This means microphone ownership still starts from ordinary browser media APIs. The VAD layer is built on top of the browser stream, not on a native low-level PCM transport.

### 5.3 VAD Initialization

The decisive VAD setting is:

```ts
submitUserSpeechOnPause: true
```

That option pushes chunk boundary ownership into the VAD library:
- speech begins
- VAD keeps buffering speech audio internally
- once the user pauses, the library decides that the utterance is complete
- `onSpeechEnd(audio)` fires with one completed speech buffer

This is the core reason the architecture is pause-chunked rather than stream-native.

### 5.4 State Machine

The VAD state machine is deliberately small:
- `IDLE`
- `LISTENING`
- `SPEECH_DETECTED`

Transitions:
- `IDLE -> LISTENING` after VAD successfully starts
- `LISTENING -> SPEECH_DETECTED` on `onSpeechStart`
- `SPEECH_DETECTED -> LISTENING` on `onSpeechEnd`
- `SPEECH_DETECTED -> LISTENING` on `onVADMisfire`
- any active state -> `IDLE` on stop/destroy

Important nuance:
- this state tracks detector/listener state only
- it does **not** track transcription queue state
- it does **not** tell you whether previous chunks are still processing

That separation keeps the VAD lifecycle simple, but it also means there is no single canonical session-progress model combining listening plus downstream STT work.

## 6. How Chunking Actually Happens

When `MicVAD` finishes one utterance, `vad-recorder.svelte.ts` does this:

```ts
onSpeechEnd: (audio) => {
  _state = 'LISTENING'
  const wavBuffer = utils.encodeWAV(audio)
  const blob = new Blob([wavBuffer], { type: 'audio/wav' })
  onSpeechEnd(blob)
}
```

The consequences are important:

1. Chunk output is already finalized audio
- not partial text
- not PCM frames
- not a session stream

2. The chunk format is WAV
- every pause produces a self-contained WAV blob
- providers then see normal file-style audio input

3. VAD immediately returns to listening
- speech-end blob creation happens before the next chunk's STT starts to matter
- the detector can keep servicing future speech while the previous chunk is still downstream

This is the exact seam where one "voice session" turns into many "blob jobs."

## 7. Where Parallelism Comes From

The reference app has two layers of parallelism.

### 7.1 Intra-chunk parallelism

Inside `processRecordingPipeline`, the app starts blob persistence and transcription at the same time:

```ts
const savePromise = db.recordings.create({ recording, audio: blob })
const transcribePromise = transcribeBlob(blob)
```

Then it waits on transcription first because text delivery is the latency-critical path.

This means:
- database save does not block transcription start
- transcription latency is optimized relative to local history persistence

### 7.2 Inter-chunk overlap

One VAD session can emit many blobs over time.

Each emitted blob enters `processRecordingPipeline` independently:
- chunk A may still be transcribing
- chunk B can already be captured on the next pause
- chunk C can arrive while chunk A is transforming

There is no global lock across chunks in the VAD action path.

That means the app achieves practical parallelism through **independent chunk jobs**, not through one continuous STT stream that yields ordered segments.

### 7.3 Batch parallel patterns elsewhere

The reference app also uses `Promise.all(...)` for multi-recording batch transcription paths, which reinforces the broader architectural preference:
- blobs are the unit of concurrency
- not one continuously ordered realtime session

## 8. Shared Blob Pipeline Reuse

The voice-activation path does not have its own special STT implementation.

After `onSpeechEnd(blob)`, `startVadRecording` calls the same shared helper:

```ts
await processRecordingPipeline({
  blob,
  toastId,
  completionTitle: '...'
})
```

`processRecordingPipeline` then does:
1. create recording metadata
2. start save and transcription in parallel
3. deliver transcript immediately on STT success
4. update DB record
5. optionally chain transformation if one is selected

This is a strong architecture choice:
- manual recording, upload, and VAD all converge onto one blob-processing pipeline
- provider switching stays centralized in `transcribeBlob`
- output behavior stays centralized in `delivery`

It also defines the limit of the design:
- if your pipeline contract is `Blob -> text`, you have not built a true streaming STT runtime

## 9. Provider Dispatch Model

`transcribeBlob(blob)` is the single provider dispatch seam.

It:
- reads provider choice from settings
- optionally compresses the blob first
- routes to a provider-specific transcription service

Relevant providers include:
- Groq
- OpenAI
- ElevenLabs
- Deepgram
- Mistral
- local `whispercpp`
- local `parakeet`
- local `moonshine`
- self-hosted `speaches`

This means the VAD path is explicitly **model agnostic at the blob boundary**.

That is useful for our repo because it proves one important product shape:
- pause-chunked dictation can stay provider-agnostic even when underlying providers are ordinary file transcription APIs

It does **not** prove that those providers support native realtime sessions.

## 10. Delivery and Transformation Semantics

After transcription:
- transcription text is delivered immediately
- DB update happens afterward
- optional transformation runs only if a transformation is currently selected

This matters because the output of one VAD chunk is **terminal text for that chunk**, not a mutable partial.

Consequences:
- there is no partial-text revision problem
- there is no segment assembler for provider partials
- there is no per-session ordered output coordinator
- transformation is chunk-local, not session-contextual

The result feels "instant" at the UX layer because each pause quickly produces text, but the runtime semantics are still discrete batch completions.

## 11. Settings, Commands, and UI Integration

The reference app exposes recording modes:
- `manual`
- `vad`
- `upload`

There is also a commented `live` mode placeholder in the recording mode constants and config layout. That is another signal that the codebase itself distinguishes:
- VAD chunking
- a future live mode

The UI behavior also reinforces this distinction:
- VAD uses its own selector path and icon states
- settings page exposes "Voice Activated" as a separate recording mode
- config layout shows a TODO alert for `live` rather than treating VAD as live streaming

This is one of the clearest product architecture lessons in the reference.

## 12. Secondary Behaviors Worth Noting

### 12.1 Device selection

VAD reads `recording.navigator.deviceId`, not the native/manual device path. That means:
- VAD is coupled to browser `MediaStream` capture
- device fallback logic comes from `getRecordingStream(...)`
- fallback updates settings when a preferred device is unavailable

### 12.2 Mode switching safety

`settings.switchRecordingMode(...)` stops other recording modes in parallel before switching. This prevents simultaneous manual and VAD capture.

### 12.3 Window behavior

`alwaysOnTop` logic reacts to:
- manual recording state
- `vadRecorder.state === 'SPEECH_DETECTED'`
- current transcription activity

So the UI is aware that "listening" and "transcribing" are distinct operational states.

### 12.4 Shortcut registration

VAD has distinct local/global shortcut bindings. That keeps activation semantics explicit and avoids overloading manual capture controls.

## 13. What This Architecture Does Well

Strengths:
- very clear boundary between live detector state and blob transcription work
- simple VAD state machine
- excellent reuse of shared blob pipeline
- provider/model agnostic blob transcription dispatch
- good user-perceived latency through pause-bounded chunking
- downstream non-blocking behavior because capture and processing are not serialized behind one global job lock

This is a pragmatic architecture for:
- dictation by utterance
- short natural pauses
- cloud STT APIs that want complete files
- incremental but chunk-terminal delivery

## 14. What This Architecture Does Not Solve

It does not solve:
- renderer-to-main PCM frame transport
- partial-text revisions
- provider-native realtime sockets/sessions
- canonical per-session segment ordering
- continuous context accumulation for transformed streaming
- one session model that spans audio ingress, STT partials, transform work, and ordered output commit

Those missing capabilities are exactly the parts our current streaming STT work still needs.

## 15. Risks and Trade-offs in the Reference Design

### 15.1 Pause sensitivity defines user experience

Because chunks are pause-bounded:
- brief pauses can prematurely split a thought
- long utterances may remain undelivered until pause detection fires
- segment boundaries are shaped by VAD heuristics, not semantic sentence boundaries

### 15.2 No canonical inter-chunk ordering contract

Chunks are independent jobs. If chunk B finishes before chunk A:
- output ordering can become completion-ordered rather than speech-ordered unless extra policy is added
- the reference app accepts this because it delivers each chunk as an independent blob result

This is acceptable for blob-style dictation, but it is weaker than the ordered output guarantees required for true streaming mode in our repo.

### 15.3 Transformation has no session memory

Each chunk can transform independently, but there is no built-in `segment + window + summary` context model. Style continuity across many chunks is therefore weaker than what our long-term transformed-streaming lane requires.

### 15.4 Browser-capture dependency

VAD depends on browser stream acquisition and the `vad-web` model lifecycle. That is a different operational surface from our planned Electron main/renderer streaming control plane.

## 16. Implications for Our Repo

### 16.1 What we should borrow

Useful patterns to borrow:
- keep detector/listener state separate from downstream processing state
- reuse one shared provider dispatch seam where the unit of work is stable
- allow listening/capture to continue while previous chunk work is still processing
- treat voice activation as its own mode, not as a hidden variant of manual recording

### 16.2 What we should not copy directly

We should not replace the planned streaming lane with this pattern.

Reasons:
- our mid-term goal is raw dictation stream support
- that requires session lifecycle, frame ingress, ordered finalized segments, and provider-neutral streaming adapters
- Epicenter VAD gives us utterance blobs, not streaming frames or provider-native segment events

### 16.3 Where this reference actually fits

The strongest fit is as a reference for a **separate pause-chunked voice-activation mode**, not as the core implementation model for the streaming lane.

That means:
- true streaming raw dictation should remain a dedicated session architecture
- Groq rolling-upload work can borrow lessons from pause-bounded chunk processing
- a later voice-activation mode in this repo could deliberately choose an Epicenter-like blob pipeline

## 17. Recommended Architectural Position

For this repo, the correct architectural split is:

1. `default`
- current batch raw dictation and transformed-text flow

2. `streaming`
- true session-oriented raw dictation stream first
- transformed streaming later on top of canonical finalized segments

3. optional later `voice_activation`
- pause-bounded chunking mode
- likely blob-oriented provider dispatch
- may reuse Groq rolling uploads or other file-style STT providers

The important rule is:
- do not use pause-chunk VAD architecture to avoid building the true streaming control plane

## 18. Bottom Line

Epicenter Whispering's voice-activation mode is a strong reference for **pause-detected chunked dictation with parallel blob transcription**, not for native realtime STT streaming.

Its deepest lesson is architectural, not cosmetic:
- one user session can map to many discrete blob jobs
- VAD state should remain separate from downstream STT/transform work
- chunk pipelines can feel fast without being true streaming

For our plan, this reference sharpens the boundary:
- keep current batch features intact
- build a real streaming lane for `stream_raw_dictation`
- treat pause-chunk voice activation as a separate architecture pattern that can be added later without distorting the streaming substrate
