<!--
Where: docs/decisions/2026-03-08-streaming-ui-pending-state-decision.md
What: Decision record for streaming-specific pending-state recovery in the renderer UI.
Why: Capture why Home processing state now follows streaming lifecycle truth instead of relying only on the recording command promise.
-->

# Decision: Streaming UI Pending State Follows Lifecycle Truth

Date: 2026-03-08
Ticket: `SSTP-05`
PR: `PR-5`

## Context

The Home UI previously treated `pendingActionId` as the source of truth for `Processing...`. That worked for batch recording, but in streaming mode the renderer can receive terminal lifecycle truth before the original `runRecordingCommand()` promise settles. When that happened, the UI could remain stuck on `Processing...` even though the session had already ended or failed.

## Decision

Streaming mode now uses renderer-specific pending state:

- a short-lived streaming command token covers the gap before lifecycle snapshots arrive
- a `pendingStreamingSessionId` tracks the active streaming session while lifecycle truth is non-terminal
- terminal snapshots and local fatal cleanup clear streaming pending state directly
- batch mode keeps using `pendingActionId`

## Rationale

- The UI should leave `Processing...` when streaming lifecycle truth says the session is terminal, regardless of whether the original IPC promise has resolved.
- Streaming state is session-scoped, so the pending UI model also needs to be session-scoped.
- Keeping batch `pendingActionId` unchanged avoids unnecessary churn outside the streaming path.

## Trade-offs

- Renderer state gains a small amount of streaming-only bookkeeping.
- The app shell now derives streaming processing state instead of letting `HomeReact` infer it from `pendingActionId` alone.
- Late promise completions still exist, but they can no longer re-stick the streaming UI once lifecycle truth has cleared the session-scoped pending state.
