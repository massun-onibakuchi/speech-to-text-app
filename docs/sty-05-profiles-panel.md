<!--
Where: docs/sty-05-profiles-panel.md
What: STY-05 implementation notes for the Profiles tab redesign.
Why: Document the shipped interaction contract and rollback validation for this ticket PR.
-->

# STY-05 Profiles Panel

**Date**: 2026-02-27
**Scope**: Profiles tab surface plus minimal renderer wiring for preset-save/persistence callbacks.

## Implemented Behavior

- Profiles render as compact cards in a scrollable in-panel list.
- The default profile shows a persistent `default` badge.
- Card hover/focus reveals icon actions (set default, edit, remove).
- Opening inline edit does not change the current default profile.
- Cards are keyboard activatable with Enter/Space (`role="button"` + `tabIndex={0}`).
- Inline edit opens directly below the selected card and does not navigate away.
- Inline form uses compact controls (`h-7`, `grid-cols-2`, `min-h-[60px]` system prompt, mono user prompt).
- Save persists through the preset-save flow for the edited profile; Cancel closes editor without saving.
- Add profile remains pinned in the panel footer.
- Icon-only controls expose explicit `aria-label` and `focus-visible` ring treatment.

## Validation

- Component tests:
  - `src/renderer/profiles-panel-react.test.tsx`
  - Asserts card rendering, default badge, keyboard activation, inline edit open/close, save/cancel/add/remove wiring.
- Integration tests:
  - `src/renderer/app-shell-react.test.tsx`
  - `src/renderer/renderer-app.test.ts`
  - `src/renderer/settings-mutations.test.ts`
  - `src/renderer/settings-validation.test.ts`
  - Confirms Profiles tab wiring remains mounted in the tabbed shell model.

## Rollback

1. Revert the STY-05 commit(s) on `sty-05-profiles-panel`.
2. Run:
   - `pnpm -s vitest run src/renderer/profiles-panel-react.test.tsx`
   - `pnpm -s vitest run src/renderer/app-shell-react.test.tsx src/renderer/renderer-app.test.ts`
3. Confirm Profiles tab still renders and existing settings transformation flows remain functional.
