<!--
Where: docs/decisions/transformation-enable-vs-auto-run.md
What: Decision record describing the removal of the transformation enable toggle and the remaining auto-run control.
Why: Keeps settings semantics clear after simplifying transformation behavior to always-enabled manual execution.
-->

# Decision Record: Remove `Enable transformation`, keep `Auto-run default transform`

## Context

The Transformation settings UI previously exposed two controls:

- `Enable transformation`
- `Auto-run default transform`

This created ongoing confusion and unnecessary states. In practice, users mainly need to control automatic transformation on recording/capture flows, while manual transform actions should remain available whenever prerequisites (API key, preset) are satisfied.

## Decision

Remove the `Enable transformation` setting from the UI and treat transformation as always enabled.

- Manual transform actions and transform shortcuts are always allowed (subject to existing prerequisites such as API keys).
- `Auto-run default transform` remains the only user-facing toggle and controls recording/capture automation only.

## Behavioral Semantics

### `Auto-run default transform`

When OFF:
- Recording/capture jobs keep transcription output but skip automatic transformation.
- Manual transform actions and transformation shortcuts still work.

When ON:
- Recording/capture jobs automatically run transformation using the default profile.

## Rationale

- The global transformation off-switch added complexity but little value.
- Users already have a clear way to stop automatic transformation (`Auto-run default transform`).
- Keeping manual transforms available avoids a hidden failure mode after users disable transformation and later forget why shortcuts stop working.

## Implementation Alignment

This decision aligns behavior and UI by:

- removing the `Enable transformation` control from Settings
- using `Auto-run default transform` as the only automation toggle

## Consequences

- The settings UI is simpler and avoids contradictory toggle states.
- No backward-compatibility migration is kept for the removed `transformation.enabled` field.
