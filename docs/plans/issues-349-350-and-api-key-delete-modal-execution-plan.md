# Execution Plan — Issues #349, #350, and API Key Delete Modal

> Date: 2026-03-05
> Research basis: `docs/research/issues-349-350-profile-default-autosave-and-api-key-delete-modal.md`

## Constraints

- One ticket maps to one PR.
- Do not start implementation until this plan is approved.
- Keep diffs small, reversible, and test-backed.
- Stop keeping backward-compatibility for replaced behavior in this scope.
- Remove relevant legacy code completely (no dead branches, compatibility shims, or legacy-only fallbacks).
- Keep codebase error-pruned by deleting obsolete error paths tied only to removed legacy flows.

## Priority and Risk Matrix

| Priority | Ticket | Issue | PR | Impact | Likelihood | Delivery risk | Rationale |
|---|---|---|---|---|---|---|---|
| P1 | T1 — Stable default profile behavior | #349 | PR-1 | High | High | Low-Medium | Current behavior violates issue acceptance and is localized in mutations |
| P2 | T2 — Profile draft-state core (explicit save/cancel) | #350 | PR-2 | High | High | Medium | Foundation needed before navigation/unload guards |
| P3 | T3 — Dirty navigation + unload guards | #350 | PR-3 | High | Medium | Medium-High | Lifecycle-sensitive; depends on T2 state model |
| P4 | T4 — API key delete modal + explicit delete contract | #335 (reopen or replace with new issue) | PR-4 | Medium-High | Medium | Medium | Multi-layer contract/UI change; independent of profile correctness |

## Ticket Overview

| Ticket | Issue | PR | Depends on |
|---|---|---|---|
| T1 | #349 | PR-1 | None |
| T2 | #350 | PR-2 | None |
| T3 | #350 | PR-3 | T2 merged |
| T4 | #335 (reopen or superseding issue) | PR-4 | None |

---

## T1 — Issue #349 -> PR-1

### Goal

Creating/editing/deleting non-default profiles must not change default profile. Deleting the current default must assign top-listed fallback and notify user (toast), which is explicitly required in #349 acceptance text.

### Approach

Fix at mutation helper level:
- Keep `defaultPresetId` unchanged in add builder.
- Preserve existing remove fallback behavior when deleting current default.
- Emit fallback-assignment notification only when deleted profile was current default.

### Scope Files

- `src/renderer/settings-mutations.ts`
- `src/renderer/profiles-panel-react.tsx` (only if add-flow UI relies on “new default = added preset”)
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/profiles-panel-react.test.tsx`
- `src/renderer/renderer-app.test.ts` (if toast verification is integration-level)

### Out of Scope

- Reworking global autosave architecture.
- Changing pick-and-run semantics (`lastPickedPresetId`).
- Profile schema redesign.

### Trade-offs

- Pro: Minimal, root-cause fix in one place.
- Con: May require a minor decoupling of “new profile auto-open” UI from `defaultPresetId` inference.

### Code Snippets (proposed)

```ts
// Keep current default when adding profile
transformation: {
  ...settings.transformation,
  defaultPresetId: settings.transformation.defaultPresetId,
  presets: [...settings.transformation.presets, newPreset]
}
```

```ts
if (deletedWasDefault) {
  addToast(`The default profile was deleted. "${fallbackName}" is now the default profile.`, 'info')
}
```

### Tasks

- [ ] Update add-preset builder to preserve current default.
- [ ] Confirm remove path still chooses first remaining when deleting default.
- [ ] Add fallback-only notification path.
- [ ] Remove legacy assumptions/branches that depend on “add profile => auto default switch”.
- [ ] Update/add tests for all #349 acceptance cases.
- [ ] Re-read touched files for invariant safety.

### Checklist

- [ ] Add does not change default.
- [ ] Edit does not change default.
- [ ] Delete non-default does not change default.
- [ ] Delete default chooses first remaining.
- [ ] Fallback assignment shows toast once.

### Gates

- [ ] `settings-mutations` and profiles tests pass.
- [ ] No regression in renderer-app default-card labeling tests.
- [ ] Manual QA confirms all #349 scenarios.
- [ ] No obsolete compatibility branch remains for prior default-switch-on-add behavior.

### Feasibility / Risk

- Feasibility: High
- Risk: Low-Medium

---

## T2 — Issue #350 (Phase A) -> PR-2

### Goal

Establish explicit-save profile draft contract as a stable foundation:
- single source-of-truth dirty model,
- explicit save validation gate,
- cancel/discard semantics inside profile editing flow.

### Approach

Implement draft-state ownership first (without cross-tab modal/unload):
- Add app-level draft descriptor state shape.
- Keep field edits draft-local until save.
- Save path validates then persists.
- Cancel path clears draft and dirty state.

Dirty-state model (proposed):
```ts
type ProfileDraftState = {
  editingPresetId: string | null
  original: EditDraft | null
  draft: EditDraft | null
  isDirty: boolean
}
```

### Scope Files

- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/profiles-panel-react.test.tsx`

### Out of Scope

- Cross-tab navigation guard modal.
- `beforeunload` browser-close warning.
- Non-profile settings autosave behavior changes.

### Trade-offs

- Pro: Reduces complexity by sequencing #350 into stable phases.
- Con: #350 fully closes only after T3.

### Code Snippets (proposed)

```ts
const isDirty = !!original && !!draft && JSON.stringify(original) !== JSON.stringify(draft)
```

```ts
if (!isValidDraft(draft)) {
  setSettingsSaveMessage('Fix the highlighted validation errors before saving.')
  return false
}
```

### Tasks

- [ ] Introduce explicit draft-state data model and ownership.
- [ ] Wire save/cancel to update draft + dirty state deterministically.
- [ ] Keep persistence only behind Save for profile edit path.
- [ ] Delete superseded legacy draft/persistence glue once new ownership model is in place.
- [ ] Add tests for explicit-save and cancel-discard behavior.
- [ ] Re-run existing profile tests and reconcile contract changes.

### Checklist

- [ ] Draft edits do not persist before Save.
- [ ] Invalid Save is blocked with validation messages.
- [ ] Cancel discards edits and resets dirty state.

### Gates

- [ ] Profile unit/integration tests pass.
- [ ] No regressions in existing mutation validation tests.
- [ ] Clear handoff notes for T3 guard integration points.
- [ ] No deprecated draft-state compatibility path remains.

### Feasibility / Risk

- Feasibility: Medium-High
- Risk: Medium

---

## T3 — Issue #350 (Phase B) -> PR-3

### Goal

Add unsaved-change protections for dirty profile drafts:
- internal navigation modal with Save / Discard / Stay,
- native close/reload warning only while dirty.

### Approach

Build on T2 draft-state ownership:
- Intercept tab navigation when `profileDraftState.isDirty`.
- Show modal with deterministic action semantics.
- Register `beforeunload` listener while dirty and remove when clean.

### Scope Files

- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- new modal component: `src/renderer/components/*`
- `src/renderer/renderer-app.test.ts`
- `src/renderer/profiles-panel-react.test.tsx` (if any UI hooks change)

### Out of Scope

- Redesigning profile edit form layout.
- Extending dirty-guard behavior to non-profile tabs/forms.
- API-key flows.

### Trade-offs

- Pro: Meets #350 UX safeguards with clear user control.
- Con: Navigation + lifecycle code is brittle if not tested thoroughly.

### Code Snippets (proposed)

```ts
if (profileDraftState.isDirty && nextTab !== 'profiles') {
  setPendingNavigation(nextTab)
  openUnsavedModal()
  return
}
```

```ts
window.addEventListener('beforeunload', onBeforeUnload)
// cleanup on unmount or when !isDirty
```

### Tasks

- [ ] Implement navigation interception and pending-destination storage.
- [ ] Implement modal actions:
  - Save -> validate/persist -> continue nav
  - Discard -> drop draft -> continue nav
  - Stay -> close modal only
- [ ] Implement `beforeunload` dirty warning wiring.
- [ ] Remove obsolete navigation/unload paths that bypass dirty-guard behavior.
- [ ] Add tests for all guard permutations.
- [ ] Execute manual scenarios from #350 QA checklist.

### Checklist

- [ ] Modal appears only when dirty and navigating away.
- [ ] Save/Discard/Stay each behave deterministically.
- [ ] Close/reload warning appears only when dirty.

### Gates

- [ ] Renderer tests cover navigation modal and beforeunload behavior.
- [ ] No stale event listeners after save/discard/unmount.
- [ ] Manual QA passes all six #350 scenarios.
- [ ] No legacy navigation path can skip the new dirty-guard contract.

### Feasibility / Risk

- Feasibility: Medium
- Risk: Medium-High

---

## T4 — Issue #335 (reopen or superseding issue) -> PR-4

### Goal

Add explicit API key deletion UX with confirmation modal and predictable post-delete state.

### Pre-execution Gate

Before coding, either:
- Reopen issue `#335`, or
- Create a new superseding issue and replace references in this plan/PR metadata.

### Approach (locked)

Use explicit delete API contract only:
- Introduce `deleteApiKey(provider)` through shared IPC/preload/main handler.
- Do not use `setApiKey('')` as public delete contract in this ticket.
- Add delete button + confirmation modal per provider key UI.
- On confirm: delete -> refresh status -> show success/failure feedback.

Failure UX contract:
- Delete failure shows error toast.
- Provider save-status line reflects failure text.
- UI remains in stable redacted/not-set state; no plaintext leak.

### Scope Files

- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/secret-store.ts` (explicit delete method)
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- modal component in `src/renderer/components/*`
- tests across renderer + main IPC/service

### Out of Scope

- Changing API key blur-save replace flow.
- Altering secret-storage backend architecture.
- Adding provider-level key rotation workflows.

### Trade-offs

- Pro: Explicit contract clarity and maintainability.
- Con: Wider cross-layer change than implicit empty-string clear.

### Code Snippets (proposed)

```ts
// shared/ipc.ts
interface IpcApi {
  deleteApiKey: (provider: ApiKeyProvider) => Promise<void>
}
```

```ts
// settings-mutations.ts
const deleteApiKey = async (provider: ApiKeyProvider) => {
  await window.speechToTextApi.deleteApiKey(provider)
  state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
  state.apiKeySaveStatus[provider] = 'Deleted.'
  addToast(`${apiKeyProviderLabel[provider]} API key deleted.`, 'success')
}
```

### Tasks

- [ ] Create/link issue and update plan with real issue ID.
- [ ] Add delete IPC contract and handler.
- [ ] Add delete method in secret store.
- [ ] Add delete UI affordance + confirmation modal for STT and Google forms.
- [ ] Wire mutation, status refresh, and error handling.
- [ ] Remove user-facing reliance on implicit legacy delete workaround (`setApiKey('')` contract exposure).
- [ ] Add tests for open/cancel/confirm/success/failure paths.

### Checklist

- [ ] User can explicitly delete saved key via modal confirm.
- [ ] Cancel is non-destructive.
- [ ] Status transitions to `Not set` after success.
- [ ] Failure path is visible and safe.

### Gates

- [ ] Dedicated issue exists and is linked.
- [ ] Renderer + IPC + service tests pass.
- [ ] Manual validation confirms blocked-preflight behavior after deletion.
- [ ] No backward-compat delete shim remains in user-facing mutation/UI contract.

### Feasibility / Risk

- Feasibility: Medium
- Risk: Medium

---

## Cross-Ticket Sequencing

1. T1 (PR-1)
2. T2 (PR-2)
3. T3 (PR-3; requires T2 merged)
4. T4 (PR-4; independent, but issue-ID gate required)

## Cross-Ticket Mitigation and Rollback

- If T1 introduces UI side effects (e.g., new-profile auto-open regression), rollback only T1 mutation/UI delta and keep tests documenting expected #349 behavior.
- If T2 draft-state introduces instability, keep persistence logic unchanged and ship only test/diagnostic scaffolding in that PR.
- If T3 modal/unload guards cause flaky behavior, feature-gate guard activation to Profiles tab only and disable unload guard until stable.
- If T4 contract rollout fails across IPC layers, keep delete button hidden behind a feature flag and preserve existing save/replace-only behavior.
- Legacy-removal rule: any retained compatibility code must be justified in PR as unavoidable; default action is full removal.

## Criteria Mapping

- Ticket granularity: #350 split into two PR-sized tickets.
- Ticket priority: justified with impact/likelihood/delivery-risk matrix.
- Feasibility: explicit per-ticket ratings.
- Potential risk: explicit per-ticket plus global mitigations.
- Proposed approaches: each ticket has locked approach, scope, trade-offs, code snippets, tasks, checklist, and gates.
- Backward-compatibility policy: disabled for this scope; legacy code removal is required and explicitly gated per ticket.
