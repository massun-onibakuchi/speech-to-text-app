# Decision: Issue #305 Settings Output Radix Card-Click Contract

- **Date:** 2026-03-04
- **Status:** Accepted
- **Related Issue:** #305 (PR2 scope)

## Context

`settings-output-react.tsx` previously relied on native hidden inputs so clicking anywhere on the card toggled the corresponding option. During Radix migration (`RadioGroupItem` + `Switch`), this card-surface behavior must remain intact.

## Decision

- Keep card containers as explicit click targets (`onClick`) for both source and destination cards.
- Keep Radix controls as the canonical a11y controls.
- Stop click propagation on inner Radix controls to avoid double-toggle from parent card handlers.

## Why

- Preserves established UX where the whole card is clickable.
- Avoids fragile reliance on native input-label forwarding semantics after control migration.
- Prevents duplicate state updates from nested handlers.

## Consequences

### Positive
- Maintains existing user interaction expectations.
- Keeps Radix keyboard/ARIA behavior while preserving card click ergonomics.

### Trade-off
- Slightly more event-handling code in component logic.
