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
- the scratch-space mini menu behaves as a child of scratch space rather than a separate global popup flow
- `Escape` closes only the topmost surface
- the mini menu is visually legible above the popup and whatever sits behind it

## Target branch

- `main`

## Proposed approach

The research in `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md` shows that the current bugs come from mixing two popup ownership models:

1. scratch space is a dedicated utility editor window
2. the mini menu is still using the global profile-picker popup path

This plan keeps the existing global picker for global transformation shortcuts, but stops using that model for scratch-space-local interaction. The scratch-space mini menu should move into the scratch renderer so it can share one source of truth for:

- active surface state
- focus return behavior
- `Escape` ownership
- visual layering

Shortcut transport must stay explicit. The current trigger is a main-process global shortcut, not a renderer-local keybinding. The implementation therefore needs one of these two routes:

1. if Task 1 decides scratch activates on open, the scratch renderer can own the shortcut after activation
2. if Task 1 keeps scratch non-activating, `HotkeyService` and the IPC layer must forward the trigger into the visible scratch window so the scratch-local menu can still open without a click

The plan below treats that routing as required work, not an implementation detail to improvise later.

The only deliberately unresolved choice is the macOS typing contract on fresh open. The code currently uses a non-activating panel and the spec requires that behavior, but the product request is “open and immediately type.” That needs to be settled explicitly before implementation proceeds. The first task therefore records the decision and turns the expected behavior into a concrete contract.

## Scope

In scope:

- scratch-space open/focus behavior
- scratch-space-local mini menu trigger and rendering
- nested `Escape` semantics
- scratch mini-menu styling and layering
- unit tests and renderer tests for the new behavior
- spec/doc updates required by the chosen focus contract

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
- `src/main/ipc/register-handlers.ts`

Likely supporting surfaces:

- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/adr/`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

## Risks and open questions

### R1: macOS activation contract is not settled

Confidence: 72

The current spec says scratch space should open as a non-activating utility panel, but the requested UX is “open and immediately type.” We should not code around this ambiguity ad hoc. Task 1 resolves it and records the contract. If the answer is “scratch must stay non-activating,” then the implementation must define what “typing-ready” means in that mode. If the answer is “scratch may activate when opened,” the spec and window behavior must change together.

### R2: scratch-local menu ownership should not break global picker flows

Confidence: 82

The repo still needs the native profile picker for `pickTransformation` and `changeTransformationDefault`. The scratch-specific fix should not regress those paths.

### R3: Escape routing can regress silently

Confidence: 79

The current system splits ownership across renderer keydown handlers and main-process temporary global shortcuts. The new design needs explicit tests for nested popup state so later refactors cannot reintroduce the bug.

## Validation strategy

Automated checks to run during the implementation tasks:

- `pnpm vitest run src/renderer/scratch-space-app.test.tsx`
- `pnpm vitest run src/main/services/scratch-space-service.test.ts`
- `pnpm vitest run src/main/services/scratch-space-window-service.test.ts`
- `pnpm vitest run src/main/services/profile-picker-service.test.ts`
- `pnpm vitest run src/main/services/temporary-popup-shortcut-manager.test.ts`
- `pnpm vitest run src/main/services/hotkey-service.test.ts`
- `pnpm run docs:validate -- docs/plans/006-scratch-space-focus-and-mini-menu-fixes.md docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

Manual verification to perform once implementation is done:

1. Open scratch space from another app and verify the final chosen typing contract.
2. Trigger the scratch-local mini menu with the configured shortcut without first clicking scratch space.
3. Press `Escape` while the mini menu is open and confirm only the mini menu closes.
4. Press `Escape` again after the mini menu closes and confirm scratch space closes.
5. Confirm the mini menu remains readable over a bright control in the underlying app.
6. Confirm global `pickTransformation` outside scratch space still uses the native picker path.

## Ordered tasks

## Task 1: Lock the scratch-space focus contract and record the decision

### Goal

Resolve the “non-activating panel vs immediate typing” ambiguity before changing runtime behavior.

### Files in scope

- `docs/adr/0014-scratch-space-focus-contract.md`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`

### Changes

- Write an ADR that chooses one contract:
  - scratch stays non-activating and only focuses the textarea after explicit scratch activation
  - or scratch activates on open so typing works immediately
- Update spec/user-flow text to match that contract exactly.
- If the contract keeps non-activation, document the expected focus handoff when the user activates scratch later.

### Definition of Done

- The activation/focus behavior is explicitly decided and documented.
- There is no remaining spec ambiguity for implementation tasks.
- The research doc links to the decision if needed.

## Task 2: Introduce scratch-local mini-menu state in the renderer

### Goal

Stop treating the scratch mini menu as the global native profile picker and make the trigger path explicit.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/hotkey-service.ts`
- `src/main/services/hotkey-service.test.ts`
- `src/main/ipc/register-handlers.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`

### Changes

- Add explicit renderer state for:
  - mini-menu open/closed
  - focused menu item
  - focus return target when the menu closes
- Implement the trigger transport that matches Task 1's focus contract:
  - if scratch activates on open, the renderer may own the shortcut directly after activation
  - if scratch remains non-activating, `HotkeyService` and IPC must forward the global shortcut into the visible scratch window
- Keep the scratch trigger separate from the global native picker path so the renderer menu does not depend on frontmost-app capture/restore.
- Keep the mini menu inside the scratch renderer tree so it inherits the popup’s lifecycle and focus semantics.
- Keep scope tight: this menu should only solve the scratch-space use case, not replace the global picker service.

### Definition of Done

- Scratch space can open its own mini menu without spawning the native profile picker.
- The plan’s chosen shortcut route works even when scratch is visible but has not been clicked first.
- The menu can open regardless of whether the old global picker flow would have captured a different frontmost app.
- Renderer tests cover open/close state and initial focused item selection.
- Main-process shortcut tests cover the scratch-visible trigger path when IPC forwarding is used.

## Task 3: Implement the chosen scratch-space focus behavior

### Goal

Make scratch-space open behavior deterministic and testable under the contract chosen in Task 1.

### Files in scope

- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`

### Changes

- If scratch remains non-activating:
  - add a reliable refocus path that runs when scratch becomes the active window
  - do not rely on a one-shot `requestAnimationFrame` call alone
- If scratch activates on open:
  - update the window show path accordingly and keep target-app restore behavior intact for paste
- Add tests that pin the final contract.

### Definition of Done

- The textarea focus behavior matches the recorded decision.
- The implementation has a deterministic test, not just manual verification.
- The scratch open path does not regress the existing paste-target capture behavior.
- Scratch-space service tests still protect target-app restore, retry reopen, and draft lifecycle behavior.

## Task 4: Centralize `Escape` ownership for scratch space and the nested mini menu

### Goal

Ensure `Escape` closes only the topmost open surface.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/temporary-popup-shortcut-manager.ts` only if still needed for scratch
- `src/main/services/scratch-space-window-service.ts` only if main-process scratch `Escape` behavior must be reduced or conditioned

### Changes

- Move scratch `Escape` handling behind explicit UI state:
  - if mini menu is open, close mini menu only
  - otherwise close scratch space
- Remove or narrow any unconditional close behavior that bypasses nested state.
- Preserve current busy-state behavior where appropriate.

### Definition of Done

- `Escape` closes the mini menu first and scratch second.
- Tests cover both cases in sequence.
- There is one clear owner for scratch-space-local `Escape` behavior.

## Task 5: Improve mini-menu visual isolation and legibility

### Goal

Make the menu readable above scratch space and a bright underlying app.

### Files in scope

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/styles.css`
- `src/renderer/scratch-space-app.test.tsx`

### Changes

- Use an opaque surface with stronger contrast than the current picker card.
- Add a local scrim or shield inside the scratch window if needed so bright elements behind the menu stop competing visually.
- Keep the styling aligned with repo tokens instead of introducing a one-off visual system.

### Definition of Done

- The mini menu is visually distinct from its surroundings.
- Tests pin any class or DOM structure that is critical to the styling contract.
- The change improves readability without touching unrelated app surfaces.

## Task 6: Preserve global picker behavior and remove scratch-only coupling

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
- Verify `pickTransformation` and `changeTransformationDefault` still use the native picker where intended.
- Update or add tests only where the scratch-specific migration changed assumptions.

### Definition of Done

- Global picker flows still behave as before.
- Scratch-specific behavior is no longer relying on global picker semantics.
- Test coverage explicitly protects both paths.

## Task 7: Final doc and regression pass

### Goal

Finish the workstream with aligned docs and regression coverage.

### Files in scope

- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/011-scratch-space-focus-and-mini-menu-bugs.md`
- test files changed in earlier tasks

### Changes

- Update the research doc conclusion if implementation reveals any corrected assumptions.
- Confirm spec and user-flow language match shipped behavior.
- Run the targeted tests and doc validation.

### Definition of Done

- Controlled docs validate cleanly.
- Targeted automated tests pass.
- Manual verification covers the full user-reported flow.

## Main workstreams

1. Settle the focus contract and document it.
2. Make the mini menu scratch-local instead of reusing the global native picker.
3. Centralize nested keyboard ownership and improve visual legibility.
4. Preserve the existing global picker behavior for non-scratch flows.
