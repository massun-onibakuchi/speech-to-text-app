<!--
Where: docs/decisions/2026-03-07-streaming-final-segment-commit-substrate-decision.md
What: Decision note for canonical final-segment assembly and ordered streaming commits.
Why: Record the PR-5 substrate choice before provider adapters start emitting finalized segments.
-->

# Decision: Streaming Commits Use Canonical Final Segments with Per-Session Ordering

## Status
Accepted — March 7, 2026

## Context

PR-4 established renderer frame ingress, but it did not define how finalized provider output becomes app-owned ordered commits.

Without a shared substrate:
- each provider would normalize segments differently
- delimiter behavior would drift
- output ordering would be reimplemented per adapter
- paste automation behavior would stay tied to the permissive batch path

## Decision

The streaming commit substrate is:
- providers produce finalized segment candidates
- `SegmentAssembler` canonicalizes them into app-owned final segments
- delimiter policy is resolved during canonicalization
- ordered output uses a per-session scope, not the global batch queue scope
- streaming commits use paste-only output semantics through `OutputService.applyStreamingSegmentWithDetail`
- clipboard safety is explicit via `StreamingPasteClipboardPolicy`

Canonical final segments carry:
- `sessionId`
- `sequence`
- `sourceText`
- `delimiter`
- `startedAt`
- `endedAt`

Renderer-visible streaming segment events are published only for canonical finalized segments.

## Consequences

- Providers inherit one normalization and ordering path.
- Batch output ordering remains unchanged and still uses the global coordinator scope.
- Streaming output no longer depends on permissive clipboard behavior by default.
- `stream_transformed` remains blocked until the later transform substrate lands.

## Out of Scope

- Provider-side partial handling
- Streaming transforms and fallback-to-raw policy
- Provider buffering/retry behavior for pushed audio frames
