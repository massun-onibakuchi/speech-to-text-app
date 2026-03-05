<!--
Where: docs/decisions/issue-367-profile-delete-confirmation-modal.md
What: Decision record for profile delete confirmation modal design for issue #367.
Why: Capture trade-offs and chosen implementation to keep deletion UX consistent and safe.
-->

# Decision: Issue #367 Profile Delete Confirmation Modal

Date: 2026-03-05  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/367

## Context
Profile deletion in the Profiles tab was immediate on trash-button click. Issue #367 requires an explicit confirmation modal, aligned with API key deletion modal behavior.

## Options Considered

1. Extend `ConfirmDeleteApiKeyDialogReact` to support profile deletion copy and behavior.
2. Create `ConfirmDeleteProfileDialogReact` dedicated to profile deletion while reusing the same Radix `Dialog` foundation and interaction pattern.

## Decision
Choose option 2: add `ConfirmDeleteProfileDialogReact`.

## Rationale
- Keeps component semantics clear (`profileName` vs `providerLabel`).
- Avoids prop bloat and mixed copy logic inside API-key-specific component.
- Maintains visual/interaction parity with API-key modal while preserving separation of concerns.

## Consequences
- Adds one small component and test file.
- Requires `ProfilesPanelReact.onRemovePreset` callback to return `Promise<boolean>` so confirm-flow can keep modal open on failed delete attempts.
- No IPC/main-process contract changes.
