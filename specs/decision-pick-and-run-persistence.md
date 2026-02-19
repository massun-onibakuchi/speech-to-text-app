<!--
Where: specs/decision-pick-and-run-persistence.md
What: Decision record for pick-and-run active-profile persistence behavior.
Why: Resolve #70 conflict between user feedback and current normative spec.
-->

# Decision: pick-and-run active profile persistence

- Date: 2026-02-19
- Issue: #85
- Status: Supersedes prior #70 decision

## Decision

`pickAndRunTransformation` is **one-time** (request-scoped):

1. User picks a profile.
2. System executes transformation with that picked profile for the current request.
3. System does not update persisted `transformation.activePresetId`.
4. Subsequent active-target shortcuts continue using persisted active profile unless changed explicitly by other controls.

## Rationale

- Issue #85 explicitly rejects the prior persistent interpretation.
- One-time behavior matches user expectation for a temporary pick-and-run action.
- Keeps persistent profile state changes scoped to explicit settings/profile actions.

## Consequences

- Spec wording is updated to remove persistent side-effect semantics for pick-and-run.
- Any implementation/tests relying on pick-and-run persistence must be updated to request-scoped behavior.
- Issue #83 is treated as invalid and should not be used as normative direction.
