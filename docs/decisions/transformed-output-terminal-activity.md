<!--
Where: docs/decisions/transformed-output-terminal-activity.md
What: Decision record for terminal Activity projection when output source is transformed text.
Why: Prevent regressions where successful transformed captures fail to append their final Activity entry.
-->

# Decision: Terminal Activity must follow selected output source for successful captures

- Date: 2026-03-01
- Status: Accepted
- Related issue: #249

## Context
- The renderer polls capture history after `submitRecordedAudio` and appends one terminal Activity entry for each completed capture.
- Users reported missing final Activity entries when `output.selectedTextSource` is `transformed`.

## Decision
- On successful capture terminal status, the renderer resolves the Activity message using the selected source:
  - `transformed` when transformed text is present.
  - `transcript` when transcript is selected.
  - Transcript fallback when transformed is selected but transformed text is missing.
  - Transformed fallback when transcript is selected but transcript text is missing.
- The initial history poll window remains `8 x 600ms`, and then starts a delayed reconciliation loop (`10 x 1000ms`) for late terminal completions.
- Exactly one terminal Activity entry is appended per capture `capturedAt` session id (deduped across initial poll and delayed reconciliation paths).
- Session-id dedupe memory is bounded to a rolling fixed-size window to avoid unbounded growth during long-running app sessions.

## Consequences
- Activity behavior remains consistent with output source selection.
- Successful transformed captures keep visible terminal feedback in Activity.
- Regression coverage now asserts resolver fallback behavior and polling-path terminal projection (`pollRecordingOutcome`) for transformed-source captures.
