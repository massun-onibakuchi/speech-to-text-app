<!--
Where: docs/research/2026-03-07-groq-rolling-upload-dedupe-research.md
What: Research note for the PR-7 Groq rolling-upload dedupe and ordering strategy.
Why: Record the exact reasons PR-7 prefers timestamp-first dedupe with a text fallback.
-->

# Research: Groq Rolling-Upload Dedupe and Ordering

Date: 2026-03-07
Status: Implementation-backed research note for PR-7.

## Verified Inputs

- Groq supports `verbose_json` responses with segment-level timing metadata on the audio transcription endpoint.
- The renderer already detects pause-bounded chunk flushes and max-chunk rollover.
- Overlap is only needed when a chunk is cut because of `max_chunk`, not on clean speech pauses.

## Selected Strategy

1. Preserve flush boundaries from renderer to main via `flushReason`.
2. Upload chunks in parallel when flushes occur.
3. Hold completed chunk results until all earlier chunk indices are ready.
4. Emit finalized segments in chunk order.
5. Prefer segment timestamp dedupe when Groq returns `verbose_json` segment timing metadata.
6. Fall back to bounded text prefix trimming only when overlap exists and only plain text is available.

## Why Ordered Emission Matters

If chunk N+1 finishes before chunk N, immediate emission would break two things:

- output ordering in the session controller
- overlap dedupe state, because repeated text from chunk N+1 cannot be trimmed correctly until chunk N has been processed

PR-7 therefore allows parallel uploads but not parallel emission.
