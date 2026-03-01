<!--
Where: docs/decisions/shortcut-capture-remove-record-button-and-title-trigger.md
What: Decision record for shortcut capture trigger boundaries after removing the Record button.
Why: Issue #280 requires preventing title-click recording and removing explicit Record controls.
-->

# Decision: Remove Record Button and Block Title-Click Capture (#280)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #280

## Decision

Use a single control for capture: the shortcut input field itself.

- Remove the `Record`/`Cancel` button from each shortcut row.
- Render shortcut titles as non-label text so title clicks do not trigger input click/capture.
- Keep capture start available from the shortcut input by mouse click and keyboard activation (`Enter`/`Space`).

## Consequences

- Shortcut tab UI is simpler and has one unambiguous capture entry point.
- Clicking shortcut titles no longer starts recording.
- Tests lock the no-record-button and no-title-trigger behavior.
