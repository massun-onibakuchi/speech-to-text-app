<!--
Where: docs/decisions/2026-03-08-streaming-command-contract-and-ack-decision.md
What: Decision record for the explicit streaming command contract and renderer stop acknowledgement handshake.
Why: Capture the contract boundary chosen for SSTP-01 so later renderer/UI tickets consume the same protocol instead of redefining stop semantics again.
-->

# Decision: Explicit Streaming Command Contract and Bounded Renderer Stop Ack

Date: 2026-03-08
Ticket: `SSTP-01`
PR: `PR-3`

## Context

The old streaming flow reused batch-style `{ command: 'toggleRecording' }` dispatches for both start and stop. That made streaming stop ambiguous, let delayed stop commands be misread as fresh starts, and left main with no explicit point to wait for renderer capture teardown before finishing controller stop.

## Decision

We are keeping the batch recording dispatch shape unchanged and adding explicit streaming-only dispatch variants:

- `{ kind: 'streaming_start', sessionId, preferredDeviceId? }`
- `{ kind: 'streaming_stop_requested', sessionId, reason }`

We are also adding:

- direct renderer-to-main `stopStreamingSession({ sessionId, reason })`
- renderer-to-main `ackStreamingRendererStop({ sessionId, reason })`
- main-side stop wait bounded by `STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS = 1500`

## Rationale

- Batch recording consumers stay stable while streaming gets an unambiguous protocol.
- `sessionId` becomes the identity key for stop requests, stop acknowledgements, and stale-request rejection.
- Main can now wait for renderer teardown without risking an unbounded hang.
- Renderer fatal cleanup sends a targeted `fatal_error` stop for the active streaming session instead of a generic stop.

## Trade-offs

- Shared IPC churn is larger than a renderer-only fix.
- This PR introduces minimal renderer consumption of the new streaming commands so the protocol is exercised end to end.
- Main still needs a timeout fallback because renderer acknowledgement is best-effort, not guaranteed.

## Follow-on Work

- `SSTP-02` tightens renderer-side stale-session guards and stop execution details on top of this protocol.
- `SSTP-05` removes remaining stuck pending-state paths now that stop/session identity is explicit.
