<!--
Where: docs/plans/2026-03-08-issues-425-426-streaming-stop-remediation-plan.md
What: Priority-sorted, one-ticket-per-PR remediation plan for streaming issues #425 and #426 plus adjacent lifecycle defects.
Why: Lock execution order, scope, trade-offs, and acceptance gates before any code changes begin on the dev-based streaming branch.
-->

# Execution Plan: Issues 425 and 426 Streaming Stop Remediation

Date: 2026-03-08
Base branch: `origin/dev` at `09962a0ea5f5f82c95e5980b139fd3b5cb2d441f`
Status: Planning only. Do not start implementation until this plan is reviewed and accepted.

## Inputs

- `docs/research/2026-03-08-issues-425-426-streaming-stop-failure-root-cause-research.md`
- GitHub issues `#425` and `#426`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/core/command-router.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/ipc/recording-command-dispatcher.ts`
- `src/main/orchestrators/recording-orchestrator.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/whispercpp-streaming-adapter.ts`
- `src/main/infrastructure/child-process-stream-client.ts`
- `src/renderer/native-recording.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/ipc-listeners.ts`
- `src/renderer/streaming-live-capture.ts`
- `src/renderer/streaming-audio-ingress.ts`
- `src/renderer/home-react.tsx`

## Locked Planning Decisions

1. `1 ticket = 1 PR`.
2. The branch target is `dev`, not `main`.
3. Ticket IDs are retained from the research notes even though execution order starts with `SSTP-03`.
4. Streaming stop becomes an explicit coordinated flow; batch recording keeps its existing toggle/cancel behavior.
5. `startStreamingSession` and `stopStreamingSession` remain the direct renderer-to-main session-control IPC surface.
6. `runRecordingCommand` stops being the transport for streaming stop once the explicit command/ack contract lands.
7. Main waits for a renderer stop acknowledgement for at most `STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS = 1500`.
8. Groq `user_stop` gets a hard end-to-end budget of `GROQ_USER_STOP_BUDGET_MS = 3000`, including upload settle and drain tail.
9. `user_cancel` and `fatal_error` stay destructive and do not drain late provider output.
10. `provider_end` is removed from the public shared contract in this remediation wave instead of being left as dead surface.
11. Stop-reason transport ownership belongs to `SSTP-01`; later tickets consume that contract instead of redefining it.
12. Every P0/P1 ticket must land with unit tests, one integration-level acceptance gate, and one manual Electron smoke gate.

## Problem Summary

- `#425`: stop can hang forever because Groq `user_stop` can wait indefinitely and the renderer UI can stay pinned to `Processing...`.
- `#426`: stop can lose final words because main stops the session before renderer capture has really stopped and the controller rejects late final segments.

Adjacent defects on the same path:

- delayed echoed `toggleRecording` can restart capture after stop
- `failed` can be overwritten by a later unconditional `ended`
- reload/new-window flows can show stale `idle`
- `provider_end` exists in the shared contract but has no real producer
- whisper startup publishes truth too early and child-process startup errors are under-modeled

## Priority Order

| Priority | Ticket | PR | Depends On | Goal | Feasibility | Main Risk |
|---|---|---|---|---|---|---|
| P0 | SSTP-03 Drain-safe controller shutdown and single-terminal truth | PR-1 | none | fix stop-time data loss and terminal truth corruption | Medium | allowing drain without leaking post-cancel output |
| P0 | SSTP-04 Bounded Groq stop budget | PR-2 | none | eliminate indefinite Groq stop hangs with a true stop bound | Medium | truncating late cloud output if the budget is too aggressive |
| P0 | SSTP-01 Streaming command contract and stop-handshake plumbing | PR-3 | none | replace raw streaming toggle semantics with explicit command/ack surfaces | Medium | shared IPC churn across main/preload/renderer |
| P0 | SSTP-02 Renderer coordinated stop execution and no-restart guard | PR-4 | SSTP-01 | stop capture before main-final stop and block delayed restart races | Medium | renderer race regressions if stale-session guards are incomplete |
| P1 | SSTP-05 Renderer pending-state recovery and stale-event guards | PR-5 | SSTP-02, SSTP-03, SSTP-04 | remove residual stuck `Processing...` paths and clear pending state from lifecycle truth | High | UI-only fixes masking deeper lifecycle bugs |
| P2 | SSTP-06 Boot snapshot sync and dead-contract cleanup | PR-6 | SSTP-03, SSTP-05 | hydrate truthful streaming state on reload and remove `provider_end` drift | High | widening IPC if snapshot and event paths diverge |
| P3 | SSTP-07 Whisper startup readiness and child-process failure hardening | PR-7 | SSTP-03 | make local provider startup truthful and diagnosable | Medium | provider-specific edge cases slowing direct issue closure |

## Granularity Rationale

- `SSTP-03` is controller semantics only.
- `SSTP-04` is Groq stop liveness only.
- `SSTP-01` is shared contract and main/preload wiring only.
- `SSTP-02` is renderer stop behavior only.
- `SSTP-05` is renderer state projection only.
- `SSTP-06` is boot snapshot and dead-contract cleanup only.
- `SSTP-07` is whisper/local-provider startup hardening only.

This split keeps each PR reviewable, revertable, and tightly scoped to one failure domain.

## Execution Sequence

1. `PR-1`: `SSTP-03`
2. `PR-2`: `SSTP-04`
3. `PR-3`: `SSTP-01`
4. `PR-4`: `SSTP-02`
5. `PR-5`: `SSTP-05`
6. `PR-6`: `SSTP-06`
7. `PR-7`: `SSTP-07`

---

## SSTP-03 (P0 / PR-1): Drain-Safe Controller Shutdown and Single-Terminal Truth

### Goal

Allow legitimate late final segments for the matching stopping session to commit during `user_stop`, while preserving destructive semantics for `user_cancel` and `fatal_error` and ensuring `failed` can never be overwritten by `ended`.

### Approach

Selected approach:
- keep `stopping` as the public state, but make controller internals drain-safe for `user_stop`
- relax both late-segment guard sites, not just one
- centralize terminal completion so exactly one terminal outcome wins

Rejected approach:
- introduce a new public `draining` state in this remediation wave
- reason: it widens the public contract before the current stop path is even correct

### Scope Files

- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/types.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/whispercpp-streaming-adapter.ts`
- `src/main/services/streaming/streaming-session-controller.test.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- `src/main/services/streaming/whispercpp-streaming-adapter.test.ts`
- new: `src/main/test-support/streaming-stop-integration.test.ts`

### Trade-offs

- Pros: directly fixes the stop-time data-loss path behind `#426`.
- Pros: preserves controller truth when provider stop fails.
- Pros: makes cancel-vs-stop behavior explicit instead of accidental.
- Cons: controller logic becomes more stateful.
- Cons: if the reason gates are wrong, cancel could leak output that should have been discarded.

### Code Snippet

```ts
const canAcceptLateFinalSegment =
  sessionId === this.snapshot.sessionId &&
  (this.snapshot.state === 'active' ||
    (this.snapshot.state === 'stopping' && this.snapshot.reason === 'user_stop'))

if (!canAcceptLateFinalSegment) return
```

### Tasks

1. Rework controller stop sequencing so terminal publication happens only after provider drain or bounded abort resolves.
2. Relax both guard sites: `createProviderRuntimeCallbacks().onFinalSegment` and `commitFinalSegment()` must both accept matching `user_stop` drain traffic.
3. Permit late final segment commit for `user_stop` on the matching session while still rejecting fresh audio ingress.
4. Keep `user_cancel` and `fatal_error` destructive and non-draining.
5. Refactor terminal state publication so `failed` cannot be overwritten by an unconditional `ended`.
6. Add regressions for stop-time late segments, cancel-time suppression, and stop-time provider failure truth.
7. Add an integration test that runs a full stop path and proves the last final segment still commits before `ended`.

### Checklist

- [ ] matching late final segments commit during `user_stop`
- [ ] new audio ingress is still blocked once stop begins
- [ ] `user_cancel` and `fatal_error` do not drain
- [ ] `failed` cannot transition back to `ended`
- [ ] stop publishes exactly one terminal session outcome
- [ ] both late-segment guard sites are covered by tests

### Gates

- [ ] `pnpm vitest run src/main/services/streaming/streaming-session-controller.test.ts`
- [ ] `pnpm vitest run src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- [ ] `pnpm vitest run src/main/services/streaming/whispercpp-streaming-adapter.test.ts`
- [ ] `pnpm vitest run src/main/test-support/streaming-stop-integration.test.ts`
- [ ] manual Electron smoke: dictate the last phrase, stop immediately, and verify the last phrase still lands before the session ends

---

## SSTP-04 (P0 / PR-2): Bounded Groq Stop Budget

### Goal

Guarantee that Groq stop completes within a bounded window, including the post-upload drain tail, so `#425` cannot hang indefinitely on Groq stop.

### Approach

Selected approach:
- let `user_stop` wait up to `GROQ_USER_STOP_BUDGET_MS = 3000` for the entire adapter stop path
- if the stop budget expires, abort outstanding uploads and discard any remaining undrained completed chunks
- keep `user_cancel` and `fatal_error` immediately abortive

Rejected approach:
- leave `user_stop` fully unbounded and trust the outstanding fetches to settle eventually
- reason: this preserves the exact hang symptom from `#425`

### Scope Files

- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- new: `src/main/test-support/streaming-groq-stop-budget.test.ts`

### Trade-offs

- Pros: puts a true upper bound on the Groq stop path instead of only bounding HTTP settle.
- Pros: isolates the fix to the adapter without expanding controller scope again.
- Cons: a stalled final chunk or slow drain tail can be truncated after `3000ms`.
- Cons: QA must validate the chosen budget against real network conditions.

### Code Snippet

```ts
await Promise.race([
  this.finishStopDrain(),
  this.delayMs(GROQ_USER_STOP_BUDGET_MS).then(() => {
    abortAllOutstandingUploads()
    discardUndrainedCompletedChunks()
  })
])
```

### Tasks

1. Add a bounded Groq stop budget of `3000ms` for `user_stop`.
2. Apply that budget to the full adapter stop path, including upload settle and completed-chunk drain.
3. Abort outstanding Groq uploads once the stop budget expires.
4. Discard any remaining undrained completed chunks once the stop budget expires.
5. Ensure timed-out stop-time uploads do not re-fail a session that is already intentionally stopping.
6. Add tests for stalled fetch on `user_stop`, immediate abort on `fatal_error`, and a slow drain tail that would otherwise exceed budget.
7. Add an integration test that forces a hung upload and proves stop returns within the documented budget.

### Checklist

- [ ] Groq `user_stop` cannot wait forever
- [ ] stop budget is centralized at `3000ms`
- [ ] timed-out uploads are aborted cleanly
- [ ] timed-out drain tails are cut off cleanly
- [ ] bounded stop still preserves successful fast final uploads

### Gates

- [ ] `pnpm vitest run src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- [ ] `pnpm vitest run src/main/test-support/streaming-groq-stop-budget.test.ts`
- [ ] manual Electron smoke: simulate a stalled Groq stop and verify the app exits stop within the documented budget

---

## SSTP-01 (P0 / PR-3): Streaming Command Contract and Stop-Handshake Plumbing

### Goal

Replace streaming’s raw echoed `toggleRecording` behavior with explicit IPC contracts for streaming start/stop/cancel and a renderer stop acknowledgement path that main can wait on for at most `1500ms`.

### Approach

Selected approach:
- extend `RecordingCommandDispatch` into an explicit tagged union so streaming commands are not inferred from batch commands
- add a renderer-stop acknowledgement IPC surface that main can await before calling final controller stop
- retain `startStreamingSession` / `stopStreamingSession` as the direct session-control IPC surface, upgraded to carry explicit stop reasons
- keep batch recording commands backward-compatible and unchanged in semantics

Rejected approach:
- keep a single `toggleRecording` dispatch and infer streaming meaning from renderer local state
- reason: this is the root cause of the restart race and ambiguous stop behavior

### Scope Files

- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/core/command-router.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/ipc/recording-command-dispatcher.ts`
- `src/main/orchestrators/recording-orchestrator.ts`
- `src/main/core/command-router.test.ts`
- `src/main/ipc/register-handlers.test.ts`
- `src/main/ipc/recording-command-dispatcher.test.ts`
- `src/main/orchestrators/recording-orchestrator.test.ts`
- new: `src/main/test-support/streaming-ipc-round-trip.test.ts`

### Trade-offs

- Pros: creates a real protocol instead of state inference.
- Pros: gives later tickets a stable place to enforce stop ordering.
- Pros: isolates batch mode from streaming-specific control flow.
- Cons: touches shared types and the IPC composition root together.
- Cons: this is enabling infrastructure, so the user-visible win is limited until PR-4 and PR-5 land.

### Code Snippet

```ts
const IPC_CHANNELS = {
  ackStreamingRendererStop: 'streaming:ack-renderer-stop'
}

type StopStreamingSessionRequest = {
  sessionId?: string
  reason: 'user_stop' | 'user_cancel' | 'fatal_error'
}

type RecordingCommandDispatch =
  | { kind: 'batch_toggle'; command: 'toggleRecording'; preferredDeviceId?: string }
  | { kind: 'batch_cancel'; command: 'cancelRecording' }
  | { kind: 'streaming_start'; sessionId: string; preferredDeviceId?: string }
  | { kind: 'streaming_stop_requested'; sessionId: string; reason: 'user_stop' | 'user_cancel' }
```

### Tasks

1. Add `IPC_CHANNELS.ackStreamingRendererStop = 'streaming:ack-renderer-stop'`, the matching `IpcApi.ackStreamingRendererStop()` method, and preload/main wiring.
2. Upgrade direct `stopStreamingSession()` IPC to accept `{ sessionId?, reason }` and make it the single renderer-to-main stop primitive.
3. Introduce explicit streaming dispatch variants in `src/shared/ipc.ts` while leaving batch dispatch shape intact.
4. Update `CommandRouter` and `recording-command-dispatcher` so streaming stop requests use the explicit streaming contract rather than `{ command: 'toggleRecording' }`.
5. Keep `RecordingOrchestrator` as batch-only orchestration and add tests proving the batch path did not gain streaming coupling.
6. Move end-to-end stop-reason transport ownership into this PR so later tickets consume, not redefine, `fatal_error`.
7. Add timeout-backed main-side handshake plumbing with `STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS = 1500`.
8. Add an integration test proving that a missing renderer ack times out and logs/falls back instead of hanging forever.
9. Add a dedicated batch-path non-regression test proving `toggleRecording` in batch mode still uses the batch dispatch path.

### Checklist

- [ ] streaming control no longer depends on raw echoed `toggleRecording`
- [ ] batch control path remains unchanged
- [ ] main has an explicit renderer stop ack contract
- [ ] `stopStreamingSession({ reason, sessionId? })` is the only renderer-to-main stop primitive
- [ ] stop handshake is bounded to `1500ms`
- [ ] streaming command dispatch carries `sessionId`
- [ ] `fatal_error` transport is fully owned by this PR

### Gates

- [ ] `pnpm vitest run src/main/core/command-router.test.ts`
- [ ] `pnpm vitest run src/main/ipc/recording-command-dispatcher.test.ts`
- [ ] `pnpm vitest run src/main/ipc/register-handlers.test.ts`
- [ ] `pnpm vitest run src/main/orchestrators/recording-orchestrator.test.ts`
- [ ] `pnpm vitest run src/main/test-support/streaming-ipc-round-trip.test.ts`
- [ ] manual Electron smoke: hotkey/tray stop still works for batch recording and a missing renderer ack does not hang stop forever

---

## SSTP-02 (P0 / PR-4): Renderer Coordinated Stop Execution and No-Restart Guard

### Goal

Make the renderer obey the new explicit streaming commands so capture stops locally before main completes stop, and ensure delayed commands for an older session cannot restart capture.

### Approach

Selected approach:
- execute streaming stop/cancel through dedicated renderer handlers instead of the generic toggle path
- bind renderer actions to the active `sessionId`
- route `session_stop` flush behavior through the new explicit stop ordering
- send a best-effort acknowledgement after local stop/cancel settles, then let main finish controller stop

Rejected approach:
- keep routing streaming through `handleRecordingCommandDispatch()` with `command === 'toggleRecording'`
- reason: it preserves the exact “late stop restarts capture” bug

### Scope Files

- `src/renderer/native-recording.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/ipc-listeners.ts`
- `src/renderer/streaming-live-capture.ts`
- `src/renderer/streaming-audio-ingress.ts`
- `src/renderer/native-recording.test.ts`
- `src/renderer/renderer-app.test.ts`
- `src/renderer/streaming-live-capture.test.ts`
- `src/renderer/streaming-audio-ingress.test.ts`

### Trade-offs

- Pros: fixes the stop ordering bug where main kills the session before capture actually stops.
- Pros: removes the delayed restart hazard by requiring `sessionId` match.
- Pros: keeps renderer behavior explicit and testable.
- Cons: renderer state machine becomes more explicit.
- Cons: ack ordering must be implemented carefully so stop cannot deadlock on renderer cleanup.

### Code Snippet

```ts
if (dispatch.kind === 'streaming_stop_requested') {
  if (dispatch.sessionId !== state.streamingSessionState.sessionId) return
  await recorderState.streamingCapture?.stop(dispatch.reason)
  await window.speechToTextApi.ackStreamingRendererStop({
    sessionId: dispatch.sessionId,
    reason: dispatch.reason
  })
}
```

### Tasks

1. Split streaming command handling out of the generic batch `toggleRecording` handler.
2. Stop or cancel live capture locally before main-final stop completes.
3. Ignore stale delayed streaming commands whose `sessionId` no longer matches the active renderer session.
4. Route `session_stop` flush behavior in `streaming-audio-ingress.ts` through the new explicit stop ordering so no late flush is emitted for the wrong session.
5. Consume the `fatal_error` transport added in `SSTP-01` so local fatal cleanup does not collapse to `user_stop`.
6. Add regressions for “delayed stop does not restart capture” and “old session command is ignored”.
7. Add a renderer integration-style test that verifies stop ack is emitted exactly once for the matching session.

### Checklist

- [ ] renderer stop path is session-scoped
- [ ] stop happens locally before main terminal completion
- [ ] delayed commands for old sessions are ignored
- [ ] `session_stop` flushes are ordered behind explicit stop handling
- [ ] fatal renderer cleanup reports `fatal_error`
- [ ] stop ack is emitted at most once per session stop request

### Gates

- [ ] `pnpm vitest run src/renderer/native-recording.test.ts`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`
- [ ] `pnpm vitest run src/renderer/streaming-live-capture.test.ts`
- [ ] `pnpm vitest run src/renderer/streaming-audio-ingress.test.ts`
- [ ] manual Electron smoke: stopping a live stream does not restart capture and does not emit late push errors for the stopped session

---

## SSTP-05 (P1 / PR-5): Renderer Pending-State Recovery and Stale-Event Guards

### Goal

Stop using `pendingActionId` as the sole source of truth for streaming UI state so Home can recover from terminal snapshots, stop timeouts, and stale async completions instead of staying on `Processing...`.

### Approach

Selected approach:
- introduce streaming-specific pending state derived from lifecycle truth
- clear streaming pending state on terminal snapshots and local fatal cleanup
- keep batch `pendingActionId` behavior unchanged

Rejected approach:
- clear `pendingActionId` with more ad hoc `finally` blocks and toast hooks
- reason: that treats symptoms but still ignores actual session lifecycle truth

### Scope Files

- `src/renderer/renderer-app.tsx`
- `src/renderer/home-react.tsx`
- `src/renderer/native-recording.ts`
- `src/renderer/home-react.test.tsx`
- `src/renderer/native-recording.test.ts`
- `src/renderer/renderer-app.test.ts`
- new: `src/renderer/streaming-ui-state.integration.test.tsx`

### Trade-offs

- Pros: directly addresses the remaining visible `Processing...` symptom from `#425`.
- Pros: renderer becomes resilient to future stop-path regressions.
- Pros: isolates streaming-specific state instead of mutating batch UI behavior.
- Cons: introduces another renderer state field and transition set.
- Cons: if added before the earlier stop-path tickets, it could mask rather than fix real bugs, which is why it is sequenced after PR-4.

### Code Snippet

```ts
if (
  state.pendingStreamingSessionId === snapshot.sessionId &&
  (snapshot.state === 'ended' || snapshot.state === 'failed')
) {
  state.pendingStreamingSessionId = null
}
```

### Tasks

1. Add streaming-specific pending state separate from generic `pendingActionId`.
2. Clear pending streaming state from terminal lifecycle events and local fatal cleanup.
3. Make Home processing/disabled logic session-aware in streaming mode.
4. Ignore stale async completions that refer to an old session or old pending token.
5. Add regressions for terminal failure recovery and stop-timeout recovery.
6. Add `src/renderer/streaming-ui-state.integration.test.tsx` proving the UI returns from `Processing...` to idle/error without a page reload.

### Checklist

- [ ] streaming UI no longer relies only on `pendingActionId`
- [ ] terminal lifecycle events clear streaming pending state
- [ ] stale async completions do not re-stick the UI
- [ ] batch UI behavior stays unchanged
- [ ] forced stop failure returns the UI to a truthful idle/error state

### Gates

- [ ] `pnpm vitest run src/renderer/home-react.test.tsx`
- [ ] `pnpm vitest run src/renderer/native-recording.test.ts`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`
- [ ] `pnpm vitest run src/renderer/streaming-ui-state.integration.test.tsx`
- [ ] manual Electron smoke: force a streaming failure and verify Home leaves `Processing...` without a reload

---

## SSTP-06 (P2 / PR-6): Boot Snapshot Sync and Dead-Contract Cleanup

### Goal

Make renderer boot/reload hydrate the actual streaming session snapshot from main and remove `provider_end` from shared/public contract surfaces now that the stop path is explicit.

### Approach

Selected approach:
- add `getStreamingSessionSnapshot` IPC/preload API
- hydrate renderer state during boot before relying solely on event listeners
- remove `provider_end` from `StreamingSessionStopReason` and related renderer/controller branches

Rejected approach:
- keep session state as an event-only stream and leave `provider_end` as dead API surface
- reason: that preserves stale `idle` reloads and hides future bugs behind contract drift

### Scope Files

- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/native-recording.ts`
- `src/main/ipc/register-handlers.test.ts`
- `src/renderer/renderer-app.test.ts`
- new: `src/main/test-support/streaming-session-snapshot-ipc.test.ts`

### Trade-offs

- Pros: new windows and reloads become truthful immediately.
- Pros: removes dead stop-reason branches from shared and renderer code.
- Pros: makes future lifecycle debugging much easier.
- Cons: adds another IPC surface that must stay consistent with the event stream.
- Cons: touches both boot code and shared contracts after the direct fixes have already landed.

### Code Snippet

```ts
const snapshot = await window.speechToTextApi.getStreamingSessionSnapshot()
applyStreamingSessionState(snapshot)
```

### Tasks

1. Add a read-only snapshot IPC route for the current streaming session state.
2. Hydrate renderer streaming state during boot before rendering steady-state controls.
3. Remove `provider_end` from shared/public stop-reason unions and renderer handling.
4. Run an explicit exhaustive-audit pass for every `switch`/branch/test mock over `StreamingSessionStopReason`.
5. Add tests for reload/new window while a stream is active, stopping, or failed.
6. Add an IPC integration test that proves snapshot reads match controller truth.

### Checklist

- [ ] reload/new window does not assume `idle`
- [ ] snapshot and event stream agree on session truth
- [ ] `provider_end` no longer exists as dead shared API
- [ ] stop-reason exhaustiveness is updated everywhere touched by the contract cleanup
- [ ] renderer boot logic handles active and failed sessions

### Gates

- [ ] `pnpm vitest run src/main/ipc/register-handlers.test.ts`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`
- [ ] `pnpm vitest run src/main/test-support/streaming-session-snapshot-ipc.test.ts`
- [ ] manual Electron smoke: open or reload a second window during an active stream and verify it renders the current session state immediately

---

## SSTP-07 (P3 / PR-7): Whisper Startup Readiness and Child-Process Failure Hardening

### Goal

Only publish local whisper sessions as `active` after provider readiness is real, and surface child-process startup failures as structured session failures.

### Approach

Selected approach:
- gate whisper `active` on a real ready signal
- extend the child-process client with explicit readiness and startup-error surfaces
- keep this provider-specific hardening behind the direct stop-path work

Rejected approach:
- keep publishing `active` immediately after process spawn
- reason: it creates false-active windows and obscures startup root causes

### Scope Files

- `src/main/services/streaming/whispercpp-streaming-adapter.ts`
- `src/main/infrastructure/child-process-stream-client.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/whispercpp-streaming-adapter.test.ts`
- `src/main/infrastructure/child-process-stream-client.test.ts`
- `src/main/services/streaming/streaming-session-controller.test.ts`

### Trade-offs

- Pros: local provider state becomes truthful.
- Pros: missing binary/model/spawn failures become diagnosable.
- Cons: does not close `#425` or `#426` directly, so it stays last.
- Cons: provider-specific async tests can be finicky.

### Code Snippet

```ts
await client.waitForReady()
publishActiveState()

child.on('error', (error) => {
  failStartup(error)
})
```

### Tasks

1. Extend the child-process client contract with an explicit readiness promise or equivalent `waitForReady()` surface.
2. Extend the child-process client contract with startup `error` propagation instead of relying only on stdout/stderr/exit.
3. Wait for whisper runtime readiness before publishing `active`.
4. Surface child-process startup `error` through the adapter and controller failure path.
5. Preserve structured failure details for missing binary/model/spawn failures.
6. Add regressions for delayed ready, ready-never-arrives, and spawn error cases.

### Checklist

- [ ] whisper does not report `active` before readiness
- [ ] child-process startup errors become structured session failures
- [ ] startup diagnostics stay actionable

### Gates

- [ ] `pnpm vitest run src/main/services/streaming/whispercpp-streaming-adapter.test.ts`
- [ ] `pnpm vitest run src/main/infrastructure/child-process-stream-client.test.ts`
- [ ] `pnpm vitest run src/main/services/streaming/streaming-session-controller.test.ts`

---

## Cross-Ticket Risks

| Risk | Affected Tickets | Mitigation |
|---|---|---|
| Batch recording regresses while streaming contracts change | SSTP-01, SSTP-02, SSTP-05 | keep batch dispatch/types intact and run dedicated batch non-regression tests |
| Drain-safe stop leaks output after cancel | SSTP-03 | gate drain behavior strictly on `user_stop` and add explicit cancel regressions |
| Groq budget is too short in real networks | SSTP-04 | centralize `3000ms`, document it, and validate with manual stop QA before merge |
| Renderer UI starts depending on speculative local state again | SSTP-02, SSTP-05, SSTP-06 | derive state from lifecycle snapshots, not only local promises |
| Provider-specific cleanup delays issue closure | SSTP-07 | keep whisper hardening in its own final PR |

## Acceptance Criteria For Starting Implementation

- [ ] plan reviewed on the rebased `origin/dev` worktree
- [ ] research doc and plan doc are both pushed on the planning branch
- [ ] no ticket still contains an unresolved design placeholder for stop timeout, Groq budget, or `provider_end`
- [ ] implementation starts strictly in PR priority order
