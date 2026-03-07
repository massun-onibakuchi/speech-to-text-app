<!--
Where: docs/decisions/2026-03-07-streaming-control-plane-separate-ipc-decision.md
What: Decision note for separating streaming session IPC from batch audio submission.
Why: Keep the streaming control plane additive and avoid conflating live sessions with the existing batch blob path.
-->

# Decision: Streaming Uses a Separate Control Plane

## Status
Accepted — March 7, 2026

## Context

The shipped app already has a batch-oriented recording path:
- renderer-native capture
- blob submission through `submitRecordedAudio`
- batch STT, optional transform, then output

The approved streaming plan requires an additive lane that preserves that batch behavior while introducing:
- settings-driven `processing.mode=streaming`
- explicit session lifecycle commands
- session and segment event publication

## Decision

Streaming control-plane commands are separate from batch blob submission:
- `startStreamingSession`
- `stopStreamingSession`
- `onStreamingSessionState`
- `onStreamingSegment`
- `onStreamingError`

`submitRecordedAudio` remains batch-only and must reject `processing.mode=streaming`.

`runRecordingCommand` remains the hotkey/home entrypoint, but in streaming mode it routes to the streaming session controller instead of the renderer-driven native recording path.

## Consequences

- Existing batch raw dictation and transformed-text capture remain intact.
- Streaming can evolve through controller/runtime/provider PRs without reshaping the batch recorder contract.
- The renderer can subscribe to streaming activity before provider-specific audio transport exists.

## Out of Scope

- Real session state transitions
- Provider audio ingress
- Segment ordering/runtime transformation
