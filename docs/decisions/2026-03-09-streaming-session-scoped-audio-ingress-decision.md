<!--
Where: docs/decisions/2026-03-09-streaming-session-scoped-audio-ingress-decision.md
What: Decision note for tightening streaming audio ingress identity and stop contracts.
Why: Prevent stale/non-owner audio injection and avoid silently treating failed explicit stops as successful.
-->

# Decision: Scope Streaming Audio Ingress To Session Owner And Fail Loudly On Stop Flush Loss

## Status

Accepted - March 9, 2026

## Context

Issue 440 review found two related contract problems in the streaming path:

- audio frame batches were forwarded into main without session identity or renderer ownership checks
- explicit `user_stop` could finish "successfully" even when the renderer failed to flush the final stop-time audio tail

Those bugs shared the same root cause: the main/renderer boundary trusted local state too much and did not make the active session explicit in the audio ingress contract.

## Decision

The streaming boundary is now tightened in three ways:

- renderer audio batches sent to main carry `sessionId`
- main accepts audio only from the registered owner window for that session
- direct `stopStreamingSession` IPC is reserved for fatal renderer cleanup; user-driven stop/cancel must keep using the recording-command handshake

Explicit renderer `user_stop` also now throws when stop-time worklet flush or transport fails, instead of swallowing the error and acknowledging stop anyway.

## Consequences

- stale or non-owner renderers can no longer inject audio into the active session
- "no renderer received start" no longer leaves main with an orphaned live session
- explicit stop failures surface as stop failures instead of silently truncating tail audio
- fatal cleanup still has a direct stop escape hatch when the renderer cannot participate in the normal ack path

## Trade-Offs

- the shared IPC batch contract is stricter and required touching tests across renderer and main
- a timed-out stop flush now fails loudly instead of pretending stop succeeded
- direct stop IPC becomes less general on purpose; convenience is traded away for a safer contract

## Out Of Scope

- fully canceling an IPC batch that already entered main before `user_cancel` was requested
- redesigning the AudioWorklet flush protocol beyond the current bounded timeout behavior
