<!--
Where: docs/decisions/shortcut-capture-stale-error-lifecycle.md
What: Decision record for clearing stale shortcut capture errors across fields.
Why: Prevent prior-field validation errors from persisting into a new capture session (#268).
-->

# Decision: Clear stale shortcut capture errors when switching fields

- Date: 2026-03-01
- Status: Accepted
- Related issue: #268

## Context
- Shortcut capture errors are rendered per field, but a prior failed capture on one field could remain visible after starting capture on another field.
- This created stale/irrelevant feedback and made the new active field appear invalid before capture input.

## Decision
- Starting a new `recording(newFieldId)` session resets capture error state to the new field only.
- Validation errors for the currently active field are preserved while that field remains in-session.

## Consequences
- Error visibility remains scoped to the active capture session.
- Starting capture on a different field clears stale error text immediately.
