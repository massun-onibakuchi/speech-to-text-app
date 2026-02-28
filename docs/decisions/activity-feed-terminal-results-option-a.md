<!--
Where: docs/decisions/activity-feed-terminal-results-option-a.md
What: Decision for issue #201 activity-feed result-card contract.
Why: Lock behavior before implementation to keep one-ticket scope and avoid mixed UX semantics.
-->

# Decision: Activity Feed Terminal Results Contract (Issue #201)

**Date**: 2026-02-28
**Status**: Accepted
**Ticket**: #201

## Context

Issue #201 requires the activity feed to:
- show terminal outcomes only (success/failure),
- cap feed size to 10,
- avoid start/stop/cancel operational-event cards,
- keep copyable display text for successful outcomes.

The issue proposed two options for successful recording cards:
- Option A: single final output text card.
- Option B: per-step cards (STT and transform).

## Decision

Adopt **Option A**.

- Each recording/transform run contributes at most one terminal activity card.
- Successful recording cards use final displayable output text:
  - selected output source text when present,
  - transcript fallback when transformed text is selected but unavailable.
- Failure cards show formatted failure detail.
- Operational events (start/stop/cancel/dispatch-progress messages) remain toast/operational feedback only and are not shown as activity cards.

## Rationale

- Keeps feed concise and deterministic.
- Aligns with current single-output selection contract.
- Minimizes renderer data-model churn while still making copy text meaningful.
- Prevents duplicate or intermediate-only cards when transformed output is selected.

## Consequences

- Activity feed no longer acts as an operational event log.
- Existing tests that asserted start/stop feed messages must assert terminal text cards instead.
- Future expansion to per-step cards (Option B) remains possible with a new ticket and explicit contract update.
- Follow-up issue #220 applies the same rule to standalone transform acknowledgements:
  `Transformation enqueued.` is non-terminal and must not be appended to Activity.
