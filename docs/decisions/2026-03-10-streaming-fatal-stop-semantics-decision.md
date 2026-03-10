<!--
Where: docs/decisions/2026-03-10-streaming-fatal-stop-semantics-decision.md
What: Stop-reason contract for renderer/main streaming fatal cleanup.
Why: T440-R2 changes observable stop reasons and needs an explicit compatibility record.
-->

# Decision: Keep Fatal Streaming Cleanup Distinct From User Cancel

Date: 2026-03-10

## Context

The Groq browser-VAD renderer was reporting internal transport failures as
`user_cancel` because fatal cleanup called `cancel()`. The renderer also treated
terminal session updates with `state: failed` the same way as explicit
`user_cancel`, which hid the difference between user intent and internal
failure.

## Decision

Use this stop-reason contract:

| Origin | Renderer stop reason | Main/session reason |
|---|---|---|
| User presses cancel | `user_cancel` | `user_cancel` |
| User presses stop | `user_stop` | `user_stop` |
| Renderer capture/transport fails | `fatal_error` | `fatal_error` |
| Main/provider fails after a valid renderer send | `fatal_error` | `fatal_error` |

Implementation consequences for this ticket:

- Groq renderer fatal cleanup calls `stop('fatal_error')`, not `cancel()`
- renderer handling of terminal session snapshots calls `stop('fatal_error')`
  for failed/fatal sessions
- explicit `user_cancel` handling remains on the `cancel()` path

## Why

This preserves the existing user-cancel behavior while making logs and session
reasons truthful enough to debug transport failures.

## Deferred

This ticket does not change the main-process stop state machine beyond staying
compatible with the fatal reason. Payload validation and later transport
hardening remain in follow-up tickets.
