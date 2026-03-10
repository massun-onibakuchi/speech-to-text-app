<!--
Where: docs/research/2026-03-10-issue-440-groq-vad-repro-bug-audit.md
What: Deep bug audit for the March 10 packaged-app Groq browser-VAD failure repro.
Why: The current Groq utterance path still fails in production; this document maps
     the exact failing flow, identifies concrete bugs, and records adjacent risks.
-->

# Issue 440: Groq Browser-VAD Repro Bug Audit

## Scope

Repro under investigation:

1. start recording
2. speak
3. wait for the first utterance to seal

Observed packaged-app logs:

- `streaming.groq_vad.start_begin`
- `streaming.groq_vad.start_complete`
- `streaming.groq_vad.utterance_ready` with `reason: "speech_pause"`
- immediate `streaming.groq_vad.stop_begin` with `reason: "user_cancel"`
- renderer fatal error: `TypeError: Illegal invocation`
- secondary uncaught promise error: `Cannot read properties of null (reading 'sessionId')`

This audit is research only. No code changes were made in this pass.

## Executive Findings

### 1. Confirmed: packaged renderer can throw `Illegal invocation` in `pushUtterance()` before the utterance send is awaited

This is the highest-confidence root cause for the repro.

Evidence:

- Built bundle line from the exact shipped asset:
  - `out/renderer/assets/index-DDAdl8AW.js:31902`
- Source equivalent:
  - `src/renderer/groq-browser-vad-capture.ts:421-423`

Relevant code:

```ts
let backpressureTimeout: ReturnType<typeof setTimeout> | null = this.setTimeoutFn(() => {
  this.markBackpressureStarted()
}, this.config.backpressureSignalMs)
```

Why this is a real bug:

- The repro stack points at the built line that creates the backpressure timer, not at Groq upload code.
- `BrowserGroqVadCapture` stores timer functions as instance fields and later invokes them indirectly:
  - `src/renderer/groq-browser-vad-capture.ts:118-124`
  - `src/renderer/groq-browser-vad-capture.ts:421-430`
- In packaged browser/Electron environments, detached host methods can throw `Illegal invocation`.
- The log sequence fits exactly: the utterance is sealed, `pushPromise` is created, then timer setup throws synchronously before the method reaches `await pushPromise`.

Impact:

- The first sealed `speech_pause` chunk fails locally in the renderer.
- Groq upload never becomes the primary failure point; the renderer dies before the utterance flow stabilizes.

### 2. Confirmed: `pushUtterance()` creates an in-flight transport promise before the failing timer setup, which orphans the promise when a synchronous error occurs

Evidence:

- `src/renderer/groq-browser-vad-capture.ts:408-430`

Relevant order:

```ts
const pushPromise = this.sink.pushStreamingAudioUtteranceChunk(...)
this.activeUtterancePushPromise = pushPromise
let backpressureTimeout = this.setTimeoutFn(...)
await pushPromise
```

Why this matters:

- If anything throws after `pushPromise` is created but before `await pushPromise` is reached, the transport promise is left running in the background.
- That is exactly what the repro shows: the synchronous `Illegal invocation` happens after the utterance send is started.
- After that, the capture enters fatal cleanup while the original send is still in flight.

Impact:

- The primary sync error is followed by a second asynchronous failure path.
- Error reporting becomes noisy and misleading because two failures are now racing:
  - the original sync renderer failure
  - the later fate of the orphaned utterance send

### 3. Confirmed: internal renderer failures are mapped to local `user_cancel`, which misreports the stop reason and distorts the stop path

Evidence:

- `src/renderer/groq-browser-vad-capture.ts:309-310`
- `src/renderer/groq-browser-vad-capture.ts:227-228`
- `src/renderer/groq-browser-vad-capture.ts:485-492`

Relevant flow:

```ts
catch (error) {
  this.reportFatalError(error)
}

async cancel(): Promise<void> {
  await this.stop('user_cancel')
}
```

Why this is a bug:

- The user did not cancel.
- The renderer logs `stop_begin` with `reason: "user_cancel"` only because `reportFatalError()` calls `cancel()`.
- The main-process cleanup later uses `fatal_error`, but the renderer-side capture lifecycle is already running through the cancel semantics first.

Impact:

- Logs are misleading during diagnosis.
- Bugs in capture transport are disguised as user cancellation.
- Any logic keyed on local stop reason can behave differently from a true fatal stop.

### 4. Confirmed: the main-process utterance ingress lacks payload validation and can turn malformed/null payloads into opaque `chunk.sessionId` crashes

Evidence:

- `src/main/ipc/register-handlers.ts:198-214`

Relevant code:

```ts
const assertStreamingAudioUtteranceChunkAllowed = (
  chunk: StreamingAudioUtteranceChunk,
  senderWindowId: number | null
): void => {
  const ownerWindowId = streamingSessionOwnerWindowIds.get(chunk.sessionId)
```

Why this is a real bug:

- The repro’s secondary uncaught promise error is:
  - `Cannot read properties of null (reading 'sessionId')`
- That exact message is consistent with `chunk` being `null` or otherwise invalid when `assertStreamingAudioUtteranceChunkAllowed()` dereferences `chunk.sessionId`.
- The handler performs no shape/null validation before dereferencing the payload.

What is still uncertain:

- This audit cannot prove whether the null payload originates from the orphaned in-flight send, a MessagePort timing edge, or some other renderer-side corruption.
- It does prove that the main handler degrades malformed input into a generic null dereference instead of a structured transport validation error.

Impact:

- The second error is difficult to diagnose from production logs.
- A malformed payload is not contained cleanly.

### 5. Confirmed: the Groq utterance contract lies about the WAV encoding format

Evidence:

- Renderer claims:
  - `src/renderer/groq-browser-vad-capture.ts:408-418`
- Upstream encoder defaults:
  - `node_modules/.pnpm/@ricky0123+vad-web@0.0.30/node_modules/@ricky0123/vad-web/dist/utils.js:25-63`

Relevant mismatch:

```ts
wavBytes: this.encodeWav(audio),
wavFormat: 'wav_pcm_s16le_mono_16000',
```

But upstream `encodeWAV` defaults to:

```js
function encodeWAV(samples, format = 3, sampleRate = 16000, numChannels = 1, bitDepth = 32)
```

And writes float32 data unless `format === 1`.

Why this is a bug:

- The payload label says PCM16 mono 16 kHz.
- The actual encoder default is float32 WAV.
- Main trusts the label and does not verify the header:
  - `src/main/services/streaming/groq-rolling-upload-adapter.ts:166-189`

Impact:

- The Groq upload path is operating on a false contract.
- Even if Groq accepts the WAV container, the system’s internal assumptions are wrong.
- This can cause provider-specific incompatibility and makes debugging any audio corruption harder.

### 6. Confirmed: streaming segment timestamps are derived from `performance.now()`-style monotonic milliseconds and then converted to ISO wall-clock dates

Evidence:

- Renderer timestamp source:
  - `src/renderer/groq-browser-vad-capture.ts:538-539`
- Main conversion:
  - `src/main/services/streaming/groq-rolling-upload-adapter.ts:411-416`

Why this is a bug:

- `startGroqBrowserVadCapture()` defaults `nowMs` to `performance.now()`, which is relative monotonic time, not Unix epoch time.
- Main later does:

```ts
startedAt: new Date(params.startedAtMs).toISOString()
endedAt: new Date(params.endedAtMs).toISOString()
```

- That produces 1970-ish timestamps for streaming segments.

Impact:

- Segment timestamps are semantically wrong.
- Any ordering/debugging that expects real wall-clock times is corrupted.
- This is not the direct repro trigger, but it is a correctness bug in the same path.

## Reconstructed Failure Flow

The current repro most likely unfolds like this:

1. Browser VAD starts successfully.
2. User speech ends and `onSpeechEnd()` calls `handleSpeechEnd()`.
3. `handleSpeechEnd()` seals the first utterance and enters `pushUtterance()`.
4. `pushUtterance()` creates `pushPromise` by calling the Groq sink:
   - `src/renderer/groq-browser-vad-capture.ts:408-419`
5. Immediately after that, the renderer tries to create the backpressure timer:
   - `src/renderer/groq-browser-vad-capture.ts:421-423`
6. In packaged Electron, that indirect timer call throws `Illegal invocation`.
7. `handleSpeechEnd()` catches the error and calls `reportFatalError()`:
   - `src/renderer/groq-browser-vad-capture.ts:295-310`
8. `reportFatalError()` starts local `cancel()`, which logs `stop_begin reason=user_cancel`:
   - `src/renderer/groq-browser-vad-capture.ts:485-492`
9. The original transport promise is still in flight because it was created before the sync throw.
10. That orphaned promise later rejects and surfaces the secondary uncaught error. The exact null-payload origin is still uncertain, but main currently has a null-dereference footgun in utterance ingress.

This explains the exact log shape:

- utterance sealed
- immediate `user_cancel`
- renderer fatal capture error
- secondary uncaught promise error afterward

## Missing Test Coverage

The current tests do not cover these production-only edges:

- default timer-function invocation in packaged/browser runtime
- default `utils.encodeWAV` contract versus claimed `wav_pcm_s16le_mono_16000`
- malformed/null utterance payload handling at main IPC ingress
- synchronous throw after `pushPromise` creation inside `pushUtterance()`
- renderer fatal path semantics versus `user_cancel`/`fatal_error` reason reporting

## Confidence Assessment

High confidence:

- bug 1: timer invocation / `Illegal invocation`
- bug 2: orphaned in-flight promise after sync throw
- bug 3: misleading local `user_cancel` semantics for fatal errors
- bug 4: null-payload dereference hazard in main ingress
- bug 5: WAV format contract mismatch
- bug 6: monotonic time converted as wall-clock time

Medium confidence:

- the exact source of the secondary null payload in the packaged repro

The null-payload message is real and the dereference site is real; what remains uncertain is which transport edge produced the null payload first.

## Bottom Line

Issue 440 is not fully fixed. The current Groq browser-VAD path still contains multiple concrete defects, and the primary production failure in this repro is renderer-local:

- the utterance send path throws `Illegal invocation` while arming the backpressure timer
- that synchronous throw leaves an in-flight send orphaned
- fatal cleanup misreports the stop as `user_cancel`
- the main utterance ingress turns malformed payloads into an opaque null dereference
- the audio format contract is wrong even when the send succeeds

The most urgent bug is the timer invocation failure in `pushUtterance()`, because it aborts the first sealed utterance before Groq upload behavior can even be evaluated.
