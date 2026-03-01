<!--
Where: docs/decisions/settings-endpoint-overrides-react-slice.md
What: Decision record for moving Settings endpoint override controls to React ownership.
Why: Keep one event owner per interaction path while continuing incremental renderer migration.
-->

# Decision: React-own Settings Endpoint Override Controls

**Status**: Superseded by #248 (removed endpoint override feature)

## Context
- The Settings panel migrated recording, transformation, output, and API key sections to React.
- Endpoint override controls were still string-rendered and had legacy click listeners for reset actions.
- This mixed ownership increased friction and made draft state more fragile during rerenders.

## Decision
- Move endpoint override control rendering and interaction ownership to a dedicated React component:
  - `#settings-transcription-base-url`
  - `#settings-transformation-base-url`
- Keep existing selector IDs and form submit contract so validation/save flow remains unchanged.
- Remove equivalent legacy reset-button listeners from `wireActions`.

## Rationale
- Preserves incremental migration strategy with small, reviewable diffs.
- Reduces duplicate ownership in Settings while avoiding behavior contract changes.
- Maintains compatibility with existing submit-time validation and persistence logic.

## Consequences
- Endpoint override draft values now flow through React callbacks into renderer state draft values.
- Final persistence still happens in the existing submit path.
- This component/slice was later deleted when endpoint override support was removed.
