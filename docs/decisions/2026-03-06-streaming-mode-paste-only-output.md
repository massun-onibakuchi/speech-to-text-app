<!--
Where: docs/decisions/2026-03-06-streaming-mode-paste-only-output.md
What: Decision note defining streaming output as paste-only user behavior.
Why: Simplify streaming semantics and remove user-facing clipboard-mode complexity from the first streaming design.
-->

# Decision: Streaming Mode Uses Paste-Only Output Semantics

## Status
Accepted — March 6, 2026

## Context

Earlier streaming research and spec text allowed multiple streaming output combinations involving `copyToClipboard` and `pasteAtCursor`.

That expanded the design into a streaming clipboard-history problem:
- append vs create-new-entry behavior
- entry ownership and fingerprint tracking
- used-state detection across copy and paste combinations

The current implementation already uses the system clipboard as an internal transport for paste automation, but that does not mean clipboard behavior should remain a user-facing streaming contract.

## Decision

When `processing.mode=streaming`:
- streaming output is defined by `processing.streaming.outputMode`
- the app **MUST** force `pasteAtCursor=true` for the effective streaming output destination
- `copyToClipboard` **MUST NOT** be exposed as a user-configurable streaming option
- any clipboard write performed during streaming is an internal implementation detail of paste automation, not a user-visible “copy mode”

Supported streaming output modes:
- `stream_raw_dictation`: commit finalized source segments in order
- `stream_transformed`: commit transformed finalized segments in order, with raw fallback policy defined separately

## Consequences

- Streaming spec and research should no longer describe copy-only streaming behavior.
- The first streaming implementation does not need user-facing clipboard-entry append/new-entry semantics.
- Clipboard ownership/fingerprint tracking becomes optional implementation hardening rather than required product behavior for v1 streaming semantics.
- Output validation should reject or normalize any settings combination that implies streaming without paste-at-cursor enabled.

## Out of Scope

- Exact UI wording for streaming settings
- Final transform-failure fallback rules for `stream_transformed`
- Whether future versions reintroduce richer clipboard-history behavior
