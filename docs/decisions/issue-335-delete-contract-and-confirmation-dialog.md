<!--
Where: docs/decisions/issue-335-delete-contract-and-confirmation-dialog.md
What: Planning-time decision record for issue #335 delete semantics and confirmation-dialog behavior.
Why: Lock high-impact UX/data-contract choices before implementation.
-->

# Decision: Issue #335 Delete Contract and Confirmation Dialog

Date: 2026-03-04  
Status: Accepted (planning phase)

## Context
Issue #335 requires:
- explicit API key deletion from Settings;
- trash icon actions next to API key inputs;
- mandatory user confirmation before deletion;
- deterministic `Saved -> Not set` transition after delete.

Current secret-store behavior includes env fallback and treats empty persisted value as locally absent (`null`), which acts as a local override.

## Decision 1 — Delete contract

Implement a first-class IPC API:
- `deleteApiKey(provider)` in `IpcApi`
- dedicated channel `secrets:delete-api-key`

Rationale:
- explicit destructive intent in API contract;
- avoids overloading normal save pathways in renderer UI.

## Decision 2 — Delete persistence semantics

`deleteApiKey` uses tombstone semantics (equivalent to persisting empty key), not hard-delete of storage entries.

Rationale:
- preserves local "key missing" state even when env vars are configured;
- keeps status transition deterministic (`Saved -> Not set`) for this app instance.

## Decision 3 — Confirmation dialog behavior

Use a dedicated reusable destructive confirmation dialog component.

Behavior contract:
- opens from trash icon only;
- cancel paths: Escape, cancel button, backdrop click (no close icon);
- confirm path enters pending lock;
- on delete failure, dialog remains open and feedback is shown via inline status + toast.
- canonical dialog title text: `Delete API key?`

Rationale:
- avoids accidental destructive action;
- preserves retry/cancel choice after failure;
- aligns with compact existing UI language.

## Consequences
- Multi-layer contract changes will require synchronized updates to typed mocks/tests.
- Dialog primitive strategy should prefer `@radix-ui/react-dialog` due to lower a11y/focus risk and consistency with existing Radix usage.
