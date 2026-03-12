<!--
Where: docs/decisions/2026-03-09-groq-ordered-utterance-upload-decision.md
What: Decision note for the T440-04 Groq adapter rewrite.
Why: The adapter no longer accumulates renderer frames, and this records why the
     first utterance-native version uses serial uploads and monotonic sequences.
-->

# Decision: Groq Adapter Is Utterance-Only And Serial In V1

## Status

Accepted on March 9, 2026.

## Context

Ticket `T440-03` introduced a dedicated Groq utterance IPC path and blocked Groq
frame batches at the controller boundary.

That left one remaining mismatch inside main: the Groq adapter still kept its old
frame-accumulation, overlap, and chunk-stride logic even though the renderer now
produces ready-to-upload WAV utterances.

## Decision

For `groq_whisper_large_v3_turbo`, the adapter now:

1. rejects `pushAudioFrameBatch(...)`
2. accepts only browser-VAD utterance chunks
3. enforces contiguous `utteranceIndex` ordering at ingress
4. uploads utterances one at a time in queue order
5. assigns final segment sequences with a simple monotonic `nextSequence++`

## Why This Is Acceptable

- It removes the last Groq dependency on renderer frame accumulation.
- Serial upload eliminates the old out-of-order completion and chunk-stride complexity.
- `utteranceIndex` stays responsible only for utterance ordering.
- Final segment numbering becomes gap-safe under normal drain because sequences are
  assigned only as segments are actually emitted.

## Trade-offs

- Pro: simpler ordering and easier reasoning during the migration.
- Pro: no overlap or stride policy is needed for ordinary utterances.
- Con: lower throughput than concurrent uploads on ideal networks.
- Con: queued utterances can build up behind one slow Groq request until later hardening.

## Follow-up

Ticket `T440-05` should add backpressure diagnostics and manual QA around slow
uploads, stop timing, and real microphone behavior.
