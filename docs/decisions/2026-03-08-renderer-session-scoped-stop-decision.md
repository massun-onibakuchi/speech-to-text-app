<!--
Where: docs/decisions/2026-03-08-renderer-session-scoped-stop-decision.md
What: Decision record for session-scoped renderer stop handling in the streaming renderer runtime.
Why: Preserve the contract established in SSTP-01 while locking the renderer-side stale-command and stale-terminal-event behavior for SSTP-02.
-->

# Decision: Renderer Stop Handling Is Scoped to the Active Streaming Session

Date: 2026-03-08
Ticket: `SSTP-02`
PR: `PR-4`

## Context

`SSTP-01` added explicit streaming start/stop command variants and a bounded stop acknowledgement path. That removed the old raw `toggleRecording` ambiguity, but the renderer could still mis-handle delayed commands and delayed terminal session events because local teardown logic was not yet scoped to the active streaming `sessionId`.

## Decision

The renderer now treats the locally active streaming `sessionId` as the authority for stop/cancel execution and terminal capture teardown.

- explicit `streaming_stop_requested` commands are ignored when they do not match the active local session
- terminal `ended` / `failed` snapshots are ignored when they target an older session than the active local capture
- stop acknowledgement is emitted at most once for the matching local session
- a new streaming session clears the prior handled-stop marker

## Rationale

- A delayed stop for an old session must never stop a newer capture.
- A delayed terminal event for an old session must never cancel the current capture.
- Duplicate stop requests should not produce duplicate acknowledgements because main already has a timeout fallback.

## Trade-offs

- Renderer state becomes slightly more explicit because local stop handling now keeps a handled-stop marker in addition to the active session id.
- If renderer state ever loses the active session id entirely, a stale stop request is ignored and main falls back to the bounded timeout path instead of forcing a potentially wrong stop.
