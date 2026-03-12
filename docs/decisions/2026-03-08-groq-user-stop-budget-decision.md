<!--
Where: docs/decisions/2026-03-08-groq-user-stop-budget-decision.md
What: Decision note for bounding Groq `user_stop` with a fixed stop budget.
Why: Record why the adapter now prefers liveness after a short grace window
     instead of waiting indefinitely on hung upload or drain work.
-->

# Decision: Groq `user_stop` Uses a Fixed End-to-End Stop Budget

## Status
Accepted — March 8, 2026

## Context

Issue `#425` showed that Groq stop could hang indefinitely because `user_stop` waited for all in-flight work to settle with no deadline.

That wait covered:

- active upload requests
- the adapter's completed-chunk drain loop
- any callback work triggered while draining

Without a budget, one stalled request could keep the renderer in a permanent stop state.

## Decision

Groq `user_stop` now uses a fixed end-to-end budget of `3000ms`:

- normal fast uploads and drain work are still allowed to finish
- if the budget expires, the adapter aborts all outstanding requests
- any undrained completed chunks are discarded
- `user_cancel` and `fatal_error` remain immediately abortive

The budget is enforced in the adapter, not the controller, because the hang source is adapter-owned upload/drain work.

## Consequences

- Stop liveness wins over perfect final-chunk completeness after the budget expires.
- Fast final chunks still commit normally.
- A badly stalled upload can no longer block the whole stop path forever.

## Out of Scope

- Renderer stop handshake
- Fatal-stop reason transport
- Controller drain-safe final-segment acceptance
