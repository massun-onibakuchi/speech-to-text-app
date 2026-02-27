<!--
Where: docs/decisions/activity-feed-data-contract.md
What: Decision record for activity feed data contract in STY-04.
Why: The spec requires richer per-job cards; the current model is simpler.
-->

# Decision: Activity Feed Data Contract (STY-04)

**Date**: 2026-02-27
**Status**: Accepted
**Ticket**: STY-04

## Context

The spec (`docs/style-update.md` section 6.3) requires activity feed cards with:
- `status` field (transcribing/transforming/succeeded/`*_failed`)
- `transcript` text (optional)
- `transformedText` text (optional)
- `timestamp`, `duration`, optional `profile` name

The current `ActivityItem` model (`src/renderer/activity-feed.ts`) provides:
- `id`, `message`, `tone: 'info' | 'success' | 'error'`, `createdAt`

## Decision: Render Existing Schema in Spec-Compliant Card Format

- **Approach**: Map `tone` → semantic border/icon/status in card UI. Use `message` as the primary card content. Do not change `ActivityItem` schema or IPC contracts.
- **Rationale**: Changing the activity data model requires IPC boundary changes (main process + preload + renderer) that are outside the scope of a presentation-layer redesign. STY-04 is scoped to "activity tab UI only".
- **Contract gap**: The `transcript`/`transformedText` split, `duration`, and `profile` fields are **not available** in the current model. These are treated as absent/optional and the card renders gracefully without them.
- **Forward path**: A future ticket (post-STY-09) can wire the full job data model through IPC when the business layer supports it.

## Mapping

| `tone` | Spec status semantic | Card border | Icon |
|---|---|---|---|
| `'success'` | succeeded | `border-success/20` | CheckCircle |
| `'error'` | failed | `border-destructive/30` | XCircle |
| `'info'` | in-progress/generic | `border-border` (default) | Activity (animates) |

## Impact

- No IPC contract changes.
- No main-process changes.
- No breaking changes to existing `ActivityItem` consumers.
