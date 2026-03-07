<!--
Where: docs/decisions/2026-03-07-streaming-session-state-machine-decision.md
What: Decision note for the first streaming session lifecycle state machine.
Why: Document the deterministic runtime behavior accepted in PR-3 before audio ingress and provider runtime are added.
-->

# Decision: First Streaming Session State Machine

## Status
Accepted — March 7, 2026

## Context

PR-2 introduced the streaming control plane and a controller interface, but the runtime behavior behind that interface was still a stub.

PR-3 needs one deterministic lifecycle contract that:
- allows one active session at a time
- publishes observable renderer events
- rejects duplicate starts
- keeps stop behavior safe before audio ingress/provider runtime exists

## Decision

The first controller lifecycle is:
- `idle -> starting -> active -> stopping -> ended`
- `starting|active|stopping -> failed` on fatal session failure

Additional rules:
- duplicate `start()` while state is `starting`, `active`, or `stopping` must emit an error event and reject
- `stop()` is idempotent when state is `idle`, `ended`, or `failed`
- `stop()` during an active session publishes `stopping` and then `ended`
- fatal failure publishes an error event and then `failed`

## Consequences

- The renderer can observe meaningful streaming session state before audio frame transport exists.
- Hotkey/home toggle semantics remain partially provisional until the real session runtime is connected to UI state and ingress.
- Provider adapters in later PRs get a stable lifecycle boundary for start, stop, and fatal failure.

## Out of Scope

- Audio frame ingress
- Segment assembly and ordering
- Provider-specific partial/final segment emission
