<!--
Where: docs/decisions/transformation-remove-active-preset-last-picked-focus.md
What: Decision record for removing active preset state and adding last-picked focus memory for Pick-and-Run.
Why: Issue #167 requires removing active profile semantics and optimizing repeated picker workflows.
-->

# Decision: Remove `activePresetId`, add `lastPickedPresetId` focus memory

## Date
2026-02-27

## Context
- The app previously kept `activePresetId` as an internal field after user-facing active profile controls were removed.
- Pick-and-run used this hidden field as picker focus seed, which made behavior indirect and confusing.
- Issue `#167` requires:
  - remove `activePresetId` completely (no backward runtime behavior),
  - keep pick-and-run request-scoped,
  - remember the last picked profile and focus it on next picker open.

## Decision
- Remove `transformation.activePresetId` from schema, defaults, runtime state, and code paths.
- Add `transformation.lastPickedPresetId: string | null`.
- Pick-and-run behavior:
  - execute using selected preset for current request only,
  - persist `lastPickedPresetId` after successful selection,
  - do not mutate `defaultPresetId`.
- Picker focus resolution order:
  1. `lastPickedPresetId` when valid
  2. `defaultPresetId` when valid
  3. first available preset

## Rationale
- Separates persistent default behavior from temporary picker execution behavior.
- Preserves fast repeat workflow without reintroducing hidden active-profile semantics.
- Keeps profile editing and manual/default transformations aligned on `defaultPresetId`.

## Consequences
- Settings and migrations normalize away legacy `activePresetId`.
- Tests and docs that mention active profile semantics must be updated.
- Picker-related behavior is now explicitly testable via `lastPickedPresetId`.
