<!--
Where: docs/plans/2026-03-10-issue-440-groq-vad-repro-fix-plan.md
What: Ticketed execution plan for fixing the March 10 Groq browser-VAD repro defects.
Why: Freeze a reviewable PR-by-PR repair sequence before changing production code.
-->

# Issue 440 Repro Fix Plan: Groq Browser-VAD Failures

Date: 2026-03-10  
Status: Planning only. No implementation work starts from this document until the plan is reviewed.

## Inputs Reviewed

- Bug audit:
  - [2026-03-10-issue-440-groq-vad-repro-bug-audit.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-10-issue-440-groq-vad-repro-bug-audit.md)
- Existing architecture plan:
  - [issue-440-groq-browser-vad-execution-plan.md](/workspace/.worktrees/fix/issue-440/docs/plans/issue-440-groq-browser-vad-execution-plan.md)
- Prior design:
  - [2026-03-09-groq-browser-vad-utterance-chunking-design.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-groq-browser-vad-utterance-chunking-design.md)
  - [2026-03-09-groq-browser-vad-utterance-architecture-decision.md](/workspace/.worktrees/fix/issue-440/docs/decisions/2026-03-09-groq-browser-vad-utterance-architecture-decision.md)
- Runtime files implicated by the repro:
  - [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
  - [native-recording.ts](/workspace/.worktrees/fix/issue-440/src/renderer/native-recording.ts)
  - [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
  - [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
  - [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
  - [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)

## Repair Constraints

- `1 ticket = 1 PR`.
- Tickets are sorted by production risk first, then dependency.
- The first PR must remove the confirmed packaged-app crash path before broader cleanup.
- Each PR must include tests and doc updates for the behavior it changes.
- Groq-specific repairs must not regress the `whisper.cpp` frame-stream path.
- The plan should prefer root-cause fixes over log-only mitigation.

## Priority Summary

| Priority | Ticket | PR | Goal | Depends On | Feasibility | Main Risk |
|---|---|---|---|---|---|---|
| P0 | T440-R1 Renderer Crash Containment | PR-1 | Remove the packaged `Illegal invocation` crash and prevent orphaned utterance sends | None | High | Partial fix that hides but does not contain async fallout |
| P1 | T440-R2 Fatal Stop Semantics | PR-2 | Separate fatal transport failure from `user_cancel` and freeze the stop-reason contract across renderer, IPC, and main cleanup | PR-1 | Medium | Stop-path regressions if fatal and user-stop rules diverge incorrectly |
| P1 | T440-R3 IPC Payload Validation | PR-3 | Reject null/malformed utterance payloads with structured transport errors | PR-1 | High | Over-tight validation can reject legitimate edge payloads |
| P2 | T440-R4 PCM16 WAV Contract Enforcement | PR-4 | Make the Groq payload explicitly PCM16 WAV end to end and validate that contract in main | PR-1, PR-3 | Medium | Provider compatibility changes if the format fix is incomplete |
| P3 | T440-R5 Time Semantics Correction | PR-5 | Fix monotonic-versus-wall-clock timestamp misuse and freeze the timestamp contract | PR-2, PR-3, PR-4 | High | Low direct product impact, easy to de-prioritize unless scoped tightly |
| P4 | T440-R6 Minimal Repro Diagnostics | PR-6 | Add one bounded, opt-in Groq utterance handoff trace for local reproduction | PR-2, PR-3, PR-4, PR-5 | High | Easy to let instrumentation sprawl without a hard field budget |

Priority rationale:

- `T440-R1` is first because the current packaged build crashes on the first sealed utterance; nothing else is reliable until that path is contained.
- `T440-R2` and `T440-R3` are the next blockers because today’s failure reporting and payload handling obscure the real defect and create misleading secondary crashes.
- `T440-R4` depends on `T440-R3` because format debugging is not reliable until malformed payloads fail cleanly at the IPC boundary.
- `T440-R5` is late because timestamp correctness does not block the primary crash fix, but it should land before any new diagnostic trace so the logged fields have settled semantics.
- `T440-R6` is intentionally last because it is operational support work, not a product-correctness blocker.

## Ticket T440-R1 (P0): Renderer Crash Containment -> PR-1

### Goal

Remove the confirmed packaged renderer crash in `pushUtterance()` and guarantee that synchronous failures cannot orphan a started utterance send.

### Approach

- Replace detached host timer invocation with a call shape that is safe in packaged Electron/browser runtimes.
- Reorder or wrap `pushUtterance()` so timer setup and other synchronous preconditions cannot leave `pushPromise` running without ownership.
- Add explicit cleanup for partially-started push state.
- Keep the change renderer-local so the first PR stays tightly scoped to the confirmed repro root cause.

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [groq-browser-vad-capture.test.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.test.ts)
- [2026-03-10-issue-440-groq-vad-repro-bug-audit.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-10-issue-440-groq-vad-repro-bug-audit.md)
- new decision note if the timer-call contract or push ordering changes materially

### Trade-offs

- Selected: contain the sync-failure window inside `pushUtterance()`.
  - Pro: directly fixes the confirmed repro and makes later debugging meaningful.
  - Con: does not yet fix the misleading stop reason or malformed payload handling.
- Rejected: add only more logging around the current timer call.
  - Pro: very low code churn.
  - Con: leaves the production crash intact.

### Checklist

- [ ] Packaged/browser-safe timer invocation pattern is used.
- [ ] No synchronous error after send creation can orphan an active utterance push.
- [ ] Active push bookkeeping is cleared on both success and failure.
- [ ] Tests reproduce the sync-throw window and prove containment.
- [ ] The packaged-app repro path has a concrete verification checklist or harness.
- [ ] Existing `whisper.cpp` renderer-capture tests still pass unchanged.
- [ ] Docs explain the root cause and the containment rule.

### Tasks

1. Audit every stored timer-function use in `BrowserGroqVadCapture`.
2. Refactor `pushUtterance()` ordering so sync setup failures occur before transport starts, or are contained with deterministic cleanup.
3. Add a regression test for the `Illegal invocation` class of failure.
4. Add a regression test for a synchronous throw after send creation.
5. Add a packaged verification step or scripted checklist that proves the bug is fixed in the packaged runtime, not just dev mode.
6. Update the bug audit or ADR with the final root-cause write-up.

### Gates

- The packaged repro path no longer crashes when the first utterance seals.
- A forced sync throw in the test harness cannot leave an unawaited send behind.
- PR validation includes one packaged-runtime proof, not only unit tests.
- Existing `whisper.cpp` capture tests still pass.
- No main-process files change in this PR unless they are strictly required for test wiring.

### Code Snippet

```ts
const startBackpressureTimer = (): ReturnType<typeof window.setTimeout> =>
  window.setTimeout(() => {
    this.markBackpressureStarted()
  }, this.config.backpressureSignalMs)

const backpressureTimeout = startBackpressureTimer()
const pushPromise = this.sink.pushStreamingAudioUtteranceChunk(chunk)
```

## Ticket T440-R2 (P1): Fatal Stop Semantics -> PR-2

### Goal

Make renderer and main stop semantics report transport failures as fatal errors instead of misclassifying them as `user_cancel`.

### Approach

- Split local capture shutdown reasons into explicit user-driven and fatal-driven paths.
- Freeze the stop-reason contract before coding:
  - renderer internal transport failure -> `fatal_error`
  - explicit UI cancel before normal completion -> `user_cancel`
  - explicit UI stop/finish path -> `user_stop`
  - main cleanup may normalize internal transport failure into fatal session teardown, but must not rewrite it to user intent
- Preserve the main-process fatal cleanup handshake, but stop routing internal renderer faults through `cancel()`.
- Make logs and state transitions truthful so later bugs are diagnosable from one trace.

### Stop-Reason Contract

| Origin | Renderer reason | IPC/main accepted reason | Compatibility rule |
|---|---|---|---|
| User presses cancel/abort | `user_cancel` | `user_cancel` | Must preserve current user-cancel cleanup behavior |
| User presses stop/finish | `user_stop` | `user_stop` | Must preserve current flush/drain path |
| Renderer capture/transport failure | `fatal_error` | `fatal_error` | Must never be reported as `user_cancel` |
| Main-side transport/provider failure after a valid renderer send | no renderer remap | `fatal_error` | Main may escalate to fatal cleanup without rewriting prior user intent |

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [native-recording.ts](/workspace/.worktrees/fix/issue-440/src/renderer/native-recording.ts)
- [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- renderer and main tests covering stop reasons

### Trade-offs

- Selected: explicit fatal stop semantics.
  - Pro: clearer logs, less stop-path confusion, better future debugging.
  - Con: broadens the PR into both renderer and main stop handling.
- Rejected: keep `user_cancel` locally and rely on later main cleanup to reinterpret it.
  - Pro: smaller behavior diff.
  - Con: preserves misleading logs and mixed semantics.

### Checklist

- [ ] Stop-reason contract table is agreed and documented before code changes.
- [ ] Renderer fatal transport failures do not log `user_cancel`.
- [ ] User cancel, user stop, and fatal error remain distinct reasons.
- [ ] Main cleanup behavior remains compatible with the renderer reason split.
- [ ] Tests cover fatal-from-renderer and user-cancel paths independently.
- [ ] Existing `whisper.cpp` stop/cancel tests still pass.
- [ ] Updated docs explain the stop-reason contract.

### Tasks

1. Document the stop-reason contract in the PR and any linked ADR before behavioral edits.
2. Map the current local stop-state machine and identify where `cancel()` is being used as a fatal path.
3. Introduce a dedicated fatal shutdown path in the renderer capture layer.
4. Align main cleanup handling with the frozen renderer/main compatibility rules.
5. Add regression tests for log reason and stop outcome.
6. Document the final state transitions with one happy-path and one fatal-path sequence.

### Gates

- No code ships from this PR without the stop-reason contract table staying true in code and tests.
- A forced renderer transport failure produces a fatal stop reason end to end.
- A real user cancel still behaves exactly as before.
- Existing `whisper.cpp` stop behavior remains unchanged in tests.
- No new stop path can bypass final resource cleanup.

### Code Snippet

```ts
private async reportFatalError(error: unknown): Promise<void> {
  this.logFatal(error)
  await this.stop('fatal_error')
}
```

## Ticket T440-R3 (P1): IPC Payload Validation -> PR-3

### Goal

Turn null or malformed utterance payloads into structured IPC validation failures instead of opaque `chunk.sessionId` crashes.

### Approach

- Validate incoming utterance payload shape before session ownership checks.
- Preserve strict owner-window enforcement after validation passes.
- Return/log a transport-specific validation error that includes the rejected condition without leaking payload contents.

### Scope Files

- [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
- [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
- [streaming-session-controller.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/streaming-session-controller.ts)
- tests around IPC ingress validation
- bug audit update if the secondary crash origin becomes clearer

### Trade-offs

- Selected: explicit runtime payload guards at the IPC boundary.
  - Pro: better fault isolation and clearer production errors.
  - Con: adds repetitive validation logic unless centralized cleanly.
- Rejected: rely on TypeScript and trust the renderer payload.
  - Pro: less runtime code.
  - Con: already disproven by the packaged repro.

### Checklist

- [ ] Null payloads are rejected without null dereference.
- [ ] Malformed payloads are rejected before ownership lookup.
- [ ] Valid payloads still use the existing owner-window/session checks.
- [ ] Tests cover null, wrong-shape, stale-session, and valid cases.
- [ ] Existing non-Groq streaming ingress tests still pass.
- [ ] Error messages are structured and diagnosis-friendly.

### Tasks

1. Define the minimum runtime validation contract for `StreamingAudioUtteranceChunk`.
2. Add a validation helper at main IPC ingress.
3. Thread a structured validation error through logs/tests.
4. Add regression tests for null and malformed payloads.
5. Document the ingress guardrail in the research note or ADR.

### Gates

- The repro’s secondary null/sessionId crash shape is impossible after this PR.
- Valid utterances from the happy path still pass unchanged.
- Existing non-Groq ingress coverage still passes unchanged.
- Validation errors do not crash the main process.

### Code Snippet

```ts
if (!chunk || typeof chunk !== 'object' || typeof chunk.sessionId !== 'string') {
  throw new Error('Invalid streaming audio utterance chunk payload')
}
```

## Ticket T440-R4 (P2): PCM16 WAV Contract Enforcement -> PR-4

### Goal

Make the Groq utterance payload contract explicitly PCM16 WAV end to end so the renderer label, shared type, and main upload assumptions all match reality.

### Approach

- Lock the target contract now: Groq utterance payloads should be mono PCM16 WAV at `16 kHz`.
- Encode PCM16 explicitly in the renderer instead of relying on the browser-VAD default encoder format.
- Keep the current label only because the implementation is being changed to make that label true.
- Update renderer, shared types, and main adapter expectations together in one PR.
- Update or add a short decision note at the start of the PR to record why PCM16 remains the chosen contract.

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [ipc.ts](/workspace/.worktrees/fix/issue-440/src/shared/ipc.ts)
- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- renderer/main tests for WAV contract validation
- short decision note confirming the PCM16 contract

### Trade-offs

- Selected: one explicit WAV contract with test coverage.
  - Pro: removes a latent interoperability bug and makes uploads auditable.
  - Con: can require coordinated updates across renderer, main, and tests.
- Rejected: relabel the payload as float32 WAV and preserve the current encoder default.
  - Pro: smaller renderer change.
  - Con: keeps more provider-specific ambiguity and diverges from the intended payload contract.
- Rejected: keep the current label and assume Groq is tolerant enough.
  - Pro: zero product-visible churn.
  - Con: preserves a known lie in the contract.

### Checklist

- [ ] Actual encoded WAV format is verified from docs and tests.
- [ ] Shared type label matches the enforced PCM16 contract.
- [ ] Main upload path validates or safely trusts the corrected format.
- [ ] Tests cover the default encoder behavior and the chosen final contract.
- [ ] Existing `whisper.cpp` tests remain unchanged.
- [ ] Docs record why this contract was selected.

### Tasks

1. Verify the encoder API and default format against upstream docs/code.
2. Encode PCM16 explicitly in the renderer send path.
3. Keep or tighten the shared type to the enforced PCM16 contract.
4. Update main upload assumptions and tests.
5. Record the decision and migration rationale in a short ADR/note inside the PR.

### Gates

- Renderer and main agree on the same WAV format contract.
- The contract is backed by a test that inspects the encoded WAV header or encoder call path.
- Existing `whisper.cpp` tests still pass unchanged.
- No Groq upload test still depends on the old false label.

### Code Snippet

```ts
const wavBytes = encodeWAV(audio, 1, 16000, 1, 16)

return {
  wavBytes,
  wavFormat: 'wav_pcm_s16le_mono_16000',
}
```

## Ticket T440-R5 (P3): Time Semantics Correction -> PR-5

### Goal

Fix the misuse of monotonic timing as wall-clock timestamps and freeze the timing contract used by renderer utterances and emitted Groq segments.

### Approach

- Separate monotonic timing used for duration/order from wall-clock timing used for logs or persisted timestamps.
- Normalize emitted segment metadata so ISO timestamps only come from epoch-based clocks.
- Keep this PR out of logging cleanup or telemetry changes.

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [groq-rolling-upload-adapter.ts](/workspace/.worktrees/fix/issue-440/src/main/services/streaming/groq-rolling-upload-adapter.ts)
- logging/tests around segment timing
- research or ADR update for the timing contract

### Trade-offs

- Selected: split monotonic and epoch fields explicitly.
  - Pro: removes a correctness bug and improves observability.
  - Con: introduces more timestamp vocabulary.
- Rejected: keep the current fields and just avoid converting them to ISO strings.
  - Pro: smaller diff.
  - Con: leaves field semantics ambiguous.

### Checklist

- [ ] Duration/order math uses monotonic timing only.
- [ ] ISO timestamps come only from epoch values.
- [ ] Existing `whisper.cpp` timestamp/logging tests remain unchanged.
- [ ] Tests cover timestamp conversion semantics.
- [ ] Docs explain which fields are monotonic versus epoch-based.

### Tasks

1. Define the timing vocabulary for renderer utterances and main segments.
2. Update metadata fields or conversions so wall-clock timestamps are truthful.
3. Add regression tests for timestamp semantics.
4. Document the timing contract.

### Gates

- No code path calls `new Date(monotonicMs).toISOString()`.
- Segment timestamps are semantically correct in tests.
- Existing `whisper.cpp` logging/timestamp tests still pass.

### Code Snippet

```ts
const sealedAtEpochMs = Date.now()
const utteranceDurationMs = performance.now() - utteranceStartedMonotonicMs
```

## Ticket T440-R6 (P4): Minimal Repro Diagnostics -> PR-6

### Goal

Add one bounded, opt-in Groq utterance handoff trace that makes future local reproductions diagnosable without reopening the full stack.

### Approach

- Add one debug-only trace across utterance seal -> send -> main ingress.
- Fix the field budget up front so the trace stays reviewable:
  - `sessionId`
  - `utteranceIndex`
  - `reason`
  - `wavBytes.byteLength`
  - one timing field from the corrected timestamp contract
  - result status (`sent`, `rejected`, `fatal`)
- Keep it opt-in and Groq-only.

### Scope Files

- [groq-browser-vad-capture.ts](/workspace/.worktrees/fix/issue-440/src/renderer/groq-browser-vad-capture.ts)
- [register-handlers.ts](/workspace/.worktrees/fix/issue-440/src/main/ipc/register-handlers.ts)
- logging/tests around utterance handoff trace behavior
- short research note update documenting how to use the trace locally

### Trade-offs

- Selected: one fixed-field debug trace.
  - Pro: helps future debugging without broad telemetry expansion.
  - Con: still adds temporary-looking operational code that needs discipline.
- Rejected: broad logging expansion across the whole streaming stack.
  - Pro: more data when debugging future incidents.
  - Con: too much scope for a late, low-priority PR.

### Checklist

- [ ] The trace is opt-in, Groq-only, and bounded to the agreed field budget.
- [ ] The trace does not log raw audio or transcript text.
- [ ] Tests prove trace enable/disable behavior.
- [ ] Existing `whisper.cpp` logging tests remain unchanged.
- [ ] Docs explain how to enable and read the trace during local repro.

### Tasks

1. Add a single opt-in trace hook around utterance ready/send/main ingress.
2. Limit the fields to the agreed budget and omit content-bearing payload data.
3. Add tests for trace enable/disable behavior.
4. Document the local debugging flow that uses the trace.

### Gates

- The trace is disabled by default.
- The trace never logs audio bytes or transcript content.
- The trace adds no behavior changes outside Groq debug mode.
- Existing `whisper.cpp` logging tests still pass.

## Sequencing Notes

- `T440-R1` is intentionally renderer-only if possible. If the fix requires a small test seam elsewhere, keep it narrowly justified in the PR description.
- `T440-R2` and `T440-R3` can be worked in either order after `T440-R1`, but `T440-R2` is slightly higher priority because today’s logs actively mislead diagnosis.
- `T440-R4` should not start until the crash path and malformed-payload handling are fixed, or format debugging will stay noisy.
- `T440-R5` should stay constrained to timestamp semantics only.
- `T440-R6` should stay constrained to one opt-in handoff trace. It must not turn into a broad logging refactor.

## Exit Criteria

- The packaged repro no longer crashes after the first sealed utterance.
- Renderer and main logs truthfully distinguish user stop, user cancel, and fatal transport failure.
- Main ingress rejects malformed utterance payloads cleanly.
- Groq WAV payload type matches reality and is covered by tests.
- `whisper.cpp` regression coverage still passes across the Groq fix series.
- Segment timestamps are semantically correct.
- One opt-in Groq handoff trace exists for future local reproductions.
