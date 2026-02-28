<!--
Where: docs/decisions/derived-transform-run-from-output-source.md
What: Decision for issue #198 to derive capture transformation behavior from selected output source.
Why: Replace ambiguous auto-run toggle with deterministic behavior contract.
-->

# Decision: Derive Capture Transformation From Output Source (#198)

**Date**: 2026-02-28
**Status**: Accepted
**Ticket**: #198

## Context

The previous settings contract had `transformation.autoRunDefaultTransform` plus `output.selectedTextSource`.
This produced overlapping controls and unclear behavior.

Issue #198 requires deterministic behavior:
- if `output.selectedTextSource === transformed`: run default transformation during capture flow.
- if `output.selectedTextSource === transcript`: skip capture-time transformation.

Manual transforms (clipboard/selection/shortcut-triggered transform runs) must continue to work regardless of selected output source.

## Decision

- Remove the `autoRunDefaultTransform` UI toggle.
- Deprecate/remove `transformation.autoRunDefaultTransform` from schema/defaults.
- Derive capture-time transformation from `output.selectedTextSource` only.
- Keep transform-failure behavior unchanged:
  - when transformed output is selected but transformation fails, transcript fallback remains available to output routing.

## Migration

- Existing persisted settings containing `autoRunDefaultTransform` are migrated by dropping the key.
- When `autoRunDefaultTransform === false`, the migration also sets `output.selectedTextSource` to
  `'transcript'` to preserve the user's intent of skipping capture-time transformation.
  Without this, the default `selectedTextSource: 'transformed'` would silently activate
  transformation for users who had previously disabled it, causing `transformation_failed` for
  anyone without a Google API key.
- When `autoRunDefaultTransform === true` (or missing), `output.selectedTextSource` is left
  unchanged; the existing value already reflects the correct behavior.

## Consequences

- One less toggle in Settings; behavior is easier to reason about.
- Capture snapshot/profile binding now depends on selected output source.
- Tests referencing auto-run toggle/settings field must move to selected-source assertions.
