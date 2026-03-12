<!--
Where: docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md
What: Priority-sorted execution plan for the transcribe/transformation pipeline bugs identified in the 2026-03-12 audit.
Why: Break the fixes into reviewable one-ticket-per-PR chunks before implementation.
-->

# Transcribe and Transformation Pipeline Fix Plan

Date: 2026-03-12
Research input:
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `specs/spec.md`
- `docs/decisions/2026-03-07-streaming-transformed-lane-fallback-routing-decision.md`

## Planning Rules

1. One ticket maps to one PR.
2. Tickets are sorted by priority and dependency.
3. Scope stays inside the audited bugs only.
4. No coding starts before this plan is reviewed.
5. Each ticket must land its own tests and docs updates; no leftover cleanup bucket.

## Review Status

- Internal sub-agent review completed and incorporated into this revision.
- Claude CLI second-opinion review was attempted via the `claude` skill, but the local CLI returned a quota block: `You're out of extra usage · resets 3am (UTC)`.

## Priority Order

| Priority | Ticket | PR | Dependency | Why now |
|---|---|---|---|---|
| P0 | T1 - Concatenate Multipart Gemini Responses | PR-1 | none | removes one known source of false-empty transform results before availability handling changes |
| P0 | T2 - Normalize Transform Output Availability in Batch + Shortcut Pipelines | PR-2 | T1 | prevents blank-output success once multipart parsing is correct |
| P0 | T3 - Preserve Selected Destinations During Capture Fallback | PR-3 | none | fixes spec-violating output side effects on transform failure |
| P0 | T4 - Block Invalid `stream_transformed` Sessions at Start | PR-4 | none | moves transformed-stream preflight to the correct lifecycle boundary |
| P1 | T5 - Cross-Flow QA Sweep and Audit Closeout | PR-5 | T1, T2, T3, T4 | verifies the full pipeline after the defect fixes land |

---

## T1 - Concatenate Multipart Gemini Responses (P0)

### Goal
Return the full transformed text from Gemini when the first candidate contains multiple text parts.

### Approach
- Flatten all text-bearing `parts` from the first candidate in order.
- Ignore missing/non-text parts safely.
- Preserve current candidate-selection behavior for now: first candidate only.

### Scope files
- `src/main/services/transformation/gemini-transformation-adapter.ts`
- `src/main/services/transformation/gemini-transformation-adapter.test.ts`
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md`

### Trade-offs
- Still only using the first candidate keeps the patch minimal.
- Full candidate-ranking logic is unnecessary for this bug and should stay out of scope.

### Code snippet (planned)
```ts
const transformedText = (data.candidates?.[0]?.content?.parts ?? [])
  .map((part) => part.text ?? '')
  .join('')
```

### Tasks
1. Update the adapter to concatenate all text parts from the first candidate.
2. Add a multipart-response test.
3. Add a case where the first part is empty and later parts contain text.
4. Update the audit/plan notes for this ticket when it lands.

### Checklist
- [ ] multipart Gemini responses are concatenated in order
- [ ] empty or missing parts do not truncate later text
- [ ] single-part behavior stays unchanged
- [ ] ticket-local docs notes are updated

### Gates
- [ ] `pnpm vitest run src/main/services/transformation/gemini-transformation-adapter.test.ts`

---

## T2 - Normalize Transform Output Availability in Batch + Shortcut Pipelines (P0)

### Goal
Make batch capture and standalone transform flows reject empty transformed output instead of treating `''` or whitespace-only text as successful transformed content.

### Approach
- Introduce one shared availability rule for transformed output:
  - use `trim()` only to decide whether text is available
  - preserve the original returned text when it is non-empty after trimming
- Batch capture:
  - if transformed output is unavailable, fall back to transcript
- Standalone transform:
  - if transformed output is unavailable, return an explicit transformation error and skip output application

### Scope files
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/transform-pipeline.ts`
- optionally new helper under `src/main/services/transformation/` or `src/shared/`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `src/main/orchestrators/transform-pipeline.test.ts`
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md`

### Trade-offs
- This avoids changing user-visible transformed text unless the result is effectively empty.
- The trade-off is that leading/trailing whitespace remains preserved for non-empty transforms, which keeps the patch minimal and avoids unintended formatting changes.

### Code snippet (planned)
```ts
const usableTransformedText = hasUsableTransformText(result.text)

if (!usableTransformedText) {
  // batch: transcript fallback
  // transform-only: explicit error
}
```

### Tasks
1. Add a shared helper that checks transform-text availability without rewriting non-empty text.
2. Update batch capture to use availability semantics instead of `transformedText !== null`.
3. Update standalone transform to fail fast when the returned result is unavailable.
4. Add tests for `''` and whitespace-only transformed outputs in both flows.
5. Update the audit/plan notes for this ticket when it lands.

### Checklist
- [ ] batch capture falls back when transformed output is empty
- [ ] standalone transform returns error when transformed output is empty
- [ ] output side effects do not run for empty standalone transform results
- [ ] tests cover both empty string and whitespace-only cases
- [ ] ticket-local docs notes are updated

### Gates
- [ ] `pnpm vitest run src/main/orchestrators/capture-pipeline.test.ts`
- [ ] `pnpm vitest run src/main/orchestrators/transform-pipeline.test.ts`

---

## T3 - Preserve Selected Destinations During Capture Fallback (P0)

### Goal
Ensure capture fallback from transformed text to transcript text keeps the destinations configured for the selected output source, even when persisted transcript/transformed rules diverge.

### Approach
- Keep the shared helper surface as stable as possible.
- Keep transcript fallback for text content.
- Preserve destinations from the currently selected source inside the capture pipeline instead of switching to `output.transcript` blindly.

### Scope files
- `src/main/orchestrators/capture-pipeline.ts`
- `src/shared/output-selection.ts` only if a minimal helper addition is actually required
- `src/main/orchestrators/capture-pipeline.test.ts`
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md`

### Trade-offs
- This favors a narrow pipeline fix over a wider shared-helper refactor.
- If a tiny helper addition is enough, use it; otherwise keep the selection logic local to capture.

### Code snippet (planned)
```ts
const selectedDestinations =
  snapshot.output.selectedTextSource === 'transformed'
    ? snapshot.output.transformed
    : snapshot.output.transcript

const outputText = hasUsableTransform ? transformedText : transcriptText
```

### Tasks
1. Implement the smallest change that preserves selected destinations on transform fallback.
2. Update capture pipeline to preserve selected destinations on transform fallback.
3. Add tests with intentionally divergent `output.transcript` and `output.transformed` rules.
4. Verify no regression for the synchronized-settings default case.
5. Update the audit/plan notes for this ticket when it lands.

### Checklist
- [ ] transform-fallback capture uses transcript text
- [ ] transform-fallback capture preserves selected destinations
- [ ] divergent legacy-style settings are covered by tests
- [ ] default synchronized settings still behave the same
- [ ] ticket-local docs notes are updated

### Gates
- [ ] `pnpm vitest run src/main/orchestrators/capture-pipeline.test.ts`

---

## T4 - Block Invalid `stream_transformed` Sessions at Start (P0)

### Goal
Move transformed-stream preflight to session startup so missing/invalid LLM prerequisites block session start instead of degrading every segment into runtime fallback noise.

### Approach
- Add transformed-stream startup validation inside `InMemoryStreamingSessionController.start()` before provider runtime creation and before the session publishes `starting`.
- Validate:
  - transformation profile is present
  - prompt template is safe
  - LLM provider/model are supported
  - required LLM API key is present
- Surface the startup failure back through the existing start-session call path so the renderer/main boundary reports the rejection instead of silently degrading into per-segment fallback.
- Keep per-segment raw fallback only for runtime transform failures after a valid session starts.

### Scope files
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/streaming-segment-router.ts` if worker preflight is narrowed after startup validation
- `src/main/services/streaming/streaming-session-controller.test.ts`
- one boundary-level test in either `src/main/core/command-router.test.ts` or `src/main/ipc/register-handlers.test.ts` to lock how the start failure surfaces
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md`

### Trade-offs
- Startup becomes stricter and may fail earlier.
- That is the correct behavior because missing configuration is a preflight failure, not a segment-level runtime failure.

### Code snippet (planned)
```ts
if (config.outputMode === 'stream_transformed') {
  const preflight = checkLlmPreflight(this.secretStore, profile.provider, profile.model)
  if (!preflight.ok) {
    throw new Error(preflight.reason)
  }
}
```

### Tasks
1. Implement controller-start preflight using the same rules as batch/shortcut transforms.
2. Ensure failure happens before provider runtime creation and before `starting` state publication.
3. Lock the user-visible failure boundary with one router- or IPC-level test for start-session rejection.
4. Keep worker fallback behavior only for post-start runtime transform failures.
5. Add tests proving missing key / unsafe prompt block session start.
6. Update the audit/plan notes for this ticket when it lands.

### Checklist
- [ ] `stream_transformed` start fails early when LLM key is missing
- [ ] `stream_transformed` start fails early when preset prompt is unsafe
- [ ] provider runtime does not begin when transformed-stream preflight fails
- [ ] one boundary-level test proves how the startup rejection surfaces to the caller
- [ ] per-segment fallback still works for real runtime transform failures
- [ ] ticket-local docs notes are updated

### Gates
- [ ] `pnpm vitest run src/main/services/streaming/streaming-session-controller.test.ts`
- [ ] `pnpm vitest run src/main/services/streaming/streaming-segment-router.test.ts`

---

## T5 - Cross-Flow QA Sweep and Audit Closeout (P1)

### Goal
Run the full targeted QA sweep after T1-T4 and close the audit with a final verification pass.

### Approach
- Do not defer core tests into this ticket; each earlier ticket must land its own tests.
- Use this PR only for:
  - combined targeted suite execution
  - any truly cross-ticket regression that cannot cleanly live in T1-T4
  - audit closeout notes after the fixes exist

### Scope files
- optional cross-ticket test files only if needed after T1-T4 land
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md`
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md`
- optional review note under `docs/reviews/` if a non-trivial issue emerges during implementation

### Trade-offs
- This keeps the final PR small and honest.
- If no true cross-ticket work remains, T5 can collapse into a QA-only closeout PR.

### Code snippet (planned)
```ts
expect(applyOutputWithDetail).not.toHaveBeenCalled()
expect(result).toEqual({
  status: 'error',
  message: expect.stringContaining('empty')
})
```

### Tasks
1. Run the combined targeted suite from T1-T4 and record outcomes.
2. Add a cross-ticket regression only if ownership truly spans multiple earlier PRs.
3. Re-read the touched pipeline code after implementation to ensure no hidden coupling remains.
4. Update plan/audit docs with implementation notes and final status.

### Checklist
- [ ] every audited bug is covered by ticket-local or justified cross-ticket regression coverage
- [ ] plan and research docs still match the implemented fix set
- [ ] no extra feature work leaked into the PR series

### Gates
- [ ] `pnpm vitest run src/main/orchestrators/capture-pipeline.test.ts src/main/orchestrators/transform-pipeline.test.ts`
- [ ] `pnpm vitest run src/main/services/streaming/streaming-segment-router.test.ts src/main/services/streaming/streaming-session-controller.test.ts`
- [ ] `pnpm vitest run src/main/services/transformation/gemini-transformation-adapter.test.ts`

## Ticket Feasibility Notes

- T1 is low complexity and isolated.
- T2 is low-to-medium complexity because it spans two flows but stays logic-local.
- T3 is low complexity but high correctness value because it removes a hidden runtime assumption.
- T4 is medium complexity because startup error propagation for streaming needs careful test coverage.
- T5 is low complexity but important for preventing regressions.

## Recommended Implementation Order

1. T1
2. T2
3. T3
4. T4
5. T5

Reasoning:
- T1 removes a known false-empty source before transform-availability semantics tighten.
- T2 and T3 address the most user-visible incorrect outputs in batch paths.
- T4 is still P0, but it touches more lifecycle wiring than the earlier fixes.
- T5 should close the series once behavior is stable.
