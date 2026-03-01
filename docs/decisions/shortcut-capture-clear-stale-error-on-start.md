<!--
Where: docs/decisions/shortcut-capture-clear-stale-error-on-start.md
What: Decision record for clearing shortcut capture errors when a new recording session starts.
Why: Issue #278 requires stale keybind errors to be reset before any new capture attempt.
-->

# Decision: Clear Stale Keybind Error on New Recording Start (#278)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #278

## Decision

When shortcut capture starts for any field, reset prior capture errors immediately.

- Clear the in-memory capture error map at `beginCapture`.
- Show capture errors only for the currently active capture attempt.
- Keep prop-driven validation errors unchanged.

## Consequences

- Users do not see stale errors from a previous field while recording a new shortcut.
- Current-attempt failures still show normally and immediately.
- Regression tests lock cross-field stale-error clearing behavior.
