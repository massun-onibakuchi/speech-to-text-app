<!--
Where: docs/research/2026-03-11-groq-live-mic-vad-fix-plan.md
What: Research-backed execution plan for stabilizing Groq live-mic browser-VAD continuation.
Why: Turn the root-cause report into reviewable PR-sized tickets with explicit scope,
     gates, risks, and approach choices before implementation begins.
-->

# Groq Live-Mic Browser-VAD Fix Plan

Date: 2026-03-11

Status: planning only, no implementation in this pass

Related investigation:

- [2026-03-11-groq-live-mic-vad-root-cause-report.md](/workspace/docs/research/2026-03-11-groq-live-mic-vad-root-cause-report.md)
- [2026-03-10-issue-440-groq-vad-repro-bug-audit.md](/workspace/docs/research/2026-03-10-issue-440-groq-vad-repro-bug-audit.md)
- [2026-03-10-groq-vad-bound-global-timers-decision.md](/workspace/docs/decisions/2026-03-10-groq-vad-bound-global-timers-decision.md)

## Executive Readout

The current failure is not best explained by Groq upload, ordered output, IPC
ownership, or renderer transcript rendering. The highest-confidence problem area
is the renderer capture layer in
[groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts),
which currently mixes two different owners of utterance boundaries:

1. upstream `MicVAD` callbacks such as `onSpeechStart`, `onSpeechEnd`, and
   `onVADMisfire`
2. a second local state machine built around `preSpeechFrames`, `liveFrames`,
   `confirmedSpeechSamples`, `speechDetected`, `speechRealStarted`, and
   `maxUtteranceMs`

That hybrid makes the normal pause-bounded utterance path harder to reason
about, harder to test deterministically, and more exposed to browser/audio
lifecycle drift. The root-cause report shows that missing utterances often never
reach `streaming.groq_vad.utterance_ready`, which bounds the primary failure to
the renderer capture side before the main-process job pipeline starts.

The plan below is intentionally shaped as one ticket per PR. Ticket order is
strict priority order, because later tickets either depend on or validate the
earlier architectural change. A separate escalation gate is included at the end,
but it is not a committable ticket until the earlier work fails.

## Non-Negotiable Planning Constraints

### Architecture constraints

- Preserve downstream utterance-job parallelism in
  [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts).
- Reduce renderer capture ownership to the minimum needed to create, encode, and
  send sealed utterances.
- Keep explicit stop behavior as a narrow exception path, not the main design
  center.
- Do not preserve backward-compatibility branches for the legacy hybrid capture
  path. Remove obsolete code instead of hiding it behind flags, fallbacks, or
  compatibility glue.
- Do not broaden scope into provider/output rewrites unless new evidence forces
  it.

### Delivery constraints

- One ticket equals one PR.
- Each PR must stay reviewable and reversible.
- Each non-trivial design change must leave a decision/research artifact.
- Each implementation PR must add focused automated coverage and update docs/QA.

### Evidence constraints

- `MicVAD` documents `onSpeechEnd(audio)` as the sealed utterance callback and
  documents `submitUserSpeechOnPause` as the option that makes `pause()` emit a
  sealed utterance or misfire event.
- `MicVAD` documents browser defaults of `positiveSpeechThreshold=0.3`,
  `negativeSpeechThreshold=0.25`, `redemptionMs=1400`, `preSpeechPadMs=800`,
  `minSpeechMs=400`.
- `MicVAD` documents `processorType: "auto"` as potentially falling back to
  `ScriptProcessorNode`, which it explicitly describes as less reliable.
- Upstream issue signals show real lifecycle fragility around stop/start,
  `onFrameProcessed`, manual stop with partial audio, and recent start/pause
  inconsistencies.

## Current System Map

### Renderer capture today

Current control flow in
[groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts):

```ts
MicVAD.new({
  submitUserSpeechOnPause: false,
  onFrameProcessed: (probabilities, frame) => handleFrameProcessed(probabilities, frame),
  onSpeechStart: () => handleSpeechStart(),
  onSpeechRealStart: () => {
    speechRealStarted = true
  },
  onVADMisfire: () => handleMisfire(),
  onSpeechEnd: async (sealedAudio) => {
    await handleSpeechEnd(generation, sealedAudio)
  }
})
```

The renderer then layers its own boundary logic on top:

```ts
if (liveSamples >= resolveMaxUtteranceSamples(config) && hasValidSpeechWindow()) {
  flushContinuationUtterance()
}
```

And also owns stop sealing itself:

```ts
await vad?.pause()
await awaitContinuationFlush()
await awaitActiveUtterancePush()
await flushStopUtterance()
```

### Main process today

The main process boundary is narrower:

- [streaming-session-controller.ts](/workspace/src/main/services/streaming/streaming-session-controller.ts)
  validates active-session ownership and forwards utterance chunks into the
  provider runtime.
- [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts)
  validates WAV contract, queues utterances, uploads each utterance
  independently, normalizes response text, and emits ordered final segments.
- [streaming-segment-router.ts](/workspace/src/main/services/streaming/streaming-segment-router.ts)
  commits transcript-first output independently of renderer capture.

The investigation strongly suggests those layers should remain mostly intact for
the first stabilization pass.

## Recommended Strategy

### Core decision

Make `MicVAD` the owner of normal pause-bounded utterance boundaries again.

That means:

- trust `onSpeechEnd(audio)` for the normal speech-pause case
- stop reconstructing the normal utterance from `onFrameProcessed`
- keep a small explicit-stop escape hatch if the user stops during active speech
- postpone long-utterance splitting until the normal multi-utterance path is
  stable

### Why this is the best first move

- It matches the upstream contract better.
- It matches the simpler reference app design described in the root-cause
  report.
- It removes the most failure-prone local state from the highest-timing-risk
  part of the system.
- It is feasible without rewriting the already-working downstream job pipeline.

### Approaches considered

#### Approach A: Keep the hybrid and add more guards

Rejected as the primary plan.

Why:

- We already have evidence that several downstream and edge-case guards were
  valid fixes but did not remove the main user-visible symptom.
- More local guards do not address the structural problem that two systems own
  the utterance boundary.

#### Approach B: Simplify renderer capture around `MicVAD`

Recommended first implementation path.

Why:

- Highest expected bug reduction per line changed.
- Keeps the successful main-process path intact.
- Produces the cleanest regression story.

#### Approach C: Fully replace `MicVAD`

Deferred contingency only.

Why not first:

- Highest implementation cost and test burden.
- Not justified until the thinner `MicVAD`-owned path is proven insufficient.

## Ticket Queue

## Ticket 1: Simplify Renderer Boundary Ownership And Add Merge-Blocking Regressions

Priority: P0

PR goal:

- Make the renderer capture layer a thin utterance producer for normal
  `speech_pause` cases so later utterances are not lost before they become jobs.

Checklist:

- Replace the current hybrid pause-boundary flow with `MicVAD`-owned
  `onSpeechEnd(audio)` for the normal case.
- Remove renderer ownership of normal utterance sealing via
  `liveFrames` and `confirmedSpeechSamples`.
- Delete the legacy hybrid path outright instead of preserving compatibility
  branches.
- Keep explicit stop flush as a narrow special case only.
- Park renderer-owned `maxUtteranceMs` behavior unless it can remain without
  owning normal utterance boundaries.
- Add only the minimum automated coverage required to merge safely.
- Add a decision note documenting the chosen boundary owner.

Tasks:

1. Refactor [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts)
   so `onSpeechEnd(audio)` is the default utterance source for
   `reason: "speech_pause"`.
2. Remove or reduce renderer-local fields whose only purpose is to recreate the
   normal utterance window:
   - `liveFrames`
   - `liveSamples`
   - `confirmedSpeechSamples`
   - `speechDetected`
   - `speechRealStarted`
   - `nextUtteranceHadCarryover`
3. Preserve only the minimum state needed for:
   - explicit stop while speech is still active
   - bounded backpressure logging
   - trace logging
4. Audit downstream assumptions that depend on `max_chunk` or `hadCarryover`,
   especially in:
   - [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts)
   - [groq-rolling-upload-adapter.test.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.test.ts)
5. Delete dead code, stale event reasons, and error paths that only existed to
   support the hybrid boundary owner.
6. Add/update renderer-side capture tests. If no dedicated capture test file
   exists yet, create one instead of overloading unrelated tests.
7. Add/update a decision artifact under `docs/decisions`.

Gates:

- Gate 1: No new code path may require both `onFrameProcessed` and
  `onSpeechEnd` to agree before a normal pause-bounded utterance is emitted.
- Gate 2: A deterministic test must prove multiple speech-pause utterances can
  be emitted in one session without reopening bugs caused by local carryover
  state.
- Gate 3: A deterministic test must prove explicit stop during active speech
  still produces at most one final utterance.
- Gate 4: For `user_stop`, exactly one of library pause emission or app
  stop-flush may produce the final utterance, never both.
- Gate 5: The design must still tolerate upload backpressure without re-owning
  utterance boundaries.
- Gate 6: The PR must end with fewer code paths, fewer legacy branches, and no
  dormant compatibility mode for the removed hybrid behavior.

Scope files:

- [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts)
- new or updated renderer capture test file under `/workspace/src/renderer`
- [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts) if
  `max_chunk` or carryover assumptions change
- [groq-rolling-upload-adapter.test.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.test.ts) if
  `max_chunk` or carryover assumptions change
- new decision note under `/workspace/docs/decisions`

Primary approach:

- Thin-wrapper capture design.

Target shape:

```ts
MicVAD.new({
  submitUserSpeechOnPause: true,
  onSpeechEnd: async (audio) => {
    await pushUtterance(audio, 'speech_pause', false)
  },
  onVADMisfire: () => {
    clearPendingStopOnlyState()
  }
})
```

Possible stop-only escape hatch:

```ts
async stop(reason) {
  await vad.pause()
  if (reason === 'user_stop' && stopFlushBuffer.hasSpeech) {
    await pushUtterance(stopFlushBuffer.audio, 'session_stop', false)
  }
  await vad.destroy()
}
```

Trade-offs:

- Benefit: far smaller state surface and clearer ownership.
- Benefit: closer to upstream and to the reference implementation.
- Cost: custom long-speech splitting may need to be paused or moved out of
  renderer capture for the first PR.
- Benefit: deleting the hybrid path reduces future bug surface and error-prunes
  the codebase.
- Cost: stop-flush behavior becomes a smaller but more explicit edge path.

Potential risks:

- If the app relies on `max_chunk` for latency under uninterrupted speech, there
  may be a temporary behavior regression unless that policy is isolated cleanly.
- If `submitUserSpeechOnPause: true` interacts badly with current stop flow,
  duplicate stop emissions become a concrete risk and must be covered by tests.
- If upstream `MicVAD` lifecycle instability is the dominant trigger rather than
  the hybrid ownership, this ticket may reduce but not fully eliminate the bug.

Exit criteria:

- The normal multi-utterance path no longer depends on local frame-window
  reconstruction.
- The PR contains only the architectural simplification plus merge-blocking
  regressions, not the broader harness expansion.
- The removed hybrid path is actually deleted rather than left behind behind a
  compatibility switch.

## Ticket 2: Expand Deterministic Harness And Integration Coverage

Priority: P1

PR goal:

- Prove the simplified capture design holds under the exact classes of failure
  reported by users: later utterance loss, active-stop flush, and no duplicate
  final utterance emission.

Checklist:

- Expand deterministic tests beyond the merge-blocking Ticket 1 set.
- Add fixture-driven tests around short pause, long pause, and stop-mid-speech.
- Add at least one integration test covering renderer-to-main utterance IPC with
  the simplified capture contract.
- Update manual QA docs for live-mic validation.

Tasks:

1. Create or expand a dedicated renderer capture test harness that can script
   `MicVAD` callback sequences without relying on real microphone timing.
2. Cover these cases:
   - a misfire does not poison the next valid utterance
   - longer scripted callback sequences keep emitting after repeated pauses
   - optional browser-timing approximations if the harness supports them
3. Add an integration test that proves the accepted utterance chunks still move
   through:
   - renderer capture
   - preload bridge
   - main IPC owner validation
   - active provider runtime ingress
4. Update [docs/qa/streaming-raw-dictation-manual-checklist.md](/workspace/docs/qa/streaming-raw-dictation-manual-checklist.md)
   for the new expected behavior.
5. Add a research or QA note if the deterministic harness exposes unresolved
   upstream lifecycle ambiguity.
6. Remove tests that only exist to preserve deleted hybrid behavior.

Gates:

- Gate 1: Ticket 2 must not weaken or duplicate the merge-blocking invariants
  already established in Ticket 1.
- Gate 2: The integration coverage must remain provider-agnostic enough to avoid
  coupling the regression to live Groq credentials.
- Gate 3: Manual QA must reflect the new expected pause/stop semantics.
- Gate 4: The harness should be reusable for future threshold and stop-path
  experiments instead of encoding the old hybrid state machine.
- Gate 5: Ticket 2 should prune obsolete test fixtures once Ticket 1 removes the
  legacy path.

Scope files:

- new or updated renderer capture tests under `/workspace/src/renderer`
- [src/preload/index.test.ts](/workspace/src/preload/index.test.ts)
- [src/main/ipc/register-handlers.test.ts](/workspace/src/main/ipc/register-handlers.test.ts)
- [src/main/services/streaming/streaming-session-controller.test.ts](/workspace/src/main/services/streaming/streaming-session-controller.test.ts)
- [docs/qa/streaming-raw-dictation-manual-checklist.md](/workspace/docs/qa/streaming-raw-dictation-manual-checklist.md)
- optional focused research note under `/workspace/docs/research`

Primary approach:

- Deterministic callback-sequence testing before more E2E expansion.

Illustrative harness shape:

```ts
fakeVad.emitSpeechStart()
fakeVad.emitSpeechEnd(audio0)
fakeVad.emitSpeechStart()
fakeVad.emitSpeechEnd(audio1)
fakeVad.emitSpeechStart()
fakeVad.emitSpeechEnd(audio2)

expect(pushedChunks.map((chunk) => chunk.reason)).toEqual([
  'speech_pause',
  'speech_pause',
  'speech_pause'
])
```

Trade-offs:

- Benefit: deterministic coverage catches regressions earlier than browser E2E.
- Benefit: isolates contract changes from flaky audio-device behavior.
- Cost: fake-VAD tests can miss genuine browser worklet regressions.
- Cost: one more test harness increases maintenance overhead.

Potential risks:

- Over-mocking may hide runtime timing issues if the fake VAD is too idealized.
- If the harness is built around old state-machine assumptions, it will encode
  the wrong contract.

Exit criteria:

- The simplified contract is expressed in tests clearly enough that future PRs
  can refactor internals without reopening the same bug family.

## Ticket 3: Re-tune Config And Decide The Fate Of `max_chunk`

Priority: P2

PR goal:

- Restore safer operating margins after the architectural simplification and
  decide whether long uninterrupted speech needs a separate chunking policy.

Checklist:

- Compare simplified behavior with current custom config versus upstream defaults.
- Decide whether `redemptionMs`, `preSpeechPadMs`, and `minSpeechMs` should move
  closer to documented defaults.
- Decide whether `maxUtteranceMs` remains disabled, moves downstream, or is
  reintroduced behind isolated logic.
- Update docs and tests for the chosen policy.

Tasks:

1. Measure the simplified capture path under current config values:
   - `redemptionMs: 900`
   - `preSpeechPadMs: 400`
   - `minSpeechMs: 160`
2. Compare behavior against upstream-documented defaults:
   - `redemptionMs: 1400`
   - `preSpeechPadMs: 800`
   - `minSpeechMs: 400`
3. Decide one of three `max_chunk` outcomes:
   - remove it from renderer capture entirely
   - reintroduce it as a downstream policy after sealed utterances exist
   - keep it renderer-side only if a narrowly isolated design proves necessary
4. Update config tests and docs.
5. Record the decision in a research/decision note because this is a real
   product-behavior trade-off.
6. Remove any config or docs knobs that only existed to preserve the deleted
   hybrid path.

Gates:

- Gate 1: No config retune starts before Ticket 1 and Ticket 2 stabilize the
  normal multi-utterance path.
- Gate 2: `max_chunk` cannot be reintroduced casually into the renderer if it
  re-creates a second utterance-boundary owner.
- Gate 3: Any new threshold decision must state the latency-versus-reliability
  trade-off explicitly.
- Gate 4: Evaluation must use explicit criteria, not general impressions:
  - later utterance recall across repeated pauses
  - short-phrase responsiveness
  - misfire rate
  - duplicate-stop rate
- Gate 5: The ticket must define which fixtures or scripted callback patterns
  are used to compare old versus new thresholds.

Scope files:

- [groq-browser-vad-config.ts](/workspace/src/renderer/groq-browser-vad-config.ts)
- [groq-browser-vad-capture.ts](/workspace/src/renderer/groq-browser-vad-capture.ts) only if config wiring changes
- capture tests under `/workspace/src/renderer`
- docs under `/workspace/docs/research` or `/workspace/docs/decisions`
- [docs/qa/streaming-raw-dictation-manual-checklist.md](/workspace/docs/qa/streaming-raw-dictation-manual-checklist.md)

Primary approach:

- Reliability-first retune after architecture stabilization.

Illustrative direction:

```ts
export const GROQ_BROWSER_VAD_DEFAULTS = {
  positiveSpeechThreshold: 0.3,
  negativeSpeechThreshold: 0.25,
  redemptionMs: 1400,
  preSpeechPadMs: 800,
  minSpeechMs: 400
}
```

Trade-offs:

- Benefit: larger thresholds can reduce edge-case loss and misfires.
- Cost: larger thresholds may add latency and may suppress very short intended
  utterances.
- Benefit: removing renderer-owned `max_chunk` reduces complexity sharply.
- Cost: uninterrupted long dictation may produce larger upload units.

Potential risks:

- Tuning too aggressively toward defaults may regress responsiveness for short
  phrases.
- Moving `max_chunk` downstream may require non-trivial overlap/trim semantics
  later in [groq-rolling-upload-adapter.ts](/workspace/src/main/services/streaming/groq-rolling-upload-adapter.ts).
- Deleting compatibility behavior can surface hidden callers quickly, so the
  ticket must prune stale references in the same PR.

Exit criteria:

- The team has an explicit, documented stance on thresholds and long-speech
  chunking after the simplified architecture lands.

## Escalation Gate: If Thin `MicVAD` Ownership Still Fails

This is not a queued PR ticket yet.

Use it only if Ticket 1 and Ticket 2 still leave a reproduced live-mic loss.

Required actions before any new implementation ticket is opened:

1. Re-run end-to-end instrumentation on the simplified path.
2. Decide one owner fully:
   - full trust in `MicVAD` with limited app logic
   - full app-owned detection from raw frames/audio
3. Reject any plan that reintroduces hybrid utterance-boundary ownership.
4. Write a new decision note covering migration cost, test burden, and browser
   support risk.
5. Split replacement work into new tickets instead of hiding it inside one
   oversized PR.

## Priority Rationale

1. Ticket 1 is first because it attacks the most likely root cause directly and
   keeps scope inside the failing subsystem.
2. Ticket 2 is second because architectural cleanup without deterministic
   regression coverage is too fragile to trust.
3. Ticket 3 is third because tuning a still-hybrid architecture risks optimizing
   the wrong thing.
4. The escalation gate is contingency only because replacement should require stronger
   evidence than we currently have.

## Feasibility Assessment

### High-feasibility work

- Ticket 1 is feasible because the upstream API already supports the intended
  normal-path contract and the downstream utterance job pipeline already works.
- Ticket 2 is feasible because the codebase already has strong utterance-level
  tests in preload, IPC, controller, and upload layers.

### Medium-feasibility work

- Ticket 3 is feasible but outcome-sensitive because threshold tuning changes UX
  feel and may require more manual validation.

### Low-feasibility or high-cost work

- The escalation gate is intentionally deferred because a full owner replacement is the
  most expensive path and should not be entered without fresh evidence.

## Main Risks Across The Plan

- The root cause could be partly upstream/browser lifecycle instability even
  after the renderer hybrid is removed.
- Stopping during active speech is the likeliest edge case to regress when
  `submitUserSpeechOnPause` semantics change.
- Long uninterrupted speech may expose the cost of removing renderer-side
  `max_chunk`.
- Test harnesses can accidentally encode old assumptions if they are not written
  against the new utterance-boundary contract.

## Recommended Starting PR

Start with Ticket 1 only.

That keeps the first PR tightly scoped to the failing subsystem, aligned with
the upstream contract, and small enough to review clearly. Ticket 2 should be
prepared immediately after, but not merged into the same PR unless the resulting
diff remains genuinely reviewable.

## Sources

- Existing local investigation:
  [2026-03-11-groq-live-mic-vad-root-cause-report.md](/workspace/docs/research/2026-03-11-groq-live-mic-vad-root-cause-report.md)
- Existing local audit:
  [2026-03-10-issue-440-groq-vad-repro-bug-audit.md](/workspace/docs/research/2026-03-10-issue-440-groq-vad-repro-bug-audit.md)
- Official `MicVAD` browser guide:
  https://docs.vad.ricky0123.com/user-guide/browser/
- Official `MicVAD` API docs:
  https://docs.vad.ricky0123.com/user-guide/api/
- Upstream lifecycle issue signal:
  https://github.com/ricky0123/vad/issues/71
- Upstream `onFrameProcessed` issue signal:
  https://github.com/ricky0123/vad/issues/144
- Upstream manual-stop issue signal:
  https://github.com/ricky0123/vad/issues/194
- Upstream lifecycle regression issue signal:
  https://github.com/ricky0123/vad/issues/234
- Upstream start/pause inconsistency issue signal:
  https://github.com/ricky0123/vad/issues/240
