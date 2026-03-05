<!--
Where: docs/plans/issue-367-execution-plan.md
What: Execution plan for issue #367 (profile delete confirmation modal).
Why: Define a single-ticket, one-PR implementation with explicit tasks, risk gates, and test coverage before coding.
-->

# Execution Plan: Issue #367 — Confirmation Modal On Profile Delete

Date: 2026-03-05  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/367

## API Key Delete Modal Analysis (Baseline Pattern)

Current API-key deletion confirmation behavior is implemented in:
- `src/renderer/confirm-delete-api-key-dialog-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/settings-stt-provider-form-react.tsx`
- tests in `confirm-delete-api-key-dialog-react.test.tsx`, `settings-api-keys-react.test.tsx`, `settings-stt-provider-form-react.test.tsx`

Observed canonical pattern to mirror for profile deletion:
1. Trigger button opens modal and does not execute deletion immediately.
2. Modal uses Radix `DialogContent` with `role="alertdialog"`.
3. Initial focus is forced to `Cancel` button via `onOpenAutoFocus`.
4. `pending` state disables cancel/confirm and blocks `onOpenChange`.
5. Confirm button runs async delete callback.
6. On success: close modal.
7. On failure: keep modal open for retry or cancel.

Gap in profile flow (`src/renderer/profiles-panel-react.tsx`):
- Trash icon currently calls `onRemovePreset(preset.id)` immediately.
- No confirmation step exists.

## Ticket Priority

| Priority | Ticket | Issue | PR |
|---|---|---|---|
| P1 | T367 — Add profile delete confirmation modal aligned with API key modal | #367 | PR-367 |

Priority rationale:
- P1 because current behavior performs immediate destructive action without confirmation.
- User-impact risk is high (accidental profile deletion).
- Scope is small and isolated, so urgent delivery in one PR is feasible.

## Ticket: T367 — Add Profile Delete Confirmation Modal

### Goal
Add a confirmation modal for profile deletion in the Profiles tab, aligned with the API key deletion modal behavior and styling contract.

### Approach
- Reuse the existing modal foundation (`Dialog`) and interaction contract from API key deletion.
- Create a dedicated profile-delete modal component (or shared generic component if reuse stays minimal) with profile-focused copy.
- Route profile trash action through a confirm step before calling `onRemovePreset`.
- Preserve current removal behavior once confirmed, including fallback-default and error toasts from existing mutation flows.

### Scope Files
- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/profiles-panel-react.test.tsx`
- `src/renderer/app-shell-react.test.tsx` (only if callback wiring assertions need updates)
- `src/renderer/confirm-delete-profile-dialog-react.tsx` (new)
- `src/renderer/confirm-delete-profile-dialog-react.test.tsx` (new)
- `docs/decisions/issue-367-profile-delete-confirmation-modal.md` (new decision note)

### Out Of Scope
- Mutation semantics in `settings-mutations.ts`.
- Changing fallback default-profile assignment logic.
- Changing copy or behavior of API-key deletion modal.
- Cross-tab unsaved-draft guard behavior.

### Trade-offs

Option A: Reuse API-key dialog component directly with prop expansion
- Pros: lower component count.
- Cons: component naming/copy becomes awkward (`providerLabel` for profile), higher prop complexity, mixed concern drift.

Option B: New profile-specific confirmation component (recommended)
- Pros: clearer semantics, safer copy control, low-risk isolated tests.
- Cons: adds one small component + test file.

Chosen approach: Option B.

### Planned Snippets

```tsx
// profiles-panel-react.tsx (concept)
const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; name: string } | null>(null)
const [isDeletePending, setIsDeletePending] = useState(false)

onRemove={() => {
  setDeleteCandidate({ id: preset.id, name: preset.name })
}}
```

```tsx
<ConfirmDeleteProfileDialogReact
  open={deleteCandidate !== null}
  profileName={deleteCandidate?.name ?? ''}
  pending={isDeletePending}
  onOpenChange={(open) => {
    if (!isDeletePending && !open) setDeleteCandidate(null)
  }}
  onConfirm={async () => {
    if (!deleteCandidate || isDeletePending) return false
    setIsDeletePending(true)
    try {
      await onRemovePreset(deleteCandidate.id)
      setDeleteCandidate(null)
      return true
    } catch {
      // Keep dialog open so user can retry or cancel.
      return false
    } finally {
      setIsDeletePending(false)
    }
  }}
/>
```

### Step-by-Step Task Chunks

#### Chunk 1: Modal component foundation
- Create `ConfirmDeleteProfileDialogReact` with:
  - title, description, caution copy
  - `Cancel` and `Delete` actions
  - pending lock behavior on cancel/ESC/backdrop
  - autofocus to Cancel button
Output:
- `src/renderer/confirm-delete-profile-dialog-react.tsx` with API-key modal interaction parity.

#### Chunk 2: Profiles panel integration
- Add local modal state for delete candidate + pending.
- Change trash action from immediate delete to modal open.
- On confirm, call `onRemovePreset` and close modal after completion.
- Keep existing edit-draft cleanup behavior if deleting currently edited card.
Output:
- `src/renderer/profiles-panel-react.tsx` uses confirm flow and removes direct trash->delete path.

#### Chunk 3: Component tests
- Add tests for new modal component:
  - render copy
  - cancel paths (button/ESC/backdrop)
  - pending lock
- Update profiles panel tests:
  - trash opens modal instead of immediate delete
  - cancel keeps profile untouched (`onRemovePreset` not called)
  - confirm calls `onRemovePreset` with expected preset id
  - while modal is open and profiles rerender, confirm still targets original candidate id
  - if candidate is removed externally before confirm, confirm path exits safely without crash
Output:
- Passing tests for open/cancel/confirm/failure/pending and candidate identity stability.

#### Chunk 4: Decision + docs
- Add short decision doc recording why profile-specific dialog was chosen over expanding API-key component.

#### Chunk 5: Verification
- Run focused tests:
  - `src/renderer/confirm-delete-profile-dialog-react.test.tsx`
  - `src/renderer/profiles-panel-react.test.tsx`
  - any impacted shell tests

### Checklist
- [ ] Profile trash button opens confirmation modal.
- [ ] Deletion does not execute before explicit confirm.
- [ ] Modal provides `Cancel` and `Delete` buttons.
- [ ] ESC/backdrop/cancel closes modal when not pending.
- [ ] Pending state blocks close and repeat action.
- [ ] Confirm calls existing profile removal callback with correct preset id.
- [ ] Existing profile remove behavior remains intact after confirm.
- [ ] If delete fails, modal stays open, pending unlocks, and user can retry/cancel.
- [ ] Candidate identity remains correct across rerenders while modal is open.
- [ ] Tests and docs updated.

### Gates
- [ ] `pnpm vitest run src/renderer/confirm-delete-profile-dialog-react.test.tsx` passes.
- [ ] `pnpm vitest run src/renderer/profiles-panel-react.test.tsx` passes.
- [ ] `pnpm vitest run src/renderer/app-shell-react.test.tsx` passes if touched.
- [ ] Manual smoke: delete non-default profile, current default profile, and currently edited profile.
- [ ] No mutation/main-process contract changes (zero diffs in `settings-mutations.ts`, `src/shared/ipc.ts`, `src/main/**`).
- [ ] Diff remains scoped to issue #367 (single-ticket, single-PR).

### Risk Assessment
- Ticket granularity: Good (UI-only, isolated state change, bounded tests).
- Feasibility: High.
- Potential risks:
  - race/duplicate confirm clicks if pending lock is incomplete,
  - stale delete candidate if list rerenders during modal open,
  - accidental coupling with edit-draft state.
- Mitigation:
  - explicit `pending` guard,
  - close/reset candidate in controlled paths,
  - targeted regression tests around open/cancel/confirm behavior.
