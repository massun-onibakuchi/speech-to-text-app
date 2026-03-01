<!--
Where: docs/decisions/shortcut-capture-focus-cancel-state-contract.md
What: Decision record for shortcut-capture focus-loss cancellation and error lifecycle.
Why: Keep #267 and #268 aligned to one capture-state contract and avoid stale UI errors.
-->

# Decision: Shortcut capture uses a focus-loss cancel contract and field-scoped error lifecycle

- Date: 2026-03-01
- Status: Accepted
- Related issues: #267, #268

## State contract
- Canonical states are `idle`, `recording(fieldId)`, `canceled(fieldId)`, `committed(fieldId)`, and `error(fieldId)`.
- Only `recording(fieldId)` is capture-active and intercepts key input.
- `canceled`, `committed`, and `error` are terminal states for a capture session and are not capture-active.

## Cancel transition rules
- Outside click during `recording(fieldId)` cancels capture in the same render cycle.
- `window.blur` during `recording(fieldId)` cancels capture in the same render cycle.
- Active input `blur` during `recording(fieldId)` cancels capture in the same render cycle.

## Error lifecycle rules
- Validation/capture errors are scoped to the active field session.
- Starting a new recording on a different field clears stale error text from the previous field immediately.
- For the same active field, validation errors remain visible until the session is canceled or a valid shortcut is committed.

## Consequences
- Shortcut capture cannot remain stuck in `Recording...` after focus leaves the active shortcut input.
- Error feedback no longer leaks between shortcut fields.
- Downstream shortcut handling can rely on one capture-active source of truth.
