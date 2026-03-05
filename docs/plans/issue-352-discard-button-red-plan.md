<!--
Where: docs/plans/issue-352-discard-button-red-plan.md
What: Execution-ready plan for making Unsaved Profile Changes modal Discard action destructive-red.
Why: Align destructive affordance with existing API key delete confirmation modal style contract.
-->

# Plan: Discard Button Should Be Red

Date: March 5, 2026  
Status: Planning only (no implementation started)

## Priority-ordered tickets (1 ticket = 1 PR)

## Ticket P0 — PR #1: Make Unsaved-Changes `Discard` destructive-red and lock with tests

### Goal
Update the `Discard` action in the `Unsaved profile changes` modal to use destructive-red styling and add focused tests so the visual contract cannot regress.

### Why this is P0
- Directly addresses the user-visible issue.
- Must ship with tests in the same PR to avoid untested UI-contract drift.

### Approach
- Change only the `Discard` button class in `AppShell` unsaved-draft modal.
- Use the same destructive token pair used by API-key delete confirm: `bg-destructive text-destructive-foreground`.
- Add dialog-scoped test assertions in `AppShell` tests (not global text-only search).
- Preserve all existing behavior/state flow.

### Scope files
- `src/renderer/app-shell-react.tsx`
- `src/renderer/app-shell-react.test.tsx`

### Checklist
- [ ] `Discard` button uses `bg-destructive text-destructive-foreground`.
- [ ] `Discard` keeps transition/disabled styling (`hover`, `disabled`) consistent with destructive actions.
- [ ] Existing `Stay` and `Save and continue` behavior and order are unchanged.
- [ ] Tests scope to the `Unsaved profile changes` dialog container.
- [ ] Tests assert destructive classes on `Discard`.
- [ ] Tests assert a deterministic disabled path: `Save and continue` in-flight state disables `Discard`.

### Tasks
1. Locate unsaved-draft dialog action row in `src/renderer/app-shell-react.tsx`.
2. Replace neutral `Discard` classes with destructive token classes while keeping size/layout stable.
3. Extend `src/renderer/app-shell-react.test.tsx`:
- Open the unsaved dialog via dirty-navigation flow.
- Scope element lookup to the dialog content containing title `Unsaved profile changes`.
- Assert the dialog-local `Discard` button has `bg-destructive` and `text-destructive-foreground`.
4. Add/extend a test path with a pending save promise:
- Stub `onSavePresetDraft` to return an unresolved promise.
- Click `Save and continue`.
- Assert dialog-local `Discard` is disabled while save is in flight.
5. Run targeted renderer tests and confirm no regressions in existing unsaved-dialog behavior tests.

### Gates
- Gate 1 (Visual contract): `Discard` class list includes `bg-destructive` and `text-destructive-foreground`.
- Gate 2 (State safety): existing discard/save/stay flow assertions remain green.
- Gate 3 (Interaction state): disabled-state assertion exists for `Discard` while `Save and continue` is in flight.
- Gate 4 (Regression): targeted test command passes.

### Trade-offs
- Option A (selected): Filled destructive-red `Discard`.
- Pros: strongest destructive affordance; matches existing API-key delete confirmation language.
- Cons: two prominent actions in modal (`Discard` and primary save action) can increase visual competition.

- Option B (not selected): Muted/outline destructive treatment.
- Pros: less visual competition.
- Cons: weaker destructive signal; poorer parity with existing destructive confirmation pattern.

### Proposed snippets (non-applied)
```tsx
<button
  type="button"
  disabled={isDialogActionDisabled}
  className="h-7 rounded bg-destructive px-2.5 text-xs text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50"
  onClick={() => {
    if (isDialogActionDisabled) return
    setIsGuardActionPending(true)
    profilesPanelRef.current?.discardActiveDraft()
    proceedPendingNavigation()
    setIsGuardActionPending(false)
  }}
>
  Discard
</button>
```

```tsx
const dialogTitle = Array.from(document.querySelectorAll('[data-slot="dialog-content"]')).find((el) =>
  el.textContent?.includes('Unsaved profile changes')
)
expect(dialogTitle).not.toBeNull()

const discardButton = Array.from(dialogTitle!.querySelectorAll('button')).find(
  (button) => button.textContent?.trim() === 'Discard'
)
expect(discardButton?.className).toContain('bg-destructive')
expect(discardButton?.className).toContain('text-destructive-foreground')
```

### Potential risks and mitigations
- Risk: red `Discard` may be read as profile deletion instead of draft loss.
- Mitigation: keep modal copy explicit about unsaved edits; no deletion wording.

- Risk: token drift from design system changes.
- Mitigation: test locks destructive token pair in this dialog.

- Risk: brittle test selectors.
- Mitigation: scope assertions to the specific dialog container by title.

### Feasibility
High. Small UI diff plus focused test updates in existing test file.

---

## Ticket P1 — PR #2: Document the destructive semantics for unsaved-draft discard

### Goal
Document why unsaved-draft `Discard` is intentionally treated as destructive, so future UI refactors keep this decision consistent.

### Why this is P1
- Valuable for maintainability, but non-blocking compared to the visual/test fix.

### Approach
- Update a single canonical design doc target: `docs/style-update.md`.
- Add one concise rule under modal/action guidance, referencing destructive token pair.

### Scope files
- `docs/style-update.md`

### Checklist
- [ ] Rule states unsaved-draft `Discard` uses destructive token style.
- [ ] Rule distinguishes draft-loss semantics from non-destructive cancel/stay actions.
- [ ] Rule is concise and references existing token names.

### Tasks
1. Add a short bullet in modal/action section for unsaved profile draft dialog.
2. Clarify that action represents irreversible loss of in-memory edits.
3. Keep update minimal; no broad design-system rewrite.

### Gates
- Gate 1 (Clarity): wording is unambiguous and scoped to unsaved-draft modal.
- Gate 2 (Consistency): token names match implementation (`bg-destructive text-destructive-foreground`).

### Trade-offs
- Option A (selected): update `docs/style-update.md` only.
- Pros: single style source of truth.
- Cons: feature rationale remains implicit in decision docs.

- Option B (not selected): update decision doc instead.
- Pros: stronger feature-history context.
- Cons: style rule less discoverable for UI contributors.

### Proposed snippet (non-applied)
```md
- Unsaved profile draft modal: `Discard` MUST use `bg-destructive text-destructive-foreground`
  because it irreversibly drops in-memory edits.
```

### Potential risks and mitigations
- Risk: over-documentation for small change.
- Mitigation: one concise bullet only.

### Feasibility
High.

---

## Verification commands

Run before merge for PR #1:

1. `pnpm test src/renderer/app-shell-react.test.tsx`
2. `pnpm test src/renderer/renderer-app.test.ts` (optional sanity for related navigation guard behavior)

Run before merge for PR #2:

1. No code tests required (docs-only).
2. Manual doc lint/readability check in changed section.

## Out of scope

- Scope note for issue `#352`: this plan only addresses visual parity for destructive-action styling (acceptance criterion #6 consistency), not the profile-delete confirmation-flow behavior (criteria #1-#5).
- Full issue #352 implementation for profile deletion confirmation modal behavior.
- Changing modal copy text (`Stay`, `Discard`, `Save and continue`).
- Reordering buttons.
