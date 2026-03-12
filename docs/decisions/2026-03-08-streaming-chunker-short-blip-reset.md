<!--
Where: docs/decisions/2026-03-08-streaming-chunker-short-blip-reset.md
What: Decision note for resetting the renderer speech chunker after below-threshold speech followed by long silence.
Why: Prevent short noise or clipped speech from keeping a chunk armed and contaminating the next real utterance.
-->

# Decision: Reset The Streaming Chunker After Below-Threshold Speech

## Status
Accepted — March 8, 2026

## Context

The latest-dev streaming audit found that `StreamingSpeechChunker` would arm itself on any speech frame, but it only reset on:

- a valid `speech_pause` flush, or
- a `max_chunk` flush

That left one bad state path:

- short noise or clipped speech crosses the RMS threshold
- spoken duration never reaches `minSpeechMs`
- long silence follows
- the chunker stays armed
- later unrelated speech gets merged into the old chunk

## Decision

When total spoken duration is still below `minSpeechMs`, the chunker resets without flushing when either:

- trailing silence reaches the pause threshold, or
- the chunk lifetime reaches `maxChunkMs`

That reset is paired with an explicit renderer discard signal so already-buffered partial audio is cleared instead of being merged into the next real utterance.

## Consequences

- Below-threshold noise does not poison the next utterance.
- Already-buffered partial audio is dropped through an explicit `discard_pending` control batch instead of only resetting chunker-local timestamps.
- Existing pause-triggered flush behavior stays unchanged for real speech at or above `minSpeechMs`.
- `max_chunk` no longer overrides the below-threshold reset contract for silence-dominated chunks.
- Threshold semantics stay explicit:
  - below-threshold speech resets without output
  - at-threshold or longer speech may flush on pause

## Out Of Scope

- Retuning RMS thresholds
- Replacing pause-bounded chunking with a different VAD system
- AudioWorklet migration
