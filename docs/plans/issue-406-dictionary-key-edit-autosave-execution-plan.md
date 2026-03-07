<!--
Where: docs/plans/issue-406-dictionary-key-edit-autosave-execution-plan.md
What: Priority-sorted execution plan for follow-up user dictionary UX changes: editable keys and blur autosave for existing entries.
Why: Break the change into reviewable tickets with explicit scope, risks, and gates before implementation starts.
-->

# Issue #406 Follow-up Execution Plan: Editable Dictionary Keys + Blur Autosave

Date: 2026-03-06
Base branch: `main`
Context:
- Prior issue #406 user dictionary support is already merged.
- New feedback requires existing entry keys to be editable/updatable.
- New feedback requires existing entries to autosave on blur and removes the dedicated `Save` button.
- `Delete` remains immediate and confirmation-free.

## Inputs Reviewed

- `src/renderer/dictionary-panel-react.tsx`
- `src/renderer/dictionary-panel-react.test.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/renderer-app.test.ts`
- `docs/plans/issue-406-user-dictionary-execution-plan.md`

## Current Gap Snapshot

1. Existing dictionary row keys are rendered as static text, so key rename is impossible.
2. Existing entry update path only supports `onUpsertEntry(key, value)`, which cannot express "rename old key to new key".
3. Existing row edits require explicit `Save`; row blur does not persist.
4. Current tests cover add/value update/delete, but not key rename or blur-triggered autosave semantics.
5. Current UI copy and interaction contract still imply explicit save for existing entries.

## Delivery Rules

1. One ticket maps to one PR.
2. Tickets are sorted by priority and dependency.
3. Do not start implementation until this plan is accepted.
4. `Delete` remains immediate and confirmation-free.
5. If behavior is ambiguous during implementation, stop and ask before coding that part.

## Working Assumptions For Planning

1. Blur autosave applies to existing dictionary rows only, not the new-entry add form.
2. If both key and value are edited in a row, a blur on either field should save the whole row draft.
3. Rename validation should remain case-insensitive against sibling entries, while allowing self updates.
4. Blur-triggered invalid edits should keep the row in draft state and surface inline validation instead of silently discarding.

## Clarifications Required Before Coding

1. Confirmed: case-only rename persists.
Example: `teh -> Teh` is a valid update and should save the new casing.

2. Confirmed: `Delete` bypasses pending row validation/autosave and removes the original persisted item immediately.

3. Confirmed: valid dictionary row blur saves are isolated from unrelated settings-form validation errors elsewhere in the app.

## Ticket Priority Order

| Priority | Ticket | PR | Dependency | Why now |
|---|---|---|---|---|
| P0 | T1 - Row Editing Contract and Rename Semantics | PR-1 | none | unblock key edit support with explicit update semantics |
| P0 | T2 - Blur Autosave UX for Existing Rows | PR-2 | T1 | deliver requested interaction change and remove Save button |
| P1 | T3 - Regression Coverage and Docs Sync | PR-3 | T1, T2 | lock rename/blur behavior and keep specs truthful |

---

## T1 - Row Editing Contract and Rename Semantics (P0)

### Goal

Allow existing dictionary entries to edit both `key` and `value`, with deterministic rename semantics that preserve case-insensitive uniqueness rules.

### Approach

- Replace row-level static key label with editable key input.
- Introduce a row update callback that includes the original key and next row draft.
- Keep add-entry flow separate from existing-entry update flow.
- Introduce a stable row draft identity keyed by original entry identity, not editable key text.
- Validate rename conflicts against all entries except the row being edited.
- Ship behavior tests in the same PR as the contract change.

### Scope files

- `src/renderer/dictionary-panel-react.tsx`
- `src/renderer/dictionary-panel-react.test.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/renderer-app.test.ts`

### Trade-offs

- Pros: explicit rename semantics prevent accidental "rename becomes add" behavior.
- Pros: stable row identity avoids draft/error loss while a key is being edited.
- Pros: row-local validation can keep UX predictable for duplicate-key and empty-key cases.
- Cons: callback contract becomes more specific than current generic upsert API.
- Cons: row draft state becomes slightly more complex because both key and value must be tracked by stable identity.

### Code snippet (planned)

```tsx
onUpdateEntry({
  originalKey: entry.key,
  rowId: entry.key,
  nextKey: draft.key.trim(),
  nextValue: draft.value.trim()
})
```

### Tasks

1. Replace existing row key label with editable key input.
2. Introduce row draft state for both `key` and `value`, keyed by stable original row identity until commit completes.
3. Replace generic row upsert callback with explicit rename-aware update callback.
4. Implement self-aware duplicate-key validation for renamed entries.
5. Add tests for successful key rename, duplicate-key rejection, and draft stability during rename.

### Checklist

- [ ] existing row keys are editable
- [ ] existing row values remain editable
- [ ] rename updates the original entry instead of adding a second entry
- [ ] duplicate-key checks remain case-insensitive
- [ ] self-update with unchanged key remains allowed
- [ ] case-only rename persists updated casing
- [ ] row draft/error state remains stable while key text is being edited

### Gates

- [ ] `pnpm vitest run src/renderer/dictionary-panel-react.test.tsx`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`

---

## T2 - Blur Autosave UX for Existing Rows (P0)

### Goal

Persist existing dictionary row edits on blur, remove the dedicated `Save` button, and keep `Delete` as the only explicit row action without coupling row commits to unrelated settings-form errors.

### Approach

- Save the row draft when the row loses focus, not when focus moves between controls inside the same row.
- Treat blur as row-level commit, not field-level partial save.
- Do not autosave invalid row drafts; keep inline errors and retain draft text.
- Remove the `Save` button from row UI while keeping `Delete`.
- Add a dictionary-specific commit path in renderer orchestration so row blur is not blocked by unrelated settings validation elsewhere.
- Reconcile local row drafts on successful save, failed persistence rollback, and external `settings-updated` refresh.
- Ship blur/focus/delete regression tests in the same PR.

### Scope files

- `src/renderer/dictionary-panel-react.tsx`
- `src/renderer/dictionary-panel-react.test.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/renderer-app.test.ts`

### Trade-offs

- Pros: aligns dictionary row editing with faster, lower-friction autosave UX.
- Pros: fewer explicit controls in each row.
- Pros: dictionary-specific save path avoids unrelated settings validation blocking valid row commits.
- Cons: blur handling can be tricky around focus transitions between key, value, and delete button.
- Cons: naive blur handling may double-fire saves or save during in-row focus changes unless row-focus boundaries are handled carefully.
- Cons: dedicated dictionary commit path adds parallel persistence logic that must stay aligned with existing settings persistence and rollback behavior.

### Code snippet (planned)

```tsx
const onRowBlur = (event: React.FocusEvent<HTMLDivElement>) => {
  if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
    return
  }
  void commitDictionaryRowDraft(rowId)
}
```

### Tasks

1. Remove row `Save` button.
2. Implement row-level blur boundary handling so intra-row focus changes do not trigger premature save.
3. Introduce dictionary-row commit helper in renderer orchestration that validates only the row contract needed for rename/value update.
4. Reconcile row draft state after successful save, failed rollback, and external settings refresh.
5. Preserve inline validation for invalid blur attempts.
6. Add tests for blur-save, no save on invalid draft, delete-button interaction, and rollback/refresh reconciliation.

### Checklist

- [ ] existing row edits save on blur
- [ ] moving focus between row fields does not trigger premature save
- [ ] invalid blur does not dispatch settings save
- [ ] row `Save` button is removed
- [ ] `Delete` button remains visible and immediate
- [ ] clicking `Delete` bypasses pending row blur validation/autosave and removes the original item
- [ ] valid row blur is not blocked by unrelated settings validation errors
- [ ] failed persistence and external refresh reconcile row drafts predictably

### Gates

- [ ] `pnpm vitest run src/renderer/dictionary-panel-react.test.tsx`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`

---

## T3 - Regression Coverage and Docs Sync (P1)

### Goal

Keep specs/plans/UI guidance aligned with the shipped rename/blur contract after behavior and tests are already in place.

### Approach

- Update docs to say existing entries autosave on blur and that keys are editable.
- Promote any accepted clarifications from the section above into explicit behavior language before coding lands.
- Keep docs narrow to shipped behavior only.

### Scope files

- `src/renderer/dictionary-panel-react.test.tsx`
- `src/renderer/renderer-app.test.ts`
- `specs/spec.md`
- `docs/ui-design-guidelines.md`
- `docs/plans/issue-406-user-dictionary-execution-plan.md` or follow-up plan note if needed

### Trade-offs

- Pros: reduces contract drift after interaction changes.
- Cons: small documentation churn for a targeted UI behavior change.

### Code snippet (planned)

```md
- Existing dictionary entries MUST allow key and value edits.
- Existing dictionary row edits MUST autosave on blur.
- Dictionary rows MUST NOT require a dedicated Save button.
```

### Tasks

1. Update spec/UI guidance for editable key and blur autosave semantics.
2. Record confirmed behavior for case-only rename persistence and delete bypass semantics.
3. Add follow-up plan note only if implementation intentionally differs from this planning doc.
4. Run targeted renderer tests and full test suite.

### Checklist

- [ ] docs mention editable keys
- [ ] docs mention blur autosave and no row save button
- [ ] docs reflect confirmed case-only rename persistence and delete-bypass behavior
- [ ] full suite passes after change

### Gates

- [ ] `pnpm vitest run src/renderer/dictionary-panel-react.test.tsx src/renderer/renderer-app.test.ts`
- [ ] `pnpm test`

---

## Risk Register

1. Focus-boundary risk: blur may fire while moving between key/value/delete inside the same row.
Mitigation: row-container blur boundary using `relatedTarget` containment checks.

2. Rename collision risk: editing a key may incorrectly create a new row or reject valid self-updates.
Mitigation: explicit `originalKey` update contract and self-aware duplicate checks.

3. Row identity risk: editable key text may remount rows and orphan draft/error state.
Mitigation: keep draft/error state keyed by stable original row identity until commit completes.

4. Autosave noise risk: blur may dispatch redundant saves for unchanged rows.
Mitigation: compare normalized draft against original row before dispatch.

5. Validation coupling risk: valid dictionary row save may be blocked by unrelated settings-form errors.
Mitigation: use dictionary-specific commit validation instead of routing through generic full-form autosave gate.

6. Validation UX risk: invalid blur could either silently revert or silently fail.
Mitigation: keep draft text visible and show inline validation until corrected.

7. Rollback reconciliation risk: failed `setSettings` can restore persisted settings while local row drafts still show unsaved text.
Mitigation: explicitly reconcile row drafts after save failure and external settings refresh.

8. Toast noise risk: row-level blur commits may produce excessive global autosave toasts.
Mitigation: decide whether dictionary-specific commit path should suppress generic autosave success toasts for row blur commits.

9. Test flake risk: blur/focus tests can be timing-sensitive in jsdom.
Mitigation: keep tests focused on observable callback dispatch and use explicit flush/wait helpers.

## Proposed Implementation Order

1. T1
2. T2
3. T3
