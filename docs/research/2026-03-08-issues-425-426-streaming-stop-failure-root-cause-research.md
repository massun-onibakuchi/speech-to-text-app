<!--
Where: docs/research/2026-03-08-issues-425-426-streaming-stop-failure-root-cause-research.md
What: Root-cause research for streaming issues #425 and #426 against the real streaming runtime on origin/dev.
Why: Capture the confirmed failure chain and adjacent lifecycle bugs before implementation fixes are planned.
-->

# Research: Issues 425 and 426 Streaming Stop/Failure Root Causes

Research date: March 8, 2026

Analyzed code baseline:
- `origin/dev`
- not the current worktree tip, because this worktree predates the streaming runtime that the issues were reported against

Related issues:
- `#425` <https://github.com/massun-onibakuchi/speech-to-text-app/issues/425>
- `#426` <https://github.com/massun-onibakuchi/speech-to-text-app/issues/426>

## Scope

This report traces the actual streaming runtime and stop/failure flow across:
- renderer command handling
- renderer live audio capture and frame batching
- main-process IPC dispatch
- streaming session controller lifecycle
- Groq rolling-upload shutdown behavior
- adjacent streaming lifecycle contracts that can corrupt state in the same path

Files reviewed included:
- `src/renderer/renderer-app.tsx`
- `src/renderer/native-recording.ts`
- `src/renderer/streaming-live-capture.ts`
- `src/renderer/streaming-audio-ingress.ts`
- `src/renderer/home-react.tsx`
- `src/main/ipc/register-handlers.ts`
- `src/main/core/command-router.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/whispercpp-streaming-adapter.ts`
- `src/main/infrastructure/child-process-stream-client.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`

## Executive Summary

Issues `#425` and `#426` are real. The core problem is not one isolated bug. The streaming stop path is internally inconsistent:

1. main stops the session before renderer capture stops
2. the controller stops accepting both audio batches and final segments too early
3. the renderer still performs graceful stop-time flushes after the main session is already terminal
4. the UI ties its `Processing...` state to an IPC promise that has no recovery path if stop hangs
5. the echoed `toggleRecording` command can restart capture after the renderer has already self-cleared

That combination explains all reported symptoms:
- repeated `Streaming audio frame batches require an active session` errors
- later speech being dropped, especially speech buffered until stop
- `Processing...` sticking forever
- unstable stop behavior

## Confirmed Root Causes For #425 And #426

### 1. Stop ordering is reversed: main stops first, renderer stops later

Severity: High

Main handles streaming `toggleRecording` stop by awaiting `streamingSessionController.stop('user_stop')` before it broadcasts the renderer command:
- `src/main/core/command-router.ts` `origin/dev:68-76`
- `src/main/ipc/register-handlers.ts` `origin/dev:374-378`

The renderer, meanwhile, explicitly keeps live capture running until it receives either:
- a terminal session snapshot (`ended` or `failed`), or
- the later echoed recording command

Relevant code:
- `src/renderer/native-recording.ts` `origin/dev:483-487`
- `src/renderer/native-recording.ts` `origin/dev:511-532`

This means there is a guaranteed window where:
- main is already `stopping` or `ended`
- renderer audio capture is still active
- renderer is still batching and pushing frames

The controller rejects those late pushes because it only accepts audio while the session is `active`:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:195-200`

That is the direct source of the repeated issue `#426` error:
- `streaming:push-audio-frame-batch`
- `Streaming audio frame batches require an active session.`

### 2. The controller stops accepting final output too early, so stop-time speech is dropped

Severity: High

The controller publishes `stopping` before provider shutdown completes:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:168-177`

But provider final segments are only accepted while the controller snapshot is still `active`:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:203-223`
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:285-299`

Groq emits its final chunk during `stop('user_stop')`:
- it schedules a `session_stop` chunk if buffered frames remain
- then waits for in-flight uploads and drains completed chunks
- then calls `onFinalSegment(...)`

Relevant code:
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:114-135`
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:256-275`

By that point the controller is already no longer `active`, so those late final segments are silently ignored.

This is a direct root cause for the `#426` symptom where the second spoken statement after a pause is not transcribed:
- if that second statement was still buffered locally and only flushed at stop, it is dropped
- if an earlier in-flight Groq chunk finishes after stop begins, that result is also dropped

This same controller gate also risks dropping late final segments from the local `whisper.cpp` path:
- `src/main/services/streaming/whispercpp-streaming-adapter.ts` `origin/dev:105-123`
- `src/main/services/streaming/whispercpp-streaming-adapter.ts` `origin/dev:176-182`

### 3. Renderer graceful shutdown performs a final `session_stop` flush after the session is already dead

Severity: High

When renderer capture stops gracefully, `BrowserStreamingLiveCapture.stop()` calls `ingress.stop()` for normal stop reasons:
- `src/renderer/streaming-live-capture.ts` `origin/dev:127-166`

`StreamingAudioIngress.stop()` always flushes pending audio with `flush('session_stop')`:
- `src/renderer/streaming-audio-ingress.ts` `origin/dev:69-76`

And the ingress drain pushes those batches through IPC:
- `src/renderer/streaming-audio-ingress.ts` `origin/dev:101-117`

The renderer triggers that graceful stop after terminal session updates here:
- `src/renderer/native-recording.ts` `origin/dev:475-497`

But by definition those terminal updates arrive after main has already moved the session out of `active`.
So the renderer is asked to do a final flush into a session that main has already invalidated.

This is why the active-session error is not just a corner case. On the normal `ended` path, the current contract makes post-mortem pushes structurally likely.

### 4. `Processing...` can stick forever because it is tied to a stop IPC promise with no fallback clear

Severity: High

Renderer UI state sets `pendingActionId` before awaiting `runRecordingCommand()` and clears it only when that promise settles:
- `src/renderer/renderer-app.tsx` `origin/dev:507-524`

`HomeReact` renders `Processing...` whenever:
- `pendingActionId !== null`
- and `!isRecording`

Relevant code:
- `src/renderer/home-react.tsx` `origin/dev:57-60`
- `src/renderer/home-react.tsx` `origin/dev:190-196`

The renderer fatal path clears local capture and sets `hasCommandError`, but it does not clear `pendingActionId`:
- `src/renderer/native-recording.ts` `origin/dev:365-375`

So once the local capture dies, the UI can move into:
- not recording anymore
- still waiting on the unresolved stop IPC
- therefore showing `Processing...`

That is the renderer-side reason `#425` can get stuck.

### 5. Groq `user_stop` can hang indefinitely because stop waits on fetches that have no timeout and are not aborted

Severity: High

Groq only aborts in-flight requests for:
- `user_cancel`
- `fatal_error`

Relevant code:
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:117-127`

For `user_stop`, the adapter instead waits for all in-flight uploads to settle:
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:129-135`

Those uploads use `fetch` with an abort signal, but no timeout:
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:224-231`

So if a Groq upload stalls, `stop('user_stop')` can wait forever.
That in turn means:
- `runRecordingCommand('toggleRecording')` never resolves
- `pendingActionId` never clears
- the home button can remain stuck on `Processing...`

This is the main-process half of issue `#425`.

## Additional Bugs Found In The Same Flow

### 6. The echoed `toggleRecording` can restart capture after stop

Severity: High

After main finishes stopping, it broadcasts the same `toggleRecording` command back to the renderer:
- `src/main/core/command-router.ts` `origin/dev:69-72`
- `src/main/ipc/register-handlers.ts` `origin/dev:374-378`

But the renderer may already have self-cleared local capture after:
- a terminal session update
- or a fatal local push error

Relevant code:
- `src/renderer/native-recording.ts` `origin/dev:365-375`
- `src/renderer/native-recording.ts` `origin/dev:490-497`

The renderer interprets `toggleRecording` entirely from local state:
- if `isNativeRecording()` is `true`, stop
- otherwise, start

Relevant code:
- `src/renderer/native-recording.ts` `origin/dev:515-529`

So a late echoed stop-toggle can be misread as a fresh start-toggle and reopen capture immediately after stop.
This helps explain the “stop does not respond correctly” instability in `#426`.

### 7. Stop-time provider failures can be overwritten from `failed` back to `ended`

Severity: Medium

Groq upload failures inside `uploadChunk()` are converted into `callbacks.onFailure(...)` and swallowed rather than rethrown through `stop()`:
- `src/main/services/streaming/groq-rolling-upload-adapter.ts` `origin/dev:178-191`

The controller failure path publishes `failed`:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:234-261`

But the original `stop()` path then still publishes `ended` unconditionally after `providerRuntime.stop(...)` completes:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:182-187`

That means a real stop-time failure can be transiently or finally reported as clean `ended`, which corrupts session truth and can hide errors during diagnosis.

### 8. Terminal session events can be dropped if they arrive before renderer capture is constructed

Severity: Medium

Renderer ignores terminal session updates when `recorderState.streamingCapture` does not yet exist:
- `src/renderer/native-recording.ts` `origin/dev:479-487`

But main starts the session before the renderer starts microphone capture:
- `src/main/core/command-router.ts` start path
- then later broadcasts the command

Relevant code:
- `src/main/core/command-router.ts` `origin/dev:79-81`, `origin/dev:302-323`
- `src/main/ipc/register-handlers.ts` `origin/dev:374-378`
- `src/renderer/native-recording.ts` `origin/dev:359-377`

If main emits `failed` or `ended` before renderer capture exists, that terminal state is ignored locally.
The later start command can then create capture against an already-dead session.

### 9. Renderer windows have no streaming session snapshot sync and can boot into stale `idle`

Severity: Medium

Renderer starts with local streaming state hard-coded to `idle`:
- `src/renderer/renderer-app.tsx` `origin/dev:93-100`

Preload exposes only event listeners, not a “get current streaming session snapshot” API:
- `src/preload/index.ts` `origin/dev:34-63`

IPC wiring only forwards future events:
- `src/main/ipc/register-handlers.ts` `origin/dev:310-345`

So a reloaded or newly opened renderer can show `idle` while main is still `active`, `stopping`, or `failed`.

This did not cause `#425/#426` directly, but it is in the same session-state model and will make debugging and UX consistency worse.

### 10. `provider_end` is currently a dead contract

Severity: Medium

Shared IPC and renderer UX expect `provider_end`:
- `src/shared/ipc.ts` `origin/dev:54-63`
- `src/renderer/native-recording.ts` `origin/dev:505-507`
- `src/renderer/streaming-feedback.ts`

But provider callbacks only support:
- `onFinalSegment`
- `onFailure`

Relevant code:
- `src/main/services/streaming/types.ts`
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:285-305`

There is no implemented main-process path that can publish `ended` with `reason: 'provider_end'`.

This is contract drift rather than the direct cause of the reported bugs, but it shows the streaming lifecycle API is already inconsistent.

### 11. Whisper.cpp is marked `active` before the runtime is actually ready

Severity: Medium

The controller publishes `active` as soon as `providerRuntime.start()` resolves:
- `src/main/services/streaming/streaming-session-controller.ts` `origin/dev:145-152`

`WhisperCppStreamingAdapter.start()` resolves immediately after spawning the process:
- `src/main/services/streaming/whispercpp-streaming-adapter.ts` `origin/dev:72-103`

The adapter receives `ready` events but ignores them:
- `src/main/services/streaming/whispercpp-streaming-adapter.ts` `origin/dev:164-166`

That creates a false-active window where UI and renderer capture can proceed before the provider is actually ready.

### 12. Child-process spawn errors are not wired into the structured streaming failure path

Severity: Medium

`ChildProcessStreamClient` listens for:
- stdout
- stderr
- `exit`

But not child-process `error` events:
- `src/main/infrastructure/child-process-stream-client.ts` `origin/dev:50-78`

That means async spawn/exec failures for `whisper.cpp` can bypass the structured session failure path and show up as unhandled process errors instead of clean streaming failures.

## Failure Timeline That Explains Both Issues

1. User presses stop in streaming mode.
2. Renderer sets `pendingActionId`.
3. Main immediately transitions the session out of `active`.
4. Renderer capture is still running because it waits for a later terminal event or echoed command.
5. Late audio batches are pushed into a non-active session and start throwing active-session IPC errors.
6. Renderer fatal handling clears local capture and marks an error, but does not clear `pendingActionId`.
7. Any stop-time Groq chunk or late in-flight chunk result is dropped because the controller no longer accepts final segments.
8. If Groq has a stalled in-flight upload, `user_stop` can wait forever.
9. The home button becomes `!isRecording && pendingActionId !== null`, so it shows `Processing...` indefinitely.
10. When main eventually echoes `toggleRecording`, renderer can misread it as a new start because local capture was already cleared.

## Coverage Gaps

Current tests do not cover the failure chain above.

Missing or insufficient coverage areas:
- stop while a Groq chunk upload is still in flight
- stop-time final segment delivery after the controller has entered `stopping`
- renderer `session_stop` flush into a terminal session
- `pendingActionId` clearing after streaming fatal errors
- delayed stop-toggle echo after renderer self-clears
- late renderer subscription / renderer reload while a session is already active
- stop-time failure not being overwritten from `failed` to `ended`

Relevant test files that currently miss these cases:
- `src/main/services/streaming/streaming-session-controller.test.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- `src/main/ipc/register-handlers.test.ts`
- `src/renderer/native-recording.test.ts`
- `src/renderer/renderer-app.test.ts`

## Confidence

Confidence is high for findings `1` through `7`.

Those findings come from a consistent code-path trace across renderer, IPC, controller, and Groq adapter behavior, and they line up directly with the two issue reports.

Confidence is medium for findings `8` through `12`.
Those are real contract or lifecycle defects found during the same audit, but they are adjacent to the reported bugs rather than the direct cause of the two reported symptoms.
