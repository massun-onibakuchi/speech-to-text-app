<!--
Where: docs/decisions/2026-03-08-streaming-renderer-owner-of-record.md
What: Decision note for establishing a single renderer owner-of-record for streaming session start/stop dispatch.
Why: Prevent multi-window stop acknowledgements from completing the wrong session shutdown.
-->

# Decision: Track One Renderer Owner Of Record Per Streaming Session

## Status
Accepted — March 8, 2026

## Context

The latest-dev stop handshake only tracked `sessionId` + `reason`, while main broadcast streaming start/stop commands to every renderer window.

That made stop acknowledgement unsafe in multi-window cases:

- first matching ack won
- main could stop the session while the real capture owner was still draining

## Decision

Main now tracks one renderer owner window per streaming session.

- Renderer-initiated starts use the sender window as owner.
- Hotkey-initiated starts fall back to the focused renderer window, then the first open renderer window.
- Streaming start and stop commands are dispatched only to that owner window.
- Renderer stop acknowledgements are validated against the sender window ID before they resolve the pending stop wait.

## Consequences

- Non-owner renderer acks can no longer complete stop for another window.
- The start and stop paths now share one owner-of-record.
- Missing owner acks still fall back through the existing timeout path instead of hanging forever.

## Out Of Scope

- Cross-window renderer capture handoff
- Audio transport changes
- Startup cleanup or AudioWorklet migration
