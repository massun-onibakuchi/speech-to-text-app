---
title: Fix scratch-space focus and mini-menu behavior
description: Plan a small-step rollout to fix scratch-space autofocus, stabilize the scratch-local mini menu, correct Escape precedence, and improve mini-menu legibility.
date: 2026-04-09
status: active
review_by: 2026-04-16
tags:
  - plan
  - scratch-space
  - profile-picker
  - electron
  - renderer
---

# Fix scratch-space focus and mini-menu behavior

## Goal

Deliver a scratch-space flow where:

- opening scratch space leaves the user in a predictable typing-ready state
- the `pickTransformation` shortcut opens a scratch-local preset menu instead of the global popup flow
- the focused-only `Cmd+K` mini menu behaves as a child of scratch space rather than a separate global popup flow
- `Escape` closes only the topmost scratch-local surface
- the `Cmd+K` mini menu is visually legible above the popup and whatever sits behind it

## Target branch

- `main`

## Proposed approach

The research in `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md` shows that the current bugs come from mixing two popup ownership models:

1. scratch space is a dedicated utility editor window
2. scratch-local interactions are still leaking onto the global profile-picker popup path

The accepted contract is already recorded in `docs/adr/0014-scratch-space-focus-contract.md` and the current spec: scratch opens as an activating typing surface, the configured `pickTransformation` shortcut opens a scratch-local preset menu while scratch is visible, and a separate focused-only `Cmd+K` mini menu remains local to the scratch window.

This plan keeps the existing global picker for global transformation shortcuts, but stops using that model for scratch-space-local interaction. Both scratch-local menus should live inside the scratch renderer so they can share one source of truth for:

- active surface state
- focus return behavior
- `Escape` ownership
- visual layering

Shortcut transport must stay explicit. The current `pickTransformation` trigger is a main-process global shortcut, while `Cmd+K` is a focused scratch-window shortcut. The implementation therefore needs two distinct routes:

1. when scratch is visible, `HotkeyService` and the IPC layer must forward `pickTransformation` into the visible scratch window so the scratch-local preset menu can open without a click
2. when scratch is focused, the scratch renderer owns `Cmd+K` locally and must not register it as a global shortcut

The plan below treats those routes as required work, not implementation details to improvise later.

## Scope

In scope:

- scratch-space open/focus behavior
- scratch-local preset-menu trigger and rendering for `pickTransformation`
- scratch-local `Cmd+K` mini-menu trigger and rendering
- nested `Escape` semantics across both local menus
- scratch `Cmd+K` mini-menu styling and layering
- unit tests and renderer tests for the new behavior
- doc updates required to keep the accepted contract and implementation plan aligned

Out of scope:

- changing the global `pickTransformation` flow for non-scratch use cases
- refactoring unrelated settings or tray shortcut behavior
- redesigning the general profile-picker service beyond the minimum needed to keep global flows working
- adding new scratch-space features unrelated to focus/menu behavior

## Relevant files and modules

Primary implementation surfaces:

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/main/services/profile-picker-service.ts`
- `src/main/services/profile-picker-service.test.ts`
- `src/main/services/temporary-popup-shortcut-manager.ts`
- `src/main/services/temporary-popup-shortcut-manager.test.ts`
- `src/main/services/hotkey-service.ts`
- `src/main/services/hotkey-service.test.ts`
- `src/main/ipc/register-handlers.ts`

Likely supporting surfaces:

- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `e2e/electron-ui.e2e.ts`
- `e2e/fixtures/scratch-space-e2e-preload.cjs`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/adr/`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

## Risks and open questions

### R1: preset-menu and `Cmd+K` mini-menu ownership can still be conflated

Confidence: 82

The spec requires two distinct scratch-local surfaces:

- a preset menu opened by the configured global `pickTransformation` shortcut while scratch is visible
- a focused-only `Cmd+K` mini menu with transform-and-copy and transform-and-paste actions

If the implementation merges them into one overlay, it will ship the wrong shortcut and keyboard behavior.

### R2: scratch-local preset ownership should not break global picker flows

Confidence: 82

The repo still needs the native profile picker for global `pickTransformation` and `changeTransformationDefault`. The scratch-specific fix should not regress those paths.

### R3: nested `Escape` routing can regress silently

Confidence: 79

The current system splits ownership across renderer keydown handlers and main-process temporary global shortcuts. The new design needs explicit tests for preset-menu state, `Cmd+K` mini-menu state, and their interaction with outer scratch close behavior so later refactors cannot reintroduce the bug.

## Validation strategy

Automated checks to run during the implementation tasks:

- `pnpm vitest run src/renderer/scratch-space-app.test.tsx`
- `pnpm vitest run src/main/services/scratch-space-service.test.ts`
- `pnpm vitest run src/main/services/scratch-space-window-service.test.ts`
- `pnpm vitest run src/main/services/profile-picker-service.test.ts`
- `pnpm vitest run src/main/services/temporary-popup-shortcut-manager.test.ts`
- `pnpm vitest run src/main/services/hotkey-service.test.ts`
- `pnpm playwright test e2e/electron-ui.e2e.ts --grep \"scratch-space mini menu shortcuts\"`
- `pnpm run docs:validate -- docs/adr/0014-scratch-space-focus-contract.md docs/plans/006-scratch-space-focus-and-mini-menu-fixes.md docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

Manual verification to perform once implementation is done:

1. Open scratch space from another app and verify it activates and focuses the draft textarea immediately.
2. Trigger the configured `pickTransformation` shortcut without first clicking scratch space and confirm the scratch-local preset menu opens.
3. Press `Escape` while the preset menu is open and confirm only the preset menu closes and draft focus returns.
4. With scratch focused, press `Cmd+K` and confirm the local mini menu opens with the first item selected.
5. While the `Cmd+K` mini menu is open, verify `ArrowUp`, `ArrowDown`, `Enter`, `Cmd+Enter`, and `Escape` all match the spec.
6. Confirm the `Cmd+K` mini menu remains readable over a bright control in the underlying app.
7. Run one `Cmd+K` mini-menu action end to end and confirm the success path closes scratch and clears the draft only after the required copy or paste succeeds.
8. Force one mini-menu initiated failure after the window hides and confirm scratch reopens with the same draft/profile, is immediately interactive, and comes back with the mini menu closed.
9. Confirm global `pickTransformation` and `changeTransformationDefault` outside scratch space still use the native picker path.

## Ordered tasks

## Task 1: Align the workstream to the accepted scratch-space focus contract

### Goal

Treat the existing ADR/spec as authoritative so implementation starts from the accepted activating focus contract instead of reopening it.

### Files in scope

- `docs/adr/0014-scratch-space-focus-contract.md`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

### Changes

- Treat `docs/adr/0014-scratch-space-focus-contract.md` as the governing decision instead of writing a replacement ADR.
- Confirm `specs/spec.md` and `specs/user-flow.md` still match that accepted contract exactly.
- Where the ADR is silent on the separate `Cmd+K` mini-menu layer, treat the current spec as authoritative and update the ADR during implementation so the three-level `Escape` hierarchy is explicit there too.
- If wording drift exists, update the plan and supporting docs to reference the accepted activating path and the two distinct scratch-local menus.

### Definition of Done

- The activating focus contract is treated as settled, not reopened.
- There is no remaining ambiguity about scratch activation, preset-menu ownership, `Cmd+K` ownership, or the three-level `Escape` hierarchy for implementation tasks.
- Supporting docs reference the accepted decision consistently if edits were needed.

## Task 2: Introduce scratch-local preset-menu state for `pickTransformation`

### Goal

Stop treating the scratch preset chooser as the global native profile picker and make the trigger path explicit.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/hotkey-service.ts`
- `src/main/services/hotkey-service.test.ts`
- `src/main/ipc/register-handlers.ts`
- `e2e/electron-ui.e2e.ts`
- `e2e/fixtures/scratch-space-e2e-preload.cjs`
- `src/preload/index.ts`
- `src/shared/ipc.ts`

### Changes

- Add explicit renderer state for:
  - preset-menu open/closed
  - highlighted preset
  - focus return target when the preset menu closes
- Implement explicit trigger transport for the configured global `pickTransformation` shortcut:
  - when scratch is visible, `HotkeyService` and IPC forward the request into the scratch renderer
  - when scratch is not visible, the existing global native picker path remains in place
- Keep the scratch preset-menu trigger separate from the global native picker path so the renderer menu does not depend on frontmost-app capture/restore.
- Keep the preset menu inside the scratch renderer tree so it inherits the popup lifecycle and focus semantics.
- Keep scope tight: this menu only solves the scratch-space preset-selection use case.

### Definition of Done

- Scratch space can open its own preset menu without spawning the native profile picker.
- The configured `pickTransformation` shortcut works even when scratch is visible but has not been clicked first.
- The menu can open regardless of whether the old global picker flow would have captured a different frontmost app.
- Renderer tests cover open/close state, highlighted preset selection, and focus return.
- Main-process shortcut tests cover the scratch-visible forwarding path and the non-scratch native picker path.

## Task 3: Implement the accepted activating scratch-space focus behavior

### Goal

Make scratch-space open behavior deterministic and testable under the accepted activating contract.

### Files in scope

- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `e2e/electron-ui.e2e.ts`
- `e2e/fixtures/scratch-space-e2e-preload.cjs`

### Changes

- Update the window show path to activate scratch on open and keep target-app restore behavior intact for paste.
- Make textarea focus deterministic on open without relying on a one-shot `requestAnimationFrame` call alone.
- Add tests that pin the final contract.

### Definition of Done

- The textarea focus behavior matches the accepted ADR/spec contract.
- The implementation has a deterministic test, not just manual verification.
- The scratch open path does not regress the existing paste-target capture behavior.
- Scratch-space service tests still protect target-app restore, retry reopen, and draft lifecycle behavior.

## Task 4: Introduce the local focused-only `Cmd+K` mini menu

### Goal

Implement the separate scratch-local action menu required by the spec without routing it through the global preset-picker path.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `e2e/electron-ui.e2e.ts`
- `e2e/fixtures/scratch-space-e2e-preload.cjs`
- `specs/spec.md`
- `specs/user-flow.md`

### Changes

- Add explicit renderer state for the `Cmd+K` mini menu:
  - mini-menu open/closed
  - highlighted action
  - focus return target when the mini menu closes
- Bind `Cmd+K` only while the scratch window is focused; do not register it as a global shortcut.
- Implement the spec-defined keyboard behavior for the mini menu:
  - open with item 1 selected
  - close on a second `Cmd+K`
  - `ArrowUp` and `ArrowDown` move selection without wrap
  - `Enter` executes the highlighted item
  - `Cmd+Enter` always executes transform-and-paste
- Wire the mini-menu actions into the scratch execution path:
  - transform-and-copy copies the transformed result and closes scratch without pasting
  - transform-and-paste uses the same hidden-window execution path as `Cmd+Enter`
  - success clears the persisted draft only after the required copy or paste action succeeds
- Cover the required failure path for mini-menu initiated execution:
  - if execution fails after the window hides, scratch reopens with the same draft and selected profile
  - the reopened scratch window is immediately interactive
  - the reopened scratch window comes back with the mini menu closed
- Keep the mini menu inside the scratch renderer tree and keep it separate from preset-menu state.

### Definition of Done

- Focused scratch space opens a local `Cmd+K` mini menu without touching main-process global shortcut registration.
- Renderer and service tests cover open/close behavior, initial selection, required keyboard semantics, mini-menu action execution, and hidden-window failure retry behavior.
- The mini menu stays distinct from preset-menu state in code and in tests.

## Task 5: Centralize `Escape` ownership for scratch space and the nested local menus

### Goal

Ensure `Escape` closes only the topmost open surface.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `e2e/electron-ui.e2e.ts`
- `src/main/services/temporary-popup-shortcut-manager.ts` only if still needed for scratch
- `src/main/services/scratch-space-window-service.ts` only if main-process scratch `Escape` behavior must be reduced or conditioned

### Changes

- Move scratch `Escape` handling behind explicit UI state:
  - if the preset menu is open, close the preset menu only
  - else if the `Cmd+K` mini menu is open, close the mini menu only
  - otherwise close scratch space
- Remove or narrow any unconditional close behavior that bypasses nested state.
- Preserve current busy-state behavior where appropriate.

### Definition of Done

- `Escape` closes the preset menu first, the `Cmd+K` mini menu second when applicable, and scratch last.
- Tests cover the nested cases in sequence.
- There is one clear owner for scratch-space-local `Escape` behavior.

## Task 6: Improve `Cmd+K` mini-menu visual isolation and legibility

### Goal

Make the `Cmd+K` mini menu readable above scratch space and a bright underlying app.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/styles.css`
- `src/renderer/scratch-space-app.test.tsx`
- `e2e/electron-ui.e2e.ts`

### Changes

- Use an opaque surface with stronger contrast than the current picker card.
- Add a local scrim or shield inside the scratch window if needed so bright elements behind the menu stop competing visually.
- Keep the styling aligned with repo tokens instead of introducing a one-off visual system.

### Definition of Done

- The `Cmd+K` mini menu is visually distinct from its surroundings.
- Tests pin any class or DOM structure that is critical to the styling contract.
- The change improves readability without touching unrelated app surfaces.

## Task 7: Preserve global picker behavior and remove scratch-only coupling

### Goal

Keep global transformation shortcuts working after scratch stops using the native picker flow.

### Files in scope

- `src/main/services/profile-picker-service.ts`
- `src/main/services/profile-picker-service.test.ts`
- `src/main/services/hotkey-service.ts`
- `src/main/services/hotkey-service.test.ts`
- `src/main/ipc/register-handlers.ts`

### Changes

- Remove any accidental scratch dependency from the global picker path.
- Verify global `pickTransformation` and `changeTransformationDefault` still use the native picker where intended.
- Update or add tests only where the scratch-specific migration changed assumptions.

### Definition of Done

- Global picker flows still behave as before.
- Scratch-specific behavior is no longer relying on global picker semantics.
- Test coverage explicitly protects both paths.

## Task 8: Final doc and regression pass

### Goal

Finish the workstream with aligned docs and regression coverage.

### Files in scope

- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`
- test files changed in earlier tasks
- `e2e/electron-ui.e2e.ts`

### Changes

- Update the research doc conclusion if implementation reveals any corrected assumptions.
- Confirm spec and user-flow language match shipped behavior.
- Confirm the shipped behavior still distinguishes the scratch-local preset menu from the focused-only `Cmd+K` mini menu.
- Run the targeted tests and doc validation.

### Definition of Done

- Controlled docs validate cleanly.
- Targeted automated tests pass.
- Manual verification covers the full user-reported flow.

## Main workstreams

1. Align implementation to the accepted scratch-space focus contract.
2. Make the scratch preset menu local to scratch while preserving the global picker outside scratch.
3. Add the separate focused-only `Cmd+K` mini menu, then centralize nested keyboard ownership and improve its legibility.
4. Preserve the existing global picker behavior for non-scratch flows.
