<!--
Where: docs/plans/issue-406-dictionary-column-labels-execution-plan.md
What: Execution plan for dictionary entry column labels.
Why: Keep the UI adjustment scoped to one reviewable PR with explicit risk and test gates.
-->

# Issue 406 Dictionary Column Labels Execution Plan

## Ticket 1: Add Dictionary Entry Column Labels

### Goal
- Add a visible label row above dictionary entries so the key/value columns are explicitly labeled `Replace` and `With`.
- Make the label row visually distinct from dictionary item rows without changing the current blur-save or delete behavior.

### Checklist
- Add a visible header row above populated dictionary entries.
- Use exact labels `Replace` and `With`.
- Apply a distinct muted color treatment to the header row.
- Keep add/edit/delete logic unchanged.
- Add focused component coverage for the labels and styling hook.

### Tasks
- Update `src/renderer/dictionary-panel-react.tsx` to render a header row only when entries exist.
- Use a stable selector for test coverage so the visual treatment is locked without snapshot noise.
- Extend `src/renderer/dictionary-panel-react.test.tsx` with one focused test for exact labels and header styling.
- Run focused renderer tests and typecheck.

### Gates
- `pnpm vitest run src/renderer/dictionary-panel-react.test.tsx`
- `pnpm run typecheck`

### Approach
- Keep the change local to the dictionary panel instead of introducing shared layout primitives.
- Render the header as a compact row immediately above the list to preserve current row markup and event handling.
- Use a muted background and muted foreground token so the header is distinct from entry rows but still aligned with the existing design system.

### Scope Files
- `src/renderer/dictionary-panel-react.tsx`
- `src/renderer/dictionary-panel-react.test.tsx`
- `docs/plans/issue-406-dictionary-column-labels-execution-plan.md`

### Trade-Offs
- Reusing utility classes keeps the diff small and easy to review, but exact visual balance still depends on the existing theme tokens.
- Adding a test hook is slightly more explicit than purely text-based assertions, but it avoids brittle DOM traversal and makes the styling contract clear.

### Code Snippet
```tsx
<div
  data-testid="dictionary-entry-header"
  className="grid grid-cols-[minmax(6rem,1fr)_minmax(0,1fr)_auto] ... bg-muted/60 ..."
>
  <span>Replace</span>
  <span>With</span>
  <span aria-hidden="true" />
</div>
```
