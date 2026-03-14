---
type: research
status: archived
created: 2026-03-13
question: "What transcribe and transformation pipeline bugs are still live on current main after the reverted PR 481 fixes?"
review_by: 2026-03-20
tags:
  - transcription
  - transformation
  - bug-audit
---

<!--
Where: docs/research/2026-03-13-transcribe-transformation-pipeline-bug-audit.md
What: Current-main audit of the transcribe and transformation pipeline, cross-checked against reverted PR 481 fixes.
Why: Capture the live bugs that still exist after the wrong-branch PR was reverted, so future fix PRs can be scoped precisely.
-->

# Transcribe and Transformation Pipeline Bug Audit

Date: 2026-03-13

## Goal

Re-audit the current `main` branch transcribe and transformation pipeline, using the reverted PR 481 fixes as a clue source but validating every issue against the live codebase before treating it as a real bug.

## Scope

In scope:
- Batch capture flow: `recorded audio -> STT -> optional transform -> output commit -> history`
- Standalone transform flow: `clipboard/selection text -> transform -> output`
- Gemini transform adapter response parsing

Out of scope:
- Streaming transformed-session startup bugs from PR 481, because the later revert removed the streaming transformed lane from current `main`
- UI/editor behavior for prompt/profile editing, except where it directly affects runtime pipeline semantics

## Files Read In Full

Current `main` files:
- `specs/spec.md`
- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/shared/output-selection.ts`
- `src/main/core/command-router.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/orchestrators/preflight-guard.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/transform-pipeline.ts`
- `src/main/services/output-service.ts`
- `src/main/services/transcription-service.ts`
- `src/main/services/transformation-service.ts`
- `src/main/services/transformation/gemini-transformation-adapter.ts`
- `src/main/services/transformation/prompt-format.ts`
- `src/main/services/transformation/types.ts`
- `src/main/services/transcription/types.ts`
- `src/main/test-support/factories.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `src/main/orchestrators/transform-pipeline.test.ts`
- `src/main/services/transformation/gemini-transformation-adapter.test.ts`

Reference material from reverted PR 481:
- commit `86cd6df1a31f78154cac3f58e6d87f5ad8fcd4d7`
- `docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md` from that commit
- `docs/plans/2026-03-12-transcribe-transformation-pipeline-fix-plan.md` from that commit

## Current Flow Map

### 1. Batch capture flow

Entry:
- `CommandRouter.submitRecordedAudio()` in `src/main/core/command-router.ts`

Execution:
1. `recordingOrchestrator.submitRecordedAudio()` persists the capture.
2. `buildCaptureSnapshot()` freezes the STT settings, correction dictionary, output settings, and optional default transformation profile.
3. `CaptureQueue.enqueue()` runs `createCaptureProcessor()`.
4. `createCaptureProcessor()` in `src/main/orchestrators/capture-pipeline.ts`:
   - runs STT preflight
   - calls `TranscriptionService.transcribe()`
   - applies dictionary replacement
   - optionally calls `TransformationService.transform()`
   - picks text/output rule for commit
   - commits through `OrderedOutputCoordinator`
   - appends history and plays the completion sound

### 2. Standalone transform flow

Entry:
- `runDefaultCompositeFromClipboard()`
- `runCompositeFromClipboardWithPreset()`
- `runCompositeFromSelection()`

All three live in `src/main/core/command-router.ts`.

Execution:
1. `enqueueTransformation()` validates empty input and prompt safety.
2. `createTransformationRequestSnapshot()` freezes the chosen preset, source text, and output rule.
3. `TransformQueue.enqueue()` runs `createTransformProcessor()`.
4. `createTransformProcessor()` in `src/main/orchestrators/transform-pipeline.ts`:
   - runs LLM preflight
   - calls `TransformationService.transform()`
   - applies transformed output through `OutputService`
   - returns success or terminal error text

### 3. Gemini transform adapter

Entry:
- `TransformationService.transform()` in `src/main/services/transformation-service.ts`

Execution:
1. allowlist check for model
2. `GeminiTransformationAdapter.transform()` in `src/main/services/transformation/gemini-transformation-adapter.ts`
3. prompt assembly via `buildPromptBlocks()`
4. `fetch()` to Gemini `generateContent`
5. parse `candidates[0].content.parts[*].text`

## PR 481 Comparison

PR 481 was created from the wrong branch, but its March 12 fix commit is still useful as a defect inventory. After checking each item against current `main`:

- Still live on current `main`:
  - batch capture treats empty transformed output as success
  - batch capture fallback uses transcript destinations instead of preserving the selected transformed destinations
  - standalone transform treats empty transformed output as success
  - Gemini adapter truncates multipart output by reading only `parts[0]`

- No longer live / not relevant on current `main`:
  - transformed streaming-session startup preflight gap
  - reason: the streaming transformed lane was later removed from `main`, so the startup path audited in PR 481 does not exist in the current code anymore

## Findings

### 1. Batch capture treats empty transformed output as success and can emit blank output

Priority: P0
Severity: High

Evidence:
- `src/main/orchestrators/capture-pipeline.ts`
  - stores `result.text` directly into `transformedText`
  - uses `selectCaptureOutput(snapshot.output, transformedText !== null)`
- `src/shared/output-selection.ts`
  - considers any non-null transformed payload "available"
- current tests cover transform success/failure, but not empty or whitespace-only transform output

Why this is a bug:
- The batch pipeline only distinguishes `null` from non-`null`.
- If Gemini returns `''` or `'   '`, the code still marks transformed output as available.
- That means a valid transcript can be discarded in favor of a blank transformed payload.

Concrete failure mode:
1. STT succeeds and produces `"hello world"`.
2. Gemini returns `'   '`.
3. `transformedText !== null` is true.
4. The pipeline selects the transformed lane.
5. `OutputService` copies/pastes blank text.

Impact:
- Users lose a valid transcript even though transcription succeeded.
- Clipboard/paste targets can be overwritten by empty text.
- History stores a misleading transformed success path.

Root cause:
- Transform availability is modeled as "non-null" rather than "usable non-empty text".

What PR 481 had fixed:
- It introduced `hasUsableTransformText()` in the capture pipeline.
- It converted empty transform results into `transformation_failed`.
- It fell back to transcript text instead of blank transformed text.

Current status:
- The fix is absent on current `main`.

### 2. Batch capture fallback uses transcript destinations instead of preserving the selected transformed destinations

Priority: P0
Severity: High

Evidence:
- `src/shared/output-selection.ts`
  - `selectCaptureOutput()` couples text-source fallback and output-rule choice
  - when transformed text is unavailable, it returns `output.transcript`
- `src/main/orchestrators/capture-pipeline.ts`
  - uses that helper directly for final output commit
- current tests assert transcript-rule fallback, which matches the current implementation but not the safer behavior from PR 481

Why this is a bug:
- Runtime behavior silently depends on `output.transcript` and `output.transformed` always being identical.
- The UI currently tries to keep them aligned, but runtime code should not assume persisted data is always clean.
- Divergent settings can happen through:
  - legacy settings payloads
  - manual edits
  - future migrations
  - partial bugs in settings normalization

Concrete failure mode:
1. `selectedTextSource = transformed`
2. `output.transformed = { copyToClipboard: true, pasteAtCursor: false }`
3. `output.transcript = { copyToClipboard: false, pasteAtCursor: true }`
4. transform fails or returns empty output
5. current code applies transcript destinations, not the selected transformed destinations

Impact:
- Wrong side effects on failure-only paths
- Users see a paste when they expected a copy, or vice versa
- This is difficult to diagnose because it only happens on transformed fallback runs

Root cause:
- One helper chooses both the delivered text and the destination rule, even though those decisions need to be independent during fallback

What PR 481 had fixed:
- It switched capture fallback to:
  - choose transcript text when transformed output is unusable
  - still use `getSelectedOutputDestinations(snapshot.output)` for destinations

Current status:
- The fix is absent on current `main`.

### 3. Standalone transform treats empty transformed output as success

Priority: P0
Severity: High

Evidence:
- `src/main/orchestrators/transform-pipeline.ts`
  - assigns `result.text` directly to `transformedText`
  - immediately applies output with no emptiness check
- `src/main/orchestrators/transform-pipeline.test.ts`
  - has no empty-string or whitespace-only response test

Why this is a bug:
- Standalone transform has no transcript fallback.
- If Gemini returns empty or whitespace-only text, the pipeline should fail clearly.
- Current code instead reports success and applies blank output.

Concrete failure mode:
1. User runs transform-from-clipboard or transform-from-selection.
2. Gemini returns `''` or `'   '`.
3. `OutputService` copies/pastes blank text.
4. The result path still reports `status: 'ok'`.

Impact:
- Clipboard contents can be replaced with blank text.
- Paste-at-cursor can inject nothing while the app claims the transform succeeded.
- This is user-visible data loss.

Root cause:
- "Provider returned a response" is treated as equivalent to "provider returned usable transformed text"

What PR 481 had fixed:
- It added an explicit empty-transform check.
- It returned a typed error and skipped output application when the transformed text was empty.

Current status:
- The fix is absent on current `main`.

### 4. Gemini adapter truncates multipart output by reading only `parts[0]`

Priority: P1
Severity: Medium

Evidence:
- `src/main/services/transformation/gemini-transformation-adapter.ts`
  - parses `data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''`
- `src/main/services/transformation/gemini-transformation-adapter.test.ts`
  - has no multipart response test
- PR 481 changed this to concatenate all text-bearing parts from the first candidate

Why this is a bug:
- Gemini `generateContent` responses can legitimately contain multiple `content.parts`.
- Current code discards everything after the first part.
- It can also mis-handle cases where the first part is empty and later parts carry the actual answer.

Concrete failure mode:
1. Gemini returns parts `[ { text: '' }, { text: 'usable output' } ]`
2. current adapter reads only `parts[0]`
3. pipeline sees `''`
4. downstream flows either emit blank output or mis-classify the result

Impact:
- Truncated rewrites/translations
- Increased frequency of the empty-output bugs above
- Silent corruption rather than explicit failure

Root cause:
- The adapter assumes a one-part response structure

What PR 481 had fixed:
- It concatenated `(parts ?? []).map((part) => part.text ?? '').join('')`
- It added multipart regression tests

Current status:
- The fix is absent on current `main`.

## Findings Excluded As Not Live On Current Main

### Streaming transformed-session startup preflight

PR 481 also fixed a transformed-stream startup bug. I did not include that as a live finding because the later revert removed the current-main code path that previously started transformed streaming sessions. That issue was real on the old branch, but it is not actionable in the current codebase as checked on 2026-03-13.

## Priority Summary

| Priority | Bug | Reason |
|---|---|---|
| P0 | Batch empty transform output treated as success | can discard valid transcript and emit blank output |
| P0 | Batch fallback uses wrong destinations | can apply copy/paste side effects the user did not select |
| P0 | Standalone transform empty output treated as success | can overwrite clipboard/paste target with blank text |
| P1 | Gemini multipart output truncation | silently loses content and worsens empty-output failures |

## Recommended Fix Ordering

1. Fix batch and standalone empty-output handling first.
2. Fix capture fallback destination preservation second.
3. Fix Gemini multipart parsing third.

Rationale:
- The first three bugs are direct user-data-loss problems.
- The adapter fix is still important, but it becomes safer and easier to verify after the empty-output guardrails are in place.

## Suggested Regression Coverage

### Batch capture

- transformation returns `''` -> terminal status becomes `transformation_failed`
- transformation returns whitespace-only text -> fallback uses transcript text
- fallback still uses transformed-selected destinations when transcript/transformed rules diverge

### Standalone transform

- transformation returns `''` -> result is `error`, output is not applied
- transformation returns whitespace-only text -> result is `error`, output is not applied

### Gemini adapter

- multipart candidate concatenates all text parts
- empty first part does not hide later text parts
- missing/non-text parts do not truncate later text parts

## Confidence

Confidence: 0.90

Reasoning:
- All four live findings are directly grounded in current `main` runtime code.
- Each finding also lines up with a concrete fix that existed in PR 481 before the wrong-branch revert.
- I am confident the four findings above are live bugs, and confident that the old streaming preflight issue is not currently actionable on `main`.
