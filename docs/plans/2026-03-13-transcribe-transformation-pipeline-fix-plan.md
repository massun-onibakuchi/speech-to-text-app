<!--
Where: docs/plans/2026-03-13-transcribe-transformation-pipeline-fix-plan.md
What: Ticketed implementation plan for the current transcribe and transformation pipeline bugs revalidated after PR 481.
Why: Break the work into reviewable single-PR tickets with explicit scope, gates, trade-offs, and sequencing before any code changes begin.
-->

# Transcribe And Transformation Pipeline Fix Plan

Date: 2026-03-13
Plan source: `docs/research/2026-03-13-transcribe-transformation-pipeline-recheck.md`

## Planning Rules Used

- One ticket maps to one PR.
- Tickets are sorted by priority.
- No coding should start until this plan is reviewed and accepted.
- Each ticket includes goal, approach, scope files, trade-offs, checklist, tasks, and gates.

## Overview

### Recommended Delivery Order

1. Ticket P0-1: Reject empty transformed output in batch capture.
2. Ticket P0-2: Preserve selected destinations during capture fallback.
3. Ticket P0-3: Fail standalone transform requests on empty output.
4. Ticket P1-4: Concatenate multipart Gemini response text.

### Why This Order

- P0-1 and P0-2 protect the primary capture flow where transcript loss is most damaging.
- P0-3 protects direct transformation shortcuts from blank writes.
- P1-4 fixes silent truncation and reduces one source of empty-output failures, but it is less severe than the output-routing defects.
- This sequence intentionally stays aligned with the paired research document so each confirmed bug remains isolated to one PR.

### Sequencing Constraint

- P0-1 and P0-2 both modify the same output-selection block in `src/main/orchestrators/capture-pipeline.ts`.
- To keep `1 ticket = 1 PR` feasible, those two tickets must land sequentially from fresh `main`, not in parallel worktrees.
- Recommended branch sequence:
  1. merge P0-1
  2. create a new branch from updated `main`
  3. merge P0-2
  4. proceed with P0-3
  5. finish with P1-4

## Ticket P0-1: Reject Empty Transformed Output In Batch Capture

Priority: P0
PR scope: one PR

### Goal

Ensure the batch capture pipeline treats empty or whitespace-only transformation output as `transformation_failed`, keeps the transcript available, and avoids blank output side effects.

### Approach

- Add a narrow helper in `capture-pipeline.ts` that defines usable transformed text.
- Validate `result.text` immediately after the transformation service returns.
- If the transformed text is unusable:
  - keep `transformedText` as `null`
  - set `terminalStatus = 'transformation_failed'`
  - set `failureDetail = 'Transformation returned empty text.'`
  - set `failureCategory = 'unknown'` after verifying that label still exists in `src/shared/domain.ts`
- Preserve transcript fallback behavior and history recording.

### Scope Files

- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `specs/spec.md` only if the implementation review shows the empty-output rule should be made more explicit

### Trade-Offs

Pros:
- prevents blank output from replacing valid transcript content
- makes failure semantics explicit
- aligns runtime behavior with the transcript-preservation contract

Cons:
- increases the number of runs classified as transformation failures
- may expose previously hidden provider behavior in logs and history

### Checklist

- [ ] empty-string transformed output is treated as failure
- [ ] whitespace-only transformed output is treated as failure
- [ ] transcript fallback still applies output
- [ ] history records `transformedText: null`
- [ ] terminal status becomes `transformation_failed`
- [ ] completion sound follows failure semantics instead of success semantics
- [ ] tests cover `''` and whitespace-only responses

### Tasks

1. Add a `hasUsableTransformText()` helper or equivalent in `capture-pipeline.ts`.
2. Gate transformed-text assignment behind the helper.
3. Set explicit failure detail and category when the helper rejects the returned text.
4. Add empty-string and whitespace-only regression tests.
5. Re-read the pipeline to confirm no transcript-only behavior changed.

### Gates

Entry gate:
- none

Exit gate:
- `capture-pipeline` tests pass
- regression test proves transcript fallback still outputs the transcript
- no transcript-only capture behavior regresses
- manual post-merge QA confirms blank transformed capture output no longer clears the delivered text

### Snippet Direction

```ts
function hasUsableTransformText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0
}

if (hasUsableTransformText(result.text)) {
  transformedText = result.text
} else {
  terminalStatus = 'transformation_failed'
  failureDetail = 'Transformation returned empty text.'
  failureCategory = 'unknown'
}
```

## Ticket P0-2: Preserve Selected Destinations During Capture Fallback

Priority: P0
PR scope: one PR

### Goal

Ensure capture fallback uses transcript text with the currently selected transformed destinations instead of switching to transcript destinations.

### Approach

- Separate text-source choice from destination-rule choice.
- Keep destination selection anchored to `output.selectedTextSource`.
- Depend explicitly on the usable-transform guard from P0-1 instead of assuming that helper already exists.
- In the capture output commit:
  - choose transformed text only when it is usable
  - otherwise choose transcript text
  - always apply `getSelectedOutputDestinations(snapshot.output)`
- Audit whether `selectCaptureOutput()` still has a narrow, valid use after this refactor.
- If helper cleanup expands beyond the confirmed fallback bug, defer that cleanup to a separate follow-up ticket instead of widening this PR.

### Scope Files

- `src/shared/output-selection.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- the file that owns `hasUsableTransformText()` after P0-1 lands

### Trade-Offs

Pros:
- removes a runtime dependency on synchronized legacy fields
- matches the spec’s “same destination settings” rule
- makes the failure path deterministic even with divergent persisted settings

Cons:
- introduces slightly more explicit logic in the capture output stage
- may require helper cleanup in `output-selection.ts`

### Checklist

- [ ] transcript fallback uses transformed-selected destinations
- [ ] divergent transcript/transformed output rules are covered by a regression test
- [ ] existing tests that encode buggy fallback-destination behavior are rewritten, not merely extended
- [ ] transcript-selected capture behavior remains unchanged
- [ ] successful transformed capture behavior remains unchanged
- [ ] helper changes do not break renderer output-settings usage

### Tasks

1. Audit all `selectCaptureOutput()` callers.
2. Update the capture output commit to choose text and destinations separately.
3. Add a regression test with intentionally divergent `output.transcript` and `output.transformed` rules.
4. Re-read `output-selection.ts` and `capture-pipeline.ts` together for helper coherence.

### Gates

Entry gate:
- P0-1 is merged and the next branch starts from fresh `main`

Exit gate:
- regression test proves fallback uses the selected transformed destinations
- no standard synchronized-settings capture tests regress
- no renderer helper regressions are introduced by helper cleanup
- manual post-merge QA confirms divergent persisted destination rules still route transcript fallback through transformed-selected destinations

### Snippet Direction

```ts
const outputText =
  snapshot.output.selectedTextSource === 'transformed' && hasUsableTransformText(transformedText)
    ? transformedText
    : transcriptText

await deps.outputService.applyOutputWithDetail(
  outputText,
  getSelectedOutputDestinations(snapshot.output)
)
```

## Ticket P0-3: Fail Standalone Transform Requests On Empty Output

Priority: P0
PR scope: one PR

### Goal

Ensure clipboard and selection transform shortcuts treat empty or whitespace-only transformed output as a typed failure and do not apply output side effects.

### Approach

- Reuse the same “usable transformed text” rule as the capture fix.
- Validate transformed text before output application.
- Return an explicit error when the transformed output is unusable.
- Use `failureCategory: 'unknown'` only after confirming that label remains valid in `src/shared/domain.ts`.

### Scope Files

- `src/main/orchestrators/transform-pipeline.ts`
- `src/main/orchestrators/transform-pipeline.test.ts`

### Trade-Offs

Pros:
- prevents clipboard and paste targets from being blanked by empty model responses
- gives the shortcut flow a clear failure signal
- aligns standalone transform semantics with normalized-output expectations

Cons:
- introduces another explicit error case that downstream callers must surface
- duplicates the usability helper unless a later cleanup centralizes it

### Checklist

- [ ] empty-string transformed output returns `status: error`
- [ ] whitespace-only transformed output returns `status: error`
- [ ] output application is skipped for unusable transformed text
- [ ] preflight and thrown-error behavior remain unchanged

### Tasks

1. Add a `hasUsableTransformText()` helper or equivalent in `transform-pipeline.ts`.
2. Reject unusable transformed output before output application.
3. Add tests for `''` and whitespace-only results.
4. Re-run transform pipeline tests and confirm no success-path regressions.

### Gates

Entry gate:
- latest `main` is synced

Exit gate:
- transform pipeline tests pass
- regression test proves clipboard/paste output is not attempted on empty transformed output
- manual post-merge QA confirms empty transform results do not blank clipboard output

### Snippet Direction

```ts
if (!hasUsableTransformText(result.text)) {
  return {
    status: 'error',
    message: 'Transformation failed: Transformation returned empty text.',
    failureCategory: 'unknown'
  }
}
```

## Ticket P1-4: Concatenate Multipart Gemini Response Text

Priority: P1
PR scope: one PR

### Goal

Ensure the Gemini transformation adapter returns the full first-candidate text across all content parts instead of truncating at `parts[0]`.

### Approach

- Keep the existing “first candidate only” behavior.
- Concatenate all text-bearing parts from the first candidate in order.
- Ignore missing-text parts without failing the request.
- Preserve raw provider ordering with no injected separator so the adapter does not invent spaces or newlines that Gemini did not emit.

### Scope Files

- `src/main/services/transformation/gemini-transformation-adapter.ts`
- `src/main/services/transformation/gemini-transformation-adapter.test.ts`

### Trade-Offs

Pros:
- removes silent truncation
- prevents empty-first-part responses from being mistaken as fully empty output
- keeps the fix local to the adapter

Cons:
- preserves the existing first-candidate policy instead of revisiting candidate selection
- can expose latent formatting assumptions in downstream tests
- `join('')` keeps content faithful to provider-emitted parts, but it assumes the provider already includes any intended whitespace at part boundaries

### Checklist

- [ ] multipart responses are concatenated in order
- [ ] empty first part does not hide later usable text
- [ ] parts without `.text` are skipped without affecting later text concatenation
- [ ] existing adapter behavior for non-OK responses and base URL overrides stays unchanged

### Tasks

1. Add multipart response tests.
2. Add an empty-first-part regression test.
3. Update adapter parsing to concatenate all text parts from the first candidate.
4. Re-run adapter tests and the two pipeline test files to confirm no regressions.
5. Re-read the Gemini docs/examples before merging to confirm the no-separator join remains the safest choice.

### Gates

Entry gate:
- latest `main` is synced

Exit gate:
- Gemini adapter tests pass
- capture and transform pipeline tests still pass after the adapter change

### Snippet Direction

```ts
const transformedText = (data.candidates?.[0]?.content?.parts ?? [])
  .map((part) => part.text ?? '')
  .join('')
```

## Implementation Chunks

### Chunk 1

Ticket:
- P0-1

Step-by-step tasks:
1. Create a fresh worktree from `main`.
2. Patch `capture-pipeline.ts` only.
3. Add empty-output capture tests.
4. Run targeted capture tests.
5. Submit a PR limited to batch empty-output semantics.

### Chunk 2

Ticket:
- P0-2

Step-by-step tasks:
1. Create a fresh worktree from updated `main` after Chunk 1 merges.
2. Audit `selectCaptureOutput()` usage.
3. Patch fallback routing logic in the capture output commit.
4. Add divergent-settings regression coverage.
5. Submit a PR limited to destination-preserving fallback behavior.

### Chunk 3

Ticket:
- P0-3

Step-by-step tasks:
1. Create a fresh worktree from latest `main`.
2. Patch `transform-pipeline.ts` only.
3. Add empty-output standalone transform tests.
4. Run targeted transform tests.
5. Submit a PR limited to standalone transform empty-output handling.

### Chunk 4

Ticket:
- P1-4

Step-by-step tasks:
1. Create a fresh worktree from latest `main`.
2. Patch `gemini-transformation-adapter.ts`.
3. Add multipart adapter tests.
4. Run adapter plus pipeline regression tests.
5. Submit a PR limited to Gemini response assembly.

## Cross-Ticket Risks

- Tests may currently encode buggy behavior, especially in the capture fallback path.
- P0-1 and P0-2 touch the same function, so doing them in parallel will create avoidable merge churn.
- P1-4 may reduce the frequency of empty transformed output, but it does not remove the need for P0-1 or P0-3 because providers can still return truly empty content.

## Research Alignment

- P0-1 maps to finding 1 in `docs/research/2026-03-13-transcribe-transformation-pipeline-recheck.md`.
- P0-2 maps to finding 2 in `docs/research/2026-03-13-transcribe-transformation-pipeline-recheck.md`.
- P0-3 maps to finding 3 in `docs/research/2026-03-13-transcribe-transformation-pipeline-recheck.md`.
- P1-4 maps to finding 4 in `docs/research/2026-03-13-transcribe-transformation-pipeline-recheck.md`.
- The historical streaming-preflight finding from PR 481 is intentionally excluded because that runtime lane is not present on current `main`.

## Review Iteration Notes

- An earlier draft blurred the relationship between the batch and standalone empty-output fixes.
- The final plan keeps those as separate tickets so the rollback surface remains small and one bug still maps cleanly to one PR.
- P0-2 now states its dependency on P0-1 explicitly because the fallback patch relies on the usable-transform guard already existing.
- Each P0 ticket includes a manual post-merge verification step because this area does not have dedicated production telemetry today.

## Review Focus

The plan review should explicitly check:
- ticket granularity
- ticket priority
- feasibility
- potential risk
- proposed approaches

## Confidence

Confidence: 0.92

This plan is feasible because each ticket is small, testable, and directly grounded in a confirmed current bug. The main execution constraint is sequencing the two capture-pipeline tickets so each PR stays narrow and reviewable.
