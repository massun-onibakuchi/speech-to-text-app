<!--
Where: docs/decisions/transformation-enable-vs-auto-run.md
What: Decision record defining semantics of the transformation enable toggle vs auto-run default transform.
Why: Clarifies user-facing behavior and removes ambiguity in Settings about what each toggle controls.
-->

# Decision Record: `Enable transformation` vs `Auto-run default transform`

## Context

Issue `#128` identified confusion in the Transformation settings UI:

- `Enable transformation`
- `Auto-run default transform`

Users could not tell which flows each toggle affects, and the codebase needed a clear rule for how they interact.

## Decision

Keep both toggles and define them as separate controls:

- `Enable transformation`: master gate for all transformation execution.
- `Auto-run default transform`: capture/recording-only automation flag for the default profile.

## Behavioral Semantics

### `Enable transformation`

When OFF:
- Manual transform actions are blocked.
- Transformation shortcuts are blocked.
- Recording/capture jobs do not run transformation.
- `Auto-run default transform` has no effect until transformation is enabled again.

When ON:
- Manual transform actions and transformation shortcuts are allowed (subject to API key and other existing checks).
- Capture/recording transformation depends on the auto-run toggle.

### `Auto-run default transform`

When OFF:
- Recording/capture jobs keep transcription output but skip automatic transformation.
- Manual transform actions and transformation shortcuts still work.

When ON:
- Recording/capture jobs automatically run transformation using the default profile (when transformation is enabled).

## Rationale

- `Enable transformation` is the clear global off-switch for the feature.
- `Auto-run default transform` is not a global enable flag; it controls whether capture flows automatically apply the default profile.
- This separation supports common usage:
  - manual transforms available, but no automatic transform on every recording
  - a full feature off state without changing per-profile settings

## Implementation Alignment

This decision aligns behavior and UI by:

- clarifying both toggles in Settings help text
- ensuring capture snapshot binding and legacy processing orchestration skip transformation when auto-run is disabled

## Consequences

- `#128` is a decision + UX clarification with a small behavior alignment change.
- Future toggle-related UX changes should reference this decision doc before changing semantics.
