<!--
Where: specs/decision-pick-and-run-persistence.md
What: Decision record for pick-and-run active-profile persistence behavior.
Why: Resolve #70 conflict between user feedback and current normative spec.
-->

# Decision: pick-and-run active profile persistence

- Date: 2026-02-19
- Issue: #70
- Status: Accepted

## Decision

`pickAndRunTransformation` remains **persistent**:

1. User picks a profile.
2. System updates `transformation.activePresetId` to the picked profile.
3. Transformation executes with the picked profile.
4. The picked profile remains active for subsequent active-target shortcuts.

This is not one-time behavior.

## Rationale

- Current behavior and tests already enforce persistent active-profile updates.
- Persistence keeps `pickAndRunTransformation`, `runTransformationOnSelection`, and
  `changeDefaultTransformation` semantically consistent around the active profile.
- Avoids introducing hidden temporary state that would increase shortcut ambiguity.

## Consequences

- No implementation change is required for #70.
- Spec wording is clarified to explicitly call out persistence.
- Follow-up work should improve user-facing copy so persistence is obvious.
