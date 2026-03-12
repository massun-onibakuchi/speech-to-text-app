<!--
Where: docs/decisions/2026-03-07-streaming-transformed-lane-fallback-routing-decision.md
What: Records the execution-lane decision for `stream_transformed`.
Why: PR-10 introduces the first transformed streaming implementation, so the
     fallback, ordering, and preset-binding rules need a durable reference.
-->

# Decision: `stream_transformed` Uses Ordered Commit With Raw Fallback

Date: 2026-03-07

## Status

Accepted and implemented in PR-10.

## Context

The streaming substrate already normalizes finalized STT segments and commits them in per-session source order.

PR-10 needed to add transformed streaming without:

- changing the existing batch raw dictation path
- changing the existing batch transformed-text path
- letting one segment transform failure end the streaming session
- letting out-of-order transform completion reorder paste side effects

## Decision

`stream_transformed` is implemented as a separate finalized-segment lane on top of the raw streaming substrate.

Rules:

- finalized raw segments remain the source of truth
- the default transformation preset is snapshotted at session start
- each finalized segment builds a structured context payload through `ContextManager`
- transformed segments run through a bounded `SegmentTransformWorkerPool`
- output side effects still commit through the per-session ordered coordinator
- if one segment transform fails or returns empty text, that segment falls back to raw text and the session continues

## Consequences

- transformed streaming and raw streaming now share one session/controller/provider surface
- provider adapters no longer need to reject `stream_transformed`, because the distinction now lives above the STT layer
- renderer segment activity can continue to consume one committed `text` field, regardless of whether the committed segment was transformed or raw fallback
- the current rolling-summary field is refreshed from older finalized source segments as a deterministic carry-forward baseline until a dedicated summary producer is added

## Trade-offs

- Selected: final-only transformed commit with raw fallback.
  - Keeps output ordering deterministic.
  - Avoids partial preview churn and rewrite flicker.
- Rejected: terminate the session on transform failure.
  - Too brittle for long dictation sessions.
- Rejected: make providers branch on transformed versus raw output mode.
  - Pushes app-owned output policy into STT adapters.
