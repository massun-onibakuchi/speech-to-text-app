<!--
Where: docs/plans/2026-03-10-groq-streaming-chunk-redesign-execution-plan.md
What: PR-sized execution plan for Groq raw dictation streaming-by-chunk redesign and E2E coverage.
Why: The current segment-first path is still dropping or hiding committed dictation, so implementation
     must proceed in ticket order against the redesigned utterance-commit model instead of ad hoc fixes.
-->

# 2026-03-10 Groq Streaming Chunk Redesign Execution Plan

Date: 2026-03-10
Status: Planned on `develop`. No runtime changes from this plan had started when this file was created.

## Problem Statement

Groq raw dictation is currently treated too much like fine-grained streaming. That creates the wrong failure
surface for a browser-VAD chunked provider:

- renderer can discard speech after VAD already sealed an utterance
- main can time out final commit work during `user_stop`
- output failure can mask otherwise successful transcription
- E2E coverage proves happy-path stubbing, but not the transcript-first contract or real `GROQ_APIKEY` wiring

The redesign keeps existing batch STT intact, but stops preserving backward compatibility inside streaming
internals for Groq raw dictation where the old segment-first model is the source of the bugs.

## Target Model

For Groq raw dictation:

1. renderer VAD seals one utterance
2. renderer sends one utterance chunk to main
3. main uploads and transcribes that utterance
4. app publishes committed transcript text immediately
5. output application runs afterward as best-effort
6. output failure is reported separately and must not hide the committed transcript

For existing batch STT:

- no behavior or contract change

## Priority Summary

| Priority | Ticket | PR | Goal | Feasibility | Main Risk |
|---|---|---|---|---|---|
| P0 | T1 | PR-1 | Freeze redesign contract and event model | High | Contract drift while code is changing |
| P1 | T2 | PR-2 | Fix renderer VAD utterance sealing and stop-tail handling | High | Regressing chunk boundaries or capture teardown |
| P2 | T3 | PR-3 | Fix Groq main-process commit/output ordering and stop drain | Medium | Session lifecycle races during stop |
| P3 | T4 | PR-4 | Fix and extend E2E using `GROQ_APIKEY` and transcript-first failure contract | High | Brittle live-provider assertions |
| P4 | T5 | PR-5 | Hardening, observability, and backlog accounting cleanup | Medium | Latency regressions under slow output |

## Ticket T1 (P0): Contract Freeze

### Goal

Freeze the redesigned Groq raw dictation contract before implementation continues.

### Approach

- treat Groq browser VAD as utterance-chunk ingestion, not pseudo realtime segment streaming
- keep existing `StreamingSegmentEvent` output for renderer transcript display during transition
- add committed-transcript and output-failure events where needed to preserve transcript-first semantics
- explicitly allow streaming-internal breakage from the old Groq path while keeping batch STT unchanged

### Scope Files

- `docs/plans/2026-03-10-groq-streaming-chunk-redesign-execution-plan.md`
- `docs/decisions/2026-03-10-groq-raw-dictation-streaming-redesign-decision.md`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/streaming/types.ts`
- `src/main/services/streaming/streaming-session-controller.ts`

### Trade-offs

- Selected: provider-specific Groq raw contract.
  - Pro: matches actual provider behavior and makes tests honest.
  - Con: more IPC surface and less internal backward compatibility.
- Rejected: keep overloading the existing segment-only contract.
  - Pro: smaller short-term diff.
  - Con: preserves the current ambiguity between transcription success and output success.

### Checklist

- [ ] contract states that Groq raw dictation is utterance-commit oriented
- [ ] transcript success and output failure are modeled separately
- [ ] stop reasons use `user_stop` and not leaked internal aliases
- [ ] existing batch STT is explicitly out of scope

### Tasks

1. Add or update the redesign decision record.
2. Freeze IPC and controller vocabulary for utterance commit and output failure.
3. Add tests that lock the shared contract and listener wiring.

### Gates

- shared types compile cleanly
- tests lock the public surface before runtime changes continue
- reviewers can answer: "When transcription succeeds but output fails, what does the renderer receive?"

### Code Snippet

```ts
type StreamingUtteranceCommitReason = 'speech_pause' | 'max_chunk' | 'user_stop'

interface StreamingUtteranceCommittedEvent {
  sessionId: string
  utteranceIndex: number
  text: string
  reason: StreamingUtteranceCommitReason
}

interface StreamingOutputFailureEvent {
  sessionId: string
  utteranceIndex: number | null
  message: string
}
```

## Ticket T2 (P1): Renderer VAD Chunk Capture

### Goal

Remove renderer-side utterance loss after `MicVAD` already decided speech ended.

### Approach

- trust the sealed `onSpeechEnd(audio)` payload for pause-bounded commits
- keep local frame accounting only for explicit stop-tail flush and diagnostics
- preserve stop/cancel teardown barriers

### Scope Files

- `src/renderer/groq-browser-vad-capture.ts`
- `src/renderer/groq-browser-vad-capture.test.ts`
- `src/renderer/groq-browser-vad-config.ts`

### Trade-offs

- Selected: trust VAD callback audio.
  - Pro: aligns with provider library semantics and removes double-gating.
  - Con: less local opportunity to second-guess bad VAD callbacks.
- Rejected: re-derive speech validity only from the renderer shadow buffer.
  - Pro: feels internally consistent.
  - Con: this is one of the observed loss points.

### Checklist

- [ ] natural pause path uses sealed callback audio
- [ ] explicit stop still flushes short trailing speech when appropriate
- [ ] `max_chunk` continuation does not erase the final tail
- [ ] tests cover both pause and explicit-stop edge cases

### Tasks

1. Thread callback audio through `handleSpeechEnd`.
2. Replace post-VAD speech validation on the natural pause path with a minimal sealed-audio sanity check.
3. Add a stop-specific speech window check for trailing flush behavior.
4. Add regression tests for callback-audio trust and `max_chunk` tail preservation.

### Gates

- renderer unit tests pass
- stop path still destroys the VAD cleanly
- no new capture API surface is introduced

### Code Snippet

```ts
onSpeechEnd: async (sealedAudio) => {
  const generation = this.callbackGeneration
  await this.handleSpeechEnd(generation, sealedAudio)
}
```

## Ticket T3 (P2): Main Groq Commit and Stop Drain

### Goal

Make Groq utterance commit transcription-first, and ensure `user_stop` drains already uploaded utterances instead of dropping them.

### Approach

- stop applying the 3s stop budget to normal commit processing
- use the stop budget only for upload drain
- await final commit/output drain after uploads settle
- fall back to top-level Groq `text` when `segments` is present but unusable
- keep output failure reporting separate from committed transcript publication

### Scope Files

- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/groq-rolling-upload-adapter.test.ts`
- `src/main/services/streaming/streaming-segment-router.ts`
- `src/main/services/streaming/streaming-segment-router.test.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/streaming-session-controller.test.ts`

### Trade-offs

- Selected: transcription-first commit semantics.
  - Pro: reflects what users care about when dictation succeeds.
  - Con: output failures become a second event the UI must handle.
- Rejected: tie session success to output success.
  - Pro: fewer states.
  - Con: hides working transcription behind unrelated paste/platform failures.

### Checklist

- [ ] `user_stop` drains uploaded utterances through commit/output
- [ ] active-session commits are never stop-budget timed
- [ ] top-level Groq text fallback works when segment payload is unusable
- [ ] output failure does not suppress committed transcript delivery

### Tasks

1. Restrict the stop budget to upload drain only.
2. Await `finishStopDrain()` after upload drain completes.
3. Normalize Groq commit reasons and stop leaking `session_stop`.
4. Add verbose-json text fallback when segments are unusable.
5. Extend controller/router tests around late commit plus output failure during stop.

### Gates

- targeted streaming unit tests pass
- no late committed utterance is lost during `user_stop`
- renderer-visible transcript survives output failure

### Code Snippet

```ts
const outcome = await Promise.race([
  uploadDrainPromise.then(() => 'completed' as const),
  this.stopBudgetDelayMs(GROQ_USER_STOP_BUDGET_MS).then(() => 'timed_out' as const)
])

if (outcome === 'completed') {
  await this.finishStopDrain()
}
```

## Ticket T4 (P3): E2E With `GROQ_APIKEY`

### Goal

Make Groq streaming E2E reflect the redesigned contract and run both deterministic and optional live-provider coverage with `GROQ_APIKEY`.

### Approach

- keep stubbed synthetic/fake-audio tests for deterministic CI
- add an output-failure contract test that proves transcript-first behavior
- read `GROQ_APIKEY` from process env or `/workspace/.env`
- keep live-provider assertions broad enough to be stable across real Groq transcript variations

### Scope Files

- `e2e/electron-groq-streaming-recording.e2e.ts`
- `.github/workflows/e2e-playwright-electron.yml`
- `docs/e2e-playwright.md`

### Trade-offs

- Selected: contract-level live assertions.
  - Pro: stable across provider wording variance.
  - Con: does not assert exact transcript strings from live Groq.
- Rejected: exact-text assertions against live-provider responses.
  - Pro: stronger signal if stable.
  - Con: too brittle for CI.

### Checklist

- [ ] spec reads `GROQ_APIKEY` from env or `/workspace/.env`
- [ ] live-provider path is optional in CI
- [ ] deterministic contract test proves transcript survives output failure
- [ ] docs explain both deterministic and live Groq paths

### Tasks

1. Add `.env` and env-variable fallback helper in the E2E spec.
2. Add `@output-failure-contract` deterministic test.
3. Add optional live-provider CI lane or step using `GROQ_APIKEY`.
4. Update E2E docs with local and CI invocation details.

### Gates

- `playwright --list` shows the new tests
- deterministic Groq E2E passes locally/CI
- live-provider path is opt-in and does not run without credentials

### Code Snippet

```ts
const groqApiKey = process.env.GROQ_APIKEY ?? readWorkspaceEnv('GROQ_APIKEY')

test('keeps streamed text visible when output fails after Groq utterance commit @output-failure-contract', async () => {
  await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible()
  await expect(page.getByText(/Streaming output failed:/)).toBeVisible()
})
```

## Ticket T5 (P4): Hardening and Observability

### Goal

Clean up the remaining latency accounting and observability risks after the core flow is fixed.

### Approach

- separate upload backlog from downstream output latency
- improve activity events for utterance commit versus output failure
- add targeted diagnostics for queue saturation and stop drain timing

### Scope Files

- `src/main/services/streaming/groq-rolling-upload-adapter.ts`
- `src/main/services/streaming/streaming-activity-publisher.ts`
- `src/renderer/**` activity consumers if needed
- docs and test files adjacent to the touched code

### Trade-offs

- Selected: more precise metrics and logs.
  - Pro: easier to debug future field failures.
  - Con: extra event surface and maintenance.
- Rejected: leave backlog and output latency conflated.
  - Pro: no more code.
  - Con: hides the next class of throughput bugs.

### Checklist

- [ ] queue/backpressure reflects upload pressure, not paste latency
- [ ] activity log distinguishes transcript commit from output failure
- [ ] tests cover backlog and observability semantics

### Tasks

1. Audit queue capacity accounting against upload and emit phases.
2. Split or rename diagnostics where needed.
3. Add tests for slow output versus full upload queue.
4. Document remaining operational risks.

### Gates

- queue saturation logs match the actual bottleneck
- no new user-facing regressions in Activity

## Exit Criteria

- deterministic Groq chunk E2E passes
- optional live Groq E2E passes when `GROQ_APIKEY` is configured
- renderer no longer drops VAD-sealed utterances
- `user_stop` no longer loses already-uploaded Groq utterances
- output failure is visible without hiding committed transcript
- existing batch STT tests continue to pass unchanged
