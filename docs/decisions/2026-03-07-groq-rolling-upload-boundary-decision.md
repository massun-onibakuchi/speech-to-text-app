<!--
Where: docs/decisions/2026-03-07-groq-rolling-upload-boundary-decision.md
What: Decision note for the PR-7 Groq rolling-upload streaming architecture.
Why: The cloud baseline uses pause-bounded chunk uploads instead of a native
     provider session, so the chunk boundary and dedupe behavior must stay explicit.
-->

# Decision: Groq Rolling-Upload Boundary Contract

Date: 2026-03-07

## Context

- Official Groq speech-to-text docs currently expose file/URL transcription rather than a native realtime session API.
- The renderer already detects pause-bounded flushes and max-chunk rollover events.
- PR-7 needs a cloud baseline that stays honest about transport semantics while still fitting the shared streaming session controller.

## Decision

Groq streaming in PR-7 is implemented as `rolling_upload`, not `native_stream`.

- Renderer `flushReason` is carried across IPC on each streaming audio batch.
- Main groups batches into chunk uploads using those explicit boundaries.
- `speech_pause` and `session_stop` flushes upload clean chunk windows with no carryover overlap.
- `max_chunk` flushes preserve a bounded tail overlap for the next upload.
- Uploads may run in parallel, but result emission is drained in chunk order.
- Dedupe is timestamp-first when `verbose_json` segment metadata is present.
- Fallback dedupe trims repeated text prefixes when a chunk carries overlap but only plain text is available.

## Why This Approach

- It matches the approved product behavior:
  - keep recording active until explicit stop
  - upload on speaker pause
  - allow overlapping chunk jobs in flight
- It avoids inventing fake native streaming semantics for a file-based API.
- It keeps the Groq lane compatible with the provider runtime seam added in PR-6.

## Trade-offs

- Positive: clear transport semantics, explicit overlap behavior, and deterministic ordered output.
- Positive: easier future migration if Groq or another cloud provider adds a true realtime session API later.
- Negative: more moving pieces than a single batch upload.
- Negative: chunk-boundary metadata now becomes part of the renderer-to-main contract.

## Sources

- Groq speech-to-text docs: <https://console.groq.com/docs/speech-to-text>
- Groq audio transcriptions API: <https://console.groq.com/docs/api-reference#tag/audio/post/audio/transcriptions>
