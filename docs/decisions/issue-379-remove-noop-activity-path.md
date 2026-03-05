<!--
Where: docs/decisions/issue-379-remove-noop-activity-path.md
What: Decision record for issue #379 no-op renderer activity path cleanup.
Why: Preserve current user-visible behavior while deleting misleading dead calls.
-->

# Decision: Remove No-op Activity Calls (Issue #379)

Date: 2026-03-05
Status: Accepted
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/379

## Context

Renderer-side flows still called `addActivity(...)` in multiple paths, but the function was a no-op and produced no runtime activity entries.

## Decision

Remove the no-op helper and all renderer callsites that implied activity insertion. Keep actual behavior model unchanged:
- toast notifications for user feedback
- terminal job entries from main-process pipeline

## Rationale

- Keeps behavior unchanged while removing misleading dead surface.
- Prevents future contributors from assuming activity insertion exists in these paths.

## Consequences

- Tests now assert toast/terminal behavior only.
- No activity-feed side effects are implied in renderer command/mutation code.
