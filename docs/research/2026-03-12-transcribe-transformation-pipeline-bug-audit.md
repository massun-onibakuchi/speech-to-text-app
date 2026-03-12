<!--
Where: docs/research/2026-03-12-transcribe-transformation-pipeline-bug-audit.md
What: Deep bug audit of the batch transcription, standalone transformation, and streaming transformed-segment pipelines.
Why: Capture the current execution flow, validate likely failure points against code/spec, and produce an implementation-ready defect list before planning fixes.
-->

# Transcribe and Transformation Pipeline Bug Audit

Date: 2026-03-12
Scope:
- Batch capture pipeline: `capture -> transcribe -> optional transform -> output -> history`
- Standalone transform shortcuts: clipboard/selection -> transform -> output
- Streaming transformed lane: finalized segment -> transform worker -> ordered output commit

Files read in full:
- `readme.md`
- `specs/spec.md`
- `src/shared/domain.ts`
- `src/shared/output-selection.ts`
- `src/main/core/command-router.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/transform-pipeline.ts`
- `src/main/orchestrators/preflight-guard.ts`
- `src/main/services/transcription-service.ts`
- `src/main/services/transformation-service.ts`
- `src/main/services/output-service.ts`
- `src/main/services/transcription/groq-transcription-adapter.ts`
- `src/main/services/transcription/elevenlabs-transcription-adapter.ts`
- `src/main/services/transformation/gemini-transformation-adapter.ts`
- `src/main/services/transformation/prompt-format.ts`
- `src/main/services/transcription/dictionary-replacement.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/services/streaming/streaming-session-controller.ts`
- `src/main/services/streaming/streaming-segment-router.ts`
- `src/main/services/streaming/segment-transform-worker-pool.ts`
- related tests for the files above

External reference checked:
- Google Gemini API docs for `generateContent` response structure and `parts` handling: `https://ai.google.dev/api/generate-content`

## Flow Summary

## 1. Batch capture flow

Entry:
- `CommandRouter.submitRecordedAudio()` builds a frozen `CaptureRequestSnapshot` in `src/main/core/command-router.ts`.

Execution:
1. `CaptureQueue.enqueue()` serializes capture jobs.
2. `createCaptureProcessor()` in `src/main/orchestrators/capture-pipeline.ts`:
   - runs STT preflight
   - calls `TranscriptionService.transcribe()`
   - applies dictionary replacement
   - optionally runs LLM transformation
   - selects transcript or transformed output
   - commits output through `SerialOutputCoordinator`
   - appends history and plays completion sound

## 2. Standalone transform flow

Entry:
- `runDefaultCompositeFromClipboard()`, `runCompositeFromSelection()`, and `runCompositeFromClipboardWithPreset()` in `src/main/core/command-router.ts`

Execution:
1. A frozen `TransformationRequestSnapshot` is enqueued into `TransformQueue`.
2. `createTransformProcessor()` in `src/main/orchestrators/transform-pipeline.ts`:
   - validates prompt template
   - runs LLM preflight
   - calls `TransformationService.transform()`
   - applies transformed output
   - returns success/error status

## 3. Streaming transformed flow

Entry:
- `CommandRouter.startStreamingSession()` builds `StreamingSessionStartConfig`.
- `InMemoryStreamingSessionController.start()` wires a `StreamingSegmentRouter`.

Execution:
1. provider runtime emits finalized segments
2. `SegmentAssembler` normalizes them
3. `StreamingSegmentRouter.commitFinalizedSegment()`:
   - builds transform context
   - submits segment transform work to `SegmentTransformWorkerPool`
   - falls back to raw text on segment transform failure/empty output
   - commits through per-session ordered output coordinator

## Findings

## 1. Batch capture can treat empty transformed output as success and emit blank output

Severity: High

Evidence:
- `capture-pipeline.ts` stores `result.text` directly into `transformedText` without trimming or emptiness checks: lines 113-123.
- Output selection is keyed only on `transformedText !== null`: lines 149-152.
- `selectCaptureOutput()` treats any non-null transformed payload as available and uses `output.transformed`: `src/shared/output-selection.ts:18-25`.
- Spec requires transcript fallback when transformed text is unavailable: `specs/spec.md:269-271`.

Why this is a bug:
- If Gemini returns `''`, whitespace, or only formatting noise, batch capture will still select the transformed lane and emit blank clipboard/paste output.
- That violates the capture fallback contract: unavailable transformed text should fall back to transcript, not overwrite the user’s destination with emptiness.
- The streaming path already treats empty transform output as a failure/fallback case (`src/main/services/streaming/streaming-segment-router.ts:99-102`, `:157-166`), so batch and streaming currently disagree on the same semantic edge case.

Impact:
- Users can lose otherwise valid transcript output after a successful STT step.
- History records the run as transformed/succeeded even though the delivered text is empty.

Root cause:
- Availability is represented as non-null rather than non-empty normalized text.

Recommended fix direction:
- Normalize transformed text in both batch and standalone pipelines.
- Treat trimmed empty transformed output as unavailable.
- In batch capture, fall back to transcript and preserve destinations.

## 2. Capture fallback uses the transcript rule instead of preserving the selected transformed destinations

Severity: High

Evidence:
- `selectCaptureOutput()` returns `output.transcript` whenever transformed text is unavailable: `src/shared/output-selection.ts:18-25`.
- Batch capture uses that helper directly during output commit: `src/main/orchestrators/capture-pipeline.ts:149-152`.
- Spec requires transcript fallback while preserving configured destinations: `specs/spec.md:269-271`.
- The same spec only says the UI *should* keep transcript/transformed rules synchronized, not that runtime may assume they are always identical: `specs/spec.md:271`.

Why this is a bug:
- Runtime correctness currently depends on the transcript and transformed output rules being silently synchronized.
- If persisted settings diverge because of legacy data, manual edits, migration bugs, or future UI changes, a transformed-output fallback can use the wrong destinations.
- Example:
  - `selectedTextSource = transformed`
  - `output.transformed = { copyToClipboard: true, pasteAtCursor: false }`
  - `output.transcript = { copyToClipboard: false, pasteAtCursor: true }`
  - transform fails
  - current code pastes transcript at the cursor instead of copying it, which violates the configured transformed destination behavior

Impact:
- Wrong output side effects on transform failure.
- Hard-to-debug behavior because the wrong lane only appears on fallback runs.

Root cause:
- Output-source choice and destination choice are coupled in one helper, even though the spec treats them separately for fallback cases.

Recommended fix direction:
- Split the concerns:
  - choose the delivered text source
  - choose the destinations from the currently selected source
- Add tests with intentionally divergent `output.transcript` / `output.transformed` rules.

## 3. Standalone transform pipeline also treats empty transformed output as success

Severity: High

Evidence:
- `transform-pipeline.ts` assigns `result.text` directly to `transformedText`: lines 46-58.
- It applies output immediately with no normalization or emptiness validation: lines 84-104.

Why this is a bug:
- Standalone transform shortcuts can write empty text to the clipboard and/or paste target even when the model produced no usable content.
- Unlike batch capture, there is no transcript fallback available here, so the pipeline should fail clearly instead of reporting success with an empty payload.

Impact:
- Clipboard contents can be replaced with blank text.
- Paste-at-cursor can inject nothing while still reporting transformation success.
- The success sound/status path can become misleading.

Root cause:
- The transform pipeline equates “request returned” with “usable transformed text exists.”

Recommended fix direction:
- Normalize the transformed text before output.
- Return a typed transformation error when the result is empty after trimming.
- Add explicit tests for `''` and whitespace-only model responses.

## 4. Streaming transformed mode does not block on missing/invalid LLM preflight at session start

Severity: High

Evidence:
- `buildStreamingSessionConfig()` verifies only provider/transport/model/output mode and that a preset exists: `src/main/core/command-router.ts:408-435`.
- No LLM API-key or prompt preflight is performed during session start.
- `StreamingSegmentRouter` performs `checkLlmPreflight()` inside each segment worker instead: `src/main/services/streaming/streaming-segment-router.ts:75-85`.
- Spec says LLM request execution must be blocked when the required key is missing/invalid: `specs/spec.md:394-400`.
- Streaming spec says `stream_transformed` binds the default preset at session start, then falls back on per-segment transform failure: `specs/spec.md:813-815`.

Why this is a bug:
- Missing LLM configuration is not a per-segment transform failure; it is a request precondition failure.
- Today the user can start a `stream_transformed` session successfully, dictate for a while, and only then receive repeated per-segment raw fallback errors because the LLM key is absent.
- That behavior hides the real setup problem and downgrades a blocking configuration error into noisy runtime degradation.

Impact:
- Misleading success at session start.
- Repeated fallback noise for every finalized segment.
- Session behavior diverges from the preflight guarantees already enforced in batch and standalone transform flows.

Root cause:
- Streaming transformed preflight was pushed into the worker lane instead of being validated when the transformed session is bound.

Recommended fix direction:
- Add transformed-stream startup preflight in the command/router or controller startup path.
- Block session start with a clear error for missing/invalid LLM key or invalid prompt template.
- Keep raw fallback only for true per-segment runtime failures after session start.

## 5. Gemini adapter truncates multipart model output by reading only `parts[0]`

Severity: Medium

Evidence:
- `GeminiTransformationAdapter` extracts only `data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''`: `src/main/services/transformation/gemini-transformation-adapter.ts:50-54`.
- Google’s `generateContent` response schema allows multiple content parts, and official examples use the SDK’s aggregated text helpers rather than manually assuming a single part: `https://ai.google.dev/api/generate-content`.

Why this is a bug:
- Multipart responses are valid Gemini output.
- The current adapter will silently drop every text part after the first one.
- That can truncate longer rewrites/translations and makes downstream “empty output” handling worse if the first part is empty but later parts contain text.

Impact:
- Partial transformed output delivered to both batch and standalone flows.
- Incorrect history/output content without any visible error.

Root cause:
- The adapter flattens the response shape too aggressively.

Recommended fix direction:
- Concatenate all text-bearing parts from the first candidate.
- Add tests covering multipart candidate responses and empty-first-part cases.

## Secondary Risks

These are real risks but weaker than the five bugs above because they are either already partially mitigated or need a product decision before changing behavior.

## A. Queue pressure risk for standalone transforms

`TransformQueue` is intentionally concurrent but currently unbounded (`src/main/queues/transform-queue.ts`). Repeated shortcut spam can create unlimited concurrent LLM calls, which increases cost/rate-limit risk. This is worth tracking, but I would not fold it into the first defect-fix PR unless production behavior already shows it.

## B. Ordered output coordinator still relies on every caller releasing or submitting

`SerialOutputCoordinator` has no timeout or orphan recovery (`src/main/coordination/ordered-output-coordinator.ts`). Current capture code catches most known failures, so this is more of a resilience gap than a proven active bug in the reviewed pipeline.

## Bug Priority Summary

| Priority | Bug | Why |
|---|---|---|
| P0 | Batch empty transformed output is treated as success | can drop valid transcript and emit blank output |
| P0 | Capture fallback uses transcript destinations instead of selected destinations | violates spec and can produce wrong side effects |
| P0 | Standalone transform treats empty output as success | can overwrite clipboard/paste target with blank text |
| P0 | Streaming transformed mode skips start-time LLM preflight | allows invalid transformed sessions to start and degrade segment-by-segment |
| P1 | Gemini adapter truncates multipart output | silently loses content across all transform flows |

## Recommended PR Sequencing

1. Fix output-availability semantics for batch + standalone transform together.
2. Fix capture fallback destination routing and add divergent-settings tests.
3. Add streaming transformed start-time preflight and startup error coverage.
4. Fix Gemini multipart parsing and expand adapter tests.

## Suggested Regression Tests

- Batch capture:
  - transformed result `''` falls back to transcript
  - transformed result `'   '` falls back to transcript
  - fallback uses transformed-selected destinations even when transcript/transformed rules diverge
- Standalone transform:
  - empty transformed result returns error and does not apply output
- Streaming transformed:
  - missing Google key blocks session start before provider runtime starts
  - invalid prompt template blocks transformed session start
- Gemini adapter:
  - concatenates multiple `content.parts[].text`
  - ignores non-text/missing parts without truncating later text parts

## Confidence

Confidence: 0.87

I am confident in the five findings above because each one is directly grounded in current runtime code and, where relevant, cross-checked against the spec or provider documentation. The two secondary risks are intentionally separated because they are plausible failure modes but not yet as directly proven as the primary defects.
