<!--
Where: docs/plans/issue-335-execution-plan.md
What: Prioritized implementation plan for issue #335 (API key deletion with trash icon + confirmation).
Why: Break work into reviewable tickets with explicit scope, snippets, checklist, and gates before coding.
Revision: v2 after coding-agent review (priorities, feasibility, granularity, risk, approach).
-->

# Execution Plan: Issue #335 — API Key Deletion + Confirmation

Date: 2026-03-04  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/335

## Requirements mapping (issue -> ticket)

| Issue request | Ticket |
|---|---|
| explicit delete path across renderer -> preload -> IPC -> main | T1 |
| confirmation required before delete | T2 |
| trash icon next to API input, no text label | T4 |
| successful confirm deletes key and updates `Saved -> Not set` | T3 + T5 gates |
| tests/regression updates | T5 |

## Priority-ordered tickets

| Priority | Ticket | Reason |
|---|---|---|
| P0 | T1 — Explicit delete contract + tombstone semantics | correctness and contract safety first |
| P1 | T2 — Confirmation dialog foundation + decision checkpoint | destructive UX guardrail |
| P1 | T3 — Delete mutation + app callback plumbing | shared behavior core used by both forms |
| P2 | T4 — Form UI integration (trash icon + confirm wiring) | consumes prior plumbing, lower rework risk |
| P3 | T5 — Tests/docs hardening and acceptance closure | final confidence gate |

## Assumptions resolved in this plan

1. **Delete semantics vs env fallback:** delete must preserve local "missing" state even when env vars exist.  
Chosen approach: write provider tombstone (`''`) in secure/volatile layer, not hard-delete entries.

2. **Dialog failure behavior:** on delete failure, dialog stays open, confirm/cancel re-enabled, and failure feedback is shown through existing inline status + toast channels.

---

## T1 — Explicit Delete Contract + Tombstone Semantics (P0)

### Goal
Add first-class `deleteApiKey(provider)` to `IpcApi` and implement deterministic delete semantics that do not re-expose env fallback.

### Scope files
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/secret-store.ts`
- `src/main/infrastructure/safe-storage-client.ts`
- `src/main/services/secret-store.test.ts`
- `src/main/test-support/ipc-round-trip.test.ts`
- typed renderer IPC mocks impacted by `IpcApi` shape (at minimum):
  - `src/renderer/renderer-app.test.ts`
  - `src/renderer/settings-mutations.test.ts`

### Planned code snippet
```ts
// src/shared/ipc.ts
export interface IpcApi {
  // ...existing API
  deleteApiKey: (provider: ApiKeyProvider) => Promise<void>
}

export const IPC_CHANNELS = {
  // ...existing channels
  deleteApiKey: 'secrets:delete-api-key'
} as const
```

```ts
// src/main/services/secret-store.ts
// Tombstone delete: store explicit empty value so env fallback stays overridden.
deleteApiKey(provider: ApiProvider): void {
  this.setApiKey(provider, '')
}
```

### Checklist
- [ ] Add `deleteApiKey` typing/channel in shared IPC contract.
- [ ] Add preload bridge method for `deleteApiKey`.
- [ ] Add main IPC handler for delete channel.
- [ ] Add `SecretStore.deleteApiKey` using tombstone semantics (not hard-delete).
- [ ] Ensure safe-storage client supports the chosen tombstone flow.
- [ ] Update typed renderer mocks/harnesses for new `IpcApi` member in same ticket.

### Gate
- [ ] `deleteApiKey` works end-to-end via IPC roundtrip tests.
- [ ] Deleting key keeps provider absent (`Not set`) even when corresponding env var is present.
- [ ] Existing save/test-connection behavior remains unchanged.

---

## T2 — Confirmation Dialog Foundation + Decision Checkpoint (P1)

### Goal
Create a reusable destructive confirmation dialog component for API key deletion.

### Scope files
- `src/renderer/components/ui/` (new primitive wrapper if adopted)
- `src/renderer/` (new dialog component + tests)
- decision doc update in `docs/decisions/`

### Planned code snippet
```tsx
interface ConfirmDestructiveActionDialogProps {
  open: boolean
  providerLabel: string
  pending: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
}
```

```tsx
<ConfirmDestructiveActionDialog
  open={deleteDialog.open}
  providerLabel={deleteDialog.providerLabel}
  pending={deleteDialog.pending}
  onConfirm={confirmDelete}
  onCancel={cancelDelete}
/>
```

### Checklist
- [ ] Implement dialog **without close icon**; cancel paths are only Esc, Cancel button, and backdrop click.
- [ ] Implement modal semantics, focus trap, and focus restore to trigger.
- [ ] Implement destructive copy contract (`Delete API key?`, provider-specific body + caution note).
- [ ] Implement pending lock behavior during confirm request.

### Gate
- [ ] Dialog unit tests cover open/close, Esc, backdrop cancel, confirm pending lock.
- [ ] Accessibility assertions pass (`aria-labelledby`, `aria-describedby`, keyboard loop, initial focus).
- [ ] Styling aligns with existing settings density/tokens.

### Confirm failure policy discussion (explicit)

Option A: keep dialog open on failure (**recommended**)
- Pros:
  - immediate retry without reopening dialog;
  - user keeps context on the destructive action they initiated;
  - aligns with explicit failure feedback and reduces accidental abandonment.
- Cons:
  - requires clean pending-state reset to avoid stuck modal;
  - needs careful provider-binding so stale context is not shown.
- Risks:
  - medium implementation risk if pending and error states are not coordinated.

Option B: close dialog on failure
- Pros:
  - simpler modal state machine;
  - lower chance of lingering focus-trap edge cases.
- Cons:
  - poorer UX (user must repeat trigger action to retry);
  - failure can feel abrupt and less explainable in context.
- Risks:
  - higher usability risk, especially for intermittent failures.

Chosen policy for this plan: **Option A (keep dialog open on failure)**.

### Dialog primitive discussion: Radix UI or local modal

Option A: `@radix-ui/react-dialog` (**recommended**)
- Pros:
  - consistent with current UI stack (already using Radix primitives broadly);
  - battle-tested accessibility/focus behavior out of the box;
  - lower long-term maintenance burden for keyboard and focus edge cases.
- Cons:
  - introduces one additional dependency package.
- Risks:
  - low technical risk; primary risk is minor bundle/dependency growth.

Option B: local custom modal implementation
- Pros:
  - no new package dependency.
- Cons:
  - higher effort to correctly implement focus trap, aria semantics, and restore focus;
  - higher regression risk for keyboard/accessibility behavior.
- Risks:
  - medium-high accessibility and behavior risk.

Recommendation: adopt **Radix Dialog** for this destructive confirmation flow.

---

## T3 — Delete Mutation + App Callback Plumbing (P1)

### Goal
Add delete operation orchestration in mutations and wire callback surface through app shell/orchestrator.

### Scope files
- `src/renderer/settings-mutations.ts`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- any renderer types/interfaces touched by new callback

### Planned code snippet
```ts
// src/renderer/settings-mutations.ts
const apiKeyOperationQueueByProvider: Record<ApiKeyProvider, Promise<void>> = {
  groq: Promise.resolve(),
  elevenlabs: Promise.resolve(),
  google: Promise.resolve()
}

const enqueueApiKeyOperation = (provider: ApiKeyProvider, run: () => Promise<void>): Promise<void> => {
  const queued = apiKeyOperationQueueByProvider[provider].catch(() => undefined).then(run)
  apiKeyOperationQueueByProvider[provider] = queued
  return queued
}
```

```ts
const deleteApiKey = async (provider: ApiKeyProvider): Promise<void> =>
  enqueueApiKeyOperation(provider, async () => {
    state.apiKeySaveStatus[provider] = 'Deleting key...'
    onStateChange()
    await window.speechToTextApi.deleteApiKey(provider)
    state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
    state.apiKeySaveStatus[provider] = 'Deleted.'
    addToast(`${apiKeyProviderLabel[provider]} API key deleted.`, 'success')
    onStateChange()
  })
```

### Checklist
- [ ] Refactor queue name/scope from save-only to operation queue and reuse for save + delete.
- [ ] Add delete mutation with inline status + toast behavior.
- [ ] Add `onDeleteApiKey` callback to AppShell callbacks contract.
- [ ] Wire callback from renderer orchestration to both settings forms.

### Gate
- [ ] Save/delete operations for same provider are strictly serialized.
- [ ] No compile break in renderer callback interfaces.
- [ ] Delete success updates `apiKeyStatus` and inline provider status deterministically.

---

## T4 — Form UI Integration (Trash icon + Confirmation Wiring) (P2)

### Goal
Integrate trash icon buttons next to STT and Google API key inputs and connect to dialog flow.

### Scope files
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- any local component state used to open/close dialog per provider

### Planned code snippet
```tsx
<div className="mt-2 flex items-center gap-2">
  <input className="h-8 flex-1 ..." />
  <button
    type="button"
    aria-label={`Delete ${providerLabel} API key`}
    className="h-8 w-8 rounded border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    onClick={openDeleteConfirmation}
    disabled={!hasSavedKey || pendingDelete}
  >
    <Trash2 className="size-3.5" aria-hidden="true" />
  </button>
</div>
```

### Checklist
- [ ] Add icon-only trash action in STT form for currently selected provider.
- [ ] Add icon-only trash action in Google form.
- [ ] Open confirmation dialog on trash click; no direct delete side effect.
- [ ] Keep existing mask/blur-save behavior unchanged.

### Gate
- [ ] DOM-assertion tests prove input/trash row structure and provider-specific `aria-label`.
- [ ] Keyboard navigation reaches trash button and dialog actions correctly.
- [ ] STT provider switch + delete targets selected provider only.

---

## T5 — Tests, Docs, and Acceptance Closure (P3)

### Goal
Close issue acceptance with explicit provider coverage and regression protection.

### Scope files
- renderer component tests
- settings mutation tests
- main/IPC tests
- docs/decisions updates

### Planned code snippet
```ts
it('deletes all supported providers with confirmation (groq, elevenlabs, google)', async () => {
  // switch STT provider -> delete Groq
  // switch STT provider -> delete ElevenLabs
  // delete Google in LLM section
  // assert status transitions to Not set after each success
})
```

### Checklist
- [ ] Add confirmation-flow tests (open/cancel/confirm/failure) for both forms.
- [ ] Add mutation tests for delete success/failure + save/delete race ordering.
- [ ] Add IPC/main tests for delete contract + env override/tombstone semantics.
- [ ] Add/update decision docs covering final semantics and dialog UX.

### Gate
- [ ] Acceptance criteria proven for **all three providers** (Groq, ElevenLabs, Google).
- [ ] `Saved -> Not set` verified post-delete for each provider.
- [ ] Existing API-key save/redaction tests stay green.
- [ ] Docs match implemented behavior.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Env fallback reappears after delete | fails deterministic `Not set` UX | use tombstone semantics, not hard delete |
| Typed IPC contract fanout breakage | broad test compile failures | update all `IpcApi` mocks in same PR as T1 |
| Save/delete race per provider | stale status and confusing UI | single per-provider operation queue for save + delete |
| Wrong provider deleted after STT switch | destructive action on wrong target | bind provider at dialog-open time |
| Dialog a11y regressions | keyboard/screen-reader failure | focused dialog a11y test matrix |

## Plan-review revisions (coding-agent driven)

This v2 plan incorporates revisions for:
1. Priority/order (moved mutation plumbing ahead of UI wiring).  
2. Feasibility (correct `IpcApi` naming and compile-impact file scope).  
3. Granularity (explicit app-shell/renderer callback files and DOM-assertion gates).  
4. Risks (added typed-contract fanout and env-fallback tombstone risk).  
5. Approach (explicit queue refactor and dialog primitive decision checkpoint).
