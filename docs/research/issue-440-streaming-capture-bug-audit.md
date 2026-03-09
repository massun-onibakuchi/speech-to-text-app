<!--
Where: docs/research/issue-440-streaming-capture-bug-audit.md
What: Deep bug audit for issue 440 across the streaming renderer capture and main stop/session flow.
Why: Capture the concrete defects, race conditions, and contract gaps found during code review before any fix work starts.
-->

# Issue 440 Research: Streaming Capture Bug Audit

## Scope

This audit followed the live streaming path end to end:

- renderer capture startup and teardown in `src/renderer/streaming-live-capture.ts`
- renderer batching/backpressure in `src/renderer/streaming-audio-ingress.ts`
- AudioWorklet frame production in `src/renderer/streaming-audio-capture-worklet.js`
- pause/chunk decisions in `src/renderer/streaming-speech-chunker.ts`
- renderer recording orchestration in `src/renderer/native-recording.ts`
- main stop handshake and IPC wiring in `src/main/ipc/register-handlers.ts`
- main streaming lifecycle in `src/main/core/command-router.ts`
- main session/runtime acceptance rules in `src/main/services/streaming/streaming-session-controller.ts`

I also read the adjacent decision records and the current tests around stop/drain, worklet migration, and IPC round trips.

## Flow Summary

The intended control flow is:

1. Main starts a streaming session and dispatches `streaming_start` to one renderer.
2. Renderer starts `startStreamingLiveCapture()`, loads the AudioWorklet, and turns worklet `audio_frame` messages into ingress batches.
3. `StreamingAudioIngress` forwards `pushStreamingAudioFrameBatch()` IPC calls into main.
4. On explicit stop, main sends `streaming_stop_requested`, waits for a renderer ack, then stops the session runtime.
5. On fatal renderer-side failure, renderer tears itself down and directly calls `stopStreamingSession({ reason: 'fatal_error' })`.

That design is sound in broad strokes, but the current implementation still has several real holes.

## Findings

### 1. High: Audio batches are not scoped to a session or renderer owner

Files:

- `src/shared/ipc.ts:106`
- `src/main/ipc/register-handlers.ts:601`
- `src/main/services/streaming/streaming-session-controller.ts:202`

`StreamingAudioFrameBatch` carries sample data and flush reason, but no `sessionId` and no owner identity. Main accepts every batch through `pushStreamingAudioFrameBatch()` and forwards it straight into the currently active provider runtime.

That means the owner-of-record protections added for start/stop do not exist for audio ingress itself. If a stale renderer capture survives longer than expected, or another renderer with preload access sends batches while a session is active, main has no way to reject them. The active session can be contaminated with the wrong microphone stream and the controller cannot even detect it.

This is the most serious contract bug in the current flow because it breaks isolation at the audio boundary itself.

### 2. High: Normal `user_stop` hides final-batch transport failures

Files:

- `src/renderer/streaming-live-capture.ts:175`
- `src/renderer/streaming-live-capture.ts:229`
- `src/renderer/streaming-live-capture.test.ts:641`

`BrowserStreamingLiveCapture.stop()` records `stopError`, but only rethrows when `reason !== 'user_stop'`. A normal explicit stop therefore looks successful even if the final `session_stop` batch fails to reach main.

Result:

- renderer still tears down
- renderer still acknowledges stop
- main still ends the session
- tail audio can be lost without any user-visible failure

The existing test currently locks in that behavior instead of catching it.

### 3. High: The 250 ms worklet flush timeout can drop the final tail

Files:

- `src/renderer/streaming-live-capture.ts:132`
- `src/renderer/streaming-live-capture.ts:238`
- `src/renderer/streaming-live-capture.test.ts:503`

On explicit stop, the renderer sends `{ type: 'flush' }` to the worklet and waits only `250ms`. If the renderer event loop is busy or stalled, the `audio_frame` carrying the final partial buffer can arrive after that timeout. Once stop teardown flips `stopped`, late frames are ignored.

That creates a real tail-loss race:

- worklet has valid buffered speech
- flush ack arrives too late
- renderer marks stop complete anyway
- final buffered speech is discarded

The current tests explicitly verify the late-frame discard path, but there is no coverage for the delayed-but-valid flush case.

### 4. Medium-High: `streaming_start` can orphan an active main session if no renderer receives the start command

Files:

- `src/main/core/command-router.ts:312`
- `src/main/ipc/register-handlers.ts:511`

Main starts the streaming session before it knows a renderer actually received `streaming_start`. If `dispatchRecordingCommandToOwner()` delivers `0`, the code logs and returns without rollback.

That leaves a split-brain state:

- main session is already `starting` or `active`
- no renderer owns capture
- later toggles are interpreted as stop requests for a session that never actually started in the renderer

This is a control-plane/data-plane mismatch and can wedge the session lifecycle until something forces it back to idle.

### 5. Medium: Cancel/fatal teardown does not stop or wait for an in-flight drain

Files:

- `src/renderer/streaming-audio-ingress.ts:84`
- `src/renderer/streaming-live-capture.ts:213`

`StreamingAudioIngress.cancel()` clears queued work and marks the ingress stopped, but it does not cancel or await `activeDrain`. If a batch started draining just before `user_cancel` or `fatal_error`, that IPC push can keep running after capture has been "canceled".

Practical effect:

- canceled speech is not guaranteed to stay discarded
- already-started audio delivery may still reach main after local cancel teardown completed

This is especially important for `user_cancel`, where the user expectation is usually "discard everything I was saying".

### 6. Medium: The public `stopStreamingSession` IPC bypasses the renderer stop handshake

Files:

- `src/main/ipc/register-handlers.ts:525`
- `src/main/ipc/register-handlers.ts:595`

The bounded stop handshake only exists in the recording-command path. The exported `stopStreamingSession` IPC handler directly calls `CommandRouter.stopStreamingSession()` with no renderer ack wait.

Today that direct IPC appears to be used for fatal cleanup, which is safe enough for that reason. But the public contract is still unsafe: any future caller that uses `reason: 'user_stop'` or `reason: 'user_cancel'` through this IPC will bypass the drain-preserving stop handshake and can cut the session off before renderer flush completes.

This is a contract bug waiting for a caller to step on it.

## Tests That Currently Hide These Problems

- `src/main/test-support/streaming-ipc-round-trip.test.ts:82` verifies stop-ack timeout fallback, but does not verify whether renderer drain could still be in progress when fallback fires.
- `src/renderer/streaming-live-capture.test.ts:503` verifies late frames are ignored after timeout, but not whether those late frames contained valid tail audio.
- `src/renderer/streaming-live-capture.test.ts:641` accepts stop-time transport failure during `user_stop` as success.
- There is no coverage for cancel/fatal teardown while `pushStreamingAudioFrameBatch()` is still unresolved.
- There is no coverage for non-owner or stale renderer audio injection because the audio batch contract currently cannot express ownership at all.

## Review Notes

- I ran two parallel sub-agent reviews over the renderer path and the main control-plane path.
- I also attempted a second review through the `claude` skill, but the CLI did not return usable output within the allotted runtime, so the report relies on direct code inspection plus the two completed sub-agent reviews.

## Bottom Line

The issue-440 area is not just one bug. The current streaming capture path still has:

- one isolation bug at the audio IPC boundary
- two separate tail-loss/data-loss bugs on explicit stop
- one orphan-session lifecycle bug on start
- one cancel-path leak of already in-flight audio
- one unsafe public stop contract that bypasses the intended handshake

The highest-priority fixes should be:

1. Scope audio batches to the active session/owner.
2. Stop swallowing `user_stop` transport failure when the final batch did not reach main.
3. Replace the fixed 250 ms flush cutoff with a stop contract that does not discard valid late tail data.
