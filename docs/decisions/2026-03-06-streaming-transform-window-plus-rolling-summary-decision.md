<!--
Where: docs/decisions/2026-03-06-streaming-transform-window-plus-rolling-summary-decision.md
What: Architecture decision record for streaming transformed-text context strategy.
Why: Capture the selected approach (#3: sliding window + rolling summary), rationale, and alternatives in a shareable format.
-->

# Decision: Streaming Transform Context Strategy (#3 Window + Rolling Summary)

## Status
Accepted — March 6, 2026

## Goal
Adopt a real-time transformation strategy for streaming STT that keeps output quality stable while preserving low latency and predictable runtime cost.

## Assumptions
- Current production code is batch-oriented (`capture -> transcription -> optional transform -> output`) and does not yet implement streaming runtime paths.
- Streaming mode will transform finalized segments incrementally.
- LLM transformations are stateless per call unless explicit context metadata is provided.
- Full transcript context improves quality but can become too expensive for long sessions.
- The app must preserve ordered output side effects even when transform jobs complete out-of-order.

## Definition
Approach #3 (`window + rolling summary`) means each segment transformation request uses:
- `currentSegmentText`
- `recentSegmentsWindow` (last `N` finalized segments)
- `rollingSummary` (periodically refreshed compressed summary of earlier conversation)
- stable metadata (language hint, session/segment ids, delimiter policy)

The approach keeps token usage bounded while preserving both short-range and long-range context.

## Proposed Approaches
1. Full context per segment
- Send full transcript each time.
- Best continuity, worst latency/cost scaling.

2. Sliding window only
- Send current + last `N` segments.
- Low cost/latency, weaker long-range coherence.

3. Sliding window + rolling summary (selected)
- Send current + last `N` segments + rolling summary.
- Bounded cost with better long-range continuity.

4. Two-stage transform
- Fast incremental transform plus delayed whole-session refinement pass.
- Higher complexity and dual-output semantics.

5. Boundary-based transforms only
- Transform only at sentence/pause boundaries.
- Better readability, but delayed updates.

## Why #3 Is Recommended
- It addresses the core quality issue (context loss) without the O(n^2)-style growth from full-context replay.
- It aligns with streaming constraints: low-latency incremental output and bounded resource usage.
- It is provider-agnostic and can be implemented using additive components (new streaming path) without destabilizing the existing batch mode.
- It supports future tuning knobs (`window size`, `summary refresh cadence`, `token budget`) for EN/JA quality and latency trade-offs.
- It gives safer operational behavior for long sessions where full-context mode would degrade performance.

## Consequences
- Requires a dedicated streaming transformation path and context manager (not a small patch to the current batch transform pipeline).
- Requires new schema/IPC/runtime contracts and test coverage for segment ordering, summary drift handling, and replay/idempotency.
- Introduces tunables that must be documented and benchmarked.

## Out of Scope in This Decision
- No code changes yet.
- No provider lock-in decisions for long-lived conversational LLM sessions.
- No final values yet for `N`, summary interval, or token budget defaults.
