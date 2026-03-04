<!--
Where: docs/decisions/autosave-success-toast.md
What: Decision record for autosave success feedback channel.
Why: Issue #246 replaces inline autosave success text with toast feedback.
-->

# Decision: Autosave Success Uses Toast Feedback (#246)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #246

## Decision

For non-secret settings autosave success:
- emit toast text exactly `Settings autosaved.`;
- do not set inline save-status message for success;
- keep inline and toast error behavior for autosave failures.

## Consequences

- success feedback is consistent with other transient success actions;
- failure states remain visible/actionable in inline status surfaces.
