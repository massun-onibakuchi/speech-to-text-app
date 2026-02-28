<!--
Where: docs/decisions/activity-copy-success-confirmation-state.md
What: Decision record for temporary visual confirmation after Activity copy action succeeds.
Why: Ticket #229 adds explicit copy success feedback without changing activity data contracts.
-->

# Decision: Activity Copy Success Confirmation State

## Status
Accepted - February 28, 2026

## Context
The Activity tab copy action had no clear success acknowledgment. Users could click copy with no immediate visual confirmation.

## Decision
- Add per-activity-item transient copy-success UI state.
- Switch copy button icon from copy to checkmark only when clipboard write succeeds.
- Auto-reset the confirmation after a short timeout (`1500ms`).
- Keep failure behavior unchanged: no false success indication on clipboard errors.
- Manage timers at feed level and clear them on unmount.

## Consequences
- Copy success is explicit and immediate.
- Repeated copy clicks extend the confirmation window for the latest action.
- Timer cleanup prevents stale state updates after unmount.
