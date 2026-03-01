<!--
Where: docs/decisions/shortcut-capture-focus-cancel-state-contract.md
What: Decision record for shortcut-capture focus-loss cancellation state contract.
Why: Define deterministic cancel behavior for #267.
-->

# Decision: Shortcut capture uses a focus-loss cancel contract

- Date: 2026-03-01
- Status: Accepted
- Related issue: #267

## State contract
- Canonical states are `idle`, `recording(fieldId)`, `canceled(fieldId)`, `committed(fieldId)`, and `error(fieldId)`.
- Only `recording(fieldId)` is capture-active and intercepts key input.
- `canceled`, `committed`, and `error` are terminal states for a capture session and are not capture-active.

## Cancel transition rules
- Outside click during `recording(fieldId)` cancels capture in the same render cycle.
- `window.blur` during `recording(fieldId)` cancels capture in the same render cycle.
- Active input `blur` during `recording(fieldId)` cancels capture in the same render cycle.

## Consequences
- Shortcut capture cannot remain stuck in `Recording...` after focus leaves the active shortcut input.
- Downstream shortcut handling can rely on one capture-active source of truth.
