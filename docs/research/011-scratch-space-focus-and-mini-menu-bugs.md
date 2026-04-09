---
title: Scratch-space focus and mini-menu bug analysis
description: Investigate scratch-space autofocus, nested mini-menu shortcut behavior, visual isolation, and Escape ownership bugs.
date: 2026-04-09
status: concluded
tags:
  - research
  - scratch-space
  - profile-picker
  - electron
  - bugs
---

# Scratch-space focus and mini-menu bug analysis

## Scope

Files read for this investigation:

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/main/services/profile-picker-service.ts`
- `src/main/services/profile-picker-service.test.ts`
- `src/main/services/temporary-popup-shortcut-manager.ts`
- `src/main/services/temporary-popup-shortcut-manager.test.ts`
- `src/main/services/hotkey-service.ts`
- `src/main/services/hotkey-service.test.ts`
- `src/main/ipc/register-handlers.ts`
- `src/shared/domain.ts`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/002-popup-window-handling-and-frontmost-behavior.md`

External references used to verify Electron behavior:

- Electron `BrowserWindow` docs: `show()` focuses, `showInactive()` shows without focus.
- Electron `globalShortcut` docs: global shortcuts should still work when the app does not have keyboard focus.

## Problem framing

The reported issues all sit at the boundary between two different popup models in the current codebase:

1. Scratch space is implemented as a background-like utility window.
2. The mini menu is not implemented inside scratch space. The only matching popup in this repo is the global profile picker used by transformation shortcut flows.

That split is the root of the instability. Scratch space behaves like a nested, local editing surface. The mini menu behaves like a global shortcut popup that captures and restores the system frontmost app.

## Flow summary

### Scratch-space open

1. `HotkeyService` registers `openScratchSpace` as a global shortcut in `src/main/services/hotkey-service.ts:148-206`.
2. `register-handlers.ts` wires that shortcut to `scratchSpaceWindowService.show()` in `src/main/ipc/register-handlers.ts:182-188`.
3. `ScratchSpaceWindowService.show()` captures the previously frontmost app and shows the scratch window in `src/main/services/scratch-space-window-service.ts:53-67`.
4. On macOS, scratch space is shown with `win.showInactive()` in `src/main/services/scratch-space-window-service.ts:162-170`.
5. The renderer receives `scratch-space:open`, reloads state, and calls `focusTextarea()` in `src/renderer/scratch-space-app.tsx:84-98` and `src/renderer/scratch-space-app.tsx:129-145`.

### Mini-menu open

1. `HotkeyService` registers `pickTransformation` as a separate global shortcut in `src/main/services/hotkey-service.ts:154-161`.
2. The handler calls `ProfilePickerService.pickProfile()` through `register-handlers.ts` in `src/main/ipc/register-handlers.ts:182-189`.
3. `ProfilePickerService` captures the current frontmost app before opening in `src/main/services/profile-picker-service.ts:327-329`.
4. On macOS, the picker also opens with `showInactive()` in `src/main/services/profile-picker-service.ts:448-456`.
5. On close or selection, the picker restores the previously frontmost app in `src/main/services/profile-picker-service.ts:394-410`.

That flow is correct for a global pick-and-run popup. It is not correct for a menu that is expected to behave as a child of scratch space.

## Findings

### 1. P1: Scratch space tries to focus the textarea in the renderer, but the macOS window is explicitly opened without focus

Evidence:

- Scratch space is shown with `showInactive()` on macOS in `src/main/services/scratch-space-window-service.ts:162-165`.
- The renderer autofocus logic is only `textarea.focus()` plus selection-range placement in `src/renderer/scratch-space-app.tsx:37-46`.
- That autofocus is called immediately after bootstrap/open in `src/renderer/scratch-space-app.tsx:84-98` and `src/renderer/scratch-space-app.tsx:129-145`.
- There is no follow-up listener for native window activation, renderer `focus`, or visibility changes before retrying focus.

Why this is a bug:

- Electron documents `showInactive()` as showing the window without focusing it.
- The current implementation therefore asks the DOM to focus a control inside a native window that was intentionally not given focus.
- That explains the reported behavior: the scratch window appears, but the textarea is not ready for typing until the user clicks the window.

Why this matters:

- This is not a cosmetic miss. It breaks the primary “press shortcut, type immediately” workflow.
- It also reveals a product tension with the current spec: “non-activating utility panel” and “textarea ready for typing immediately” are not compatible with the present implementation approach.

### 2. P1: The mini menu is implemented as a global profile-picker popup, so opening it from scratch space restores the wrong app and behaves differently depending on whether scratch was clicked first

Evidence:

- Scratch space is designed to keep the previously frontmost app frontmost on macOS by using `showInactive()` in `src/main/services/scratch-space-window-service.ts:162-165`.
- The picker captures whatever app is currently frontmost before opening in `src/main/services/profile-picker-service.ts:327-329`.
- The picker always restores that captured app when it closes in `src/main/services/profile-picker-service.ts:394-410`.
- The picker is not scratch-local state. It is invoked through the global shortcut path in `src/main/services/hotkey-service.ts:226-240`.
- There is no mini-menu state or `Cmd+K` handling inside `src/renderer/scratch-space-app.tsx`.

Why this is a bug:

- If the user opens the mini menu while scratch space is visible but Dicta is still non-frontmost, the picker captures the external target app, not scratch space.
- When the picker closes, it restores that external app rather than returning control to scratch space.
- If the user clicks scratch space first, Dicta becomes frontmost, so the picker captures Dicta instead. That makes the flow feel “stable” only after a click, which matches the reported symptom.

Why this matters:

- The current picker implementation is correct for global “pick and run” behavior.
- It is the wrong ownership model for a nested scratch-space menu.
- This is an architectural bug, not just a shortcut registration issue.

### 3. P1: Escape ownership is incomplete, because scratch space has an unconditional renderer `Escape` handler that is unaware of nested popup state

Evidence:

- Scratch space registers a window-level `keydown` listener that always handles `Escape` by hiding the scratch window when not busy in `src/renderer/scratch-space-app.tsx:156-185`.
- The picker also claims `Escape`, but only through the main-process `TemporaryPopupShortcutManager` in `src/main/services/profile-picker-service.ts:370-388`.
- `TemporaryPopupShortcutManager` only coordinates temporary global shortcuts; it does not suppress renderer DOM handlers in whichever window currently has focus in `src/main/services/temporary-popup-shortcut-manager.ts:20-77`.
- The picker’s own inline HTML also handles `Escape` locally in `src/main/services/profile-picker-service.ts:247-267`, but that requires key events to reach the picker document.

Why this is a bug:

- When scratch space is the active window, pressing `Escape` can still hit the scratch renderer’s unconditional close path.
- The shortcut manager protects main-process popup ownership, but it does not create a single source of truth for nested `Escape` semantics across native-window and renderer-window handlers.
- The result is exactly the reported behavior: `Escape` closes the outer scratch popup instead of only closing the mini menu.

Why this matters:

- This breaks the expected modal stack contract.
- It also means future nested surfaces inside scratch space will keep reintroducing the same class of bug unless ownership is centralized.

### 4. P2: The mini menu has weak visual isolation from what is behind it, because it is a small frameless native window with no backdrop and only subtle surface separation

Evidence:

- The picker window is a small, separate always-on-top `BrowserWindow` in `src/main/services/profile-picker-service.ts:330-349`.
- It uses a frameless popup with `frame: false` and no overlay/backdrop concept in `src/main/services/profile-picker-service.ts:340-343`.
- The HTML only renders a padded shell and a card in `src/main/services/profile-picker-service.ts:118-133` and `src/main/services/profile-picker-service.ts:188-195`.
- The selected/hover state is only a mild accent fill in `src/main/services/profile-picker-service.ts:168-170`.

Why this is a bug:

- The picker does not visually suppress the content behind it.
- Bright controls in the underlying app remain fully visible around the popup window, and the internal contrast is intentionally subtle.
- Even if there is no literal alpha transparency bug, the current design produces the same usability failure the report describes: the surface does not isolate itself enough from what is behind it.

Why this matters:

- The menu is being used as a precision keyboard chooser.
- Poor visual separation increases misreads and makes the popup feel transient or unstable even when it is technically present.

## Additional gaps and inconsistencies

### Missing scratch-local command path

`src/renderer/scratch-space-app.tsx` contains no scratch-local command-menu state, no nested popup state, and no `Cmd+K` handler. The current codebase only has the global profile-picker popup. That is a strong signal that the reported “mini menu in scratch space” is currently borrowing infrastructure that was built for a different job.

### Spec tension

`specs/spec.md:242-245` requires scratch space to behave as a non-activating utility panel on macOS, while the user expectation here is “open and immediately type.” With the present approach, those goals are in tension. Any implementation change that makes the textarea truly ready for immediate typing may need a deliberate product decision and likely an ADR.

### Coverage gaps

There is no test that:

- asserts the textarea is focused after a real scratch-space open path
- covers opening the picker while scratch space is visible
- asserts that picker close returns focus to scratch rather than the original target app in that scenario
- asserts that `Escape` closes only the topmost popup when both scratch space and the picker are open
- checks legibility or visual isolation of the picker against bright underlying content

## Conclusion

The four reported issues reduce to one deeper mismatch: scratch space behaves like a local editing popup, but the mini menu still behaves like a global transformation picker.

That mismatch creates:

- broken textarea autofocus on non-activating open
- unstable `Cmd+K` behavior that depends on whether scratch was activated first
- incorrect `Escape` precedence between outer and inner popups
- weak visual separation for the mini menu

The current code does not just have isolated bugs. It is mixing two popup ownership models that want different focus, restore, and keyboard-routing rules.

## Sources

- Electron `BrowserWindow` API: https://www.electronjs.org/docs/latest/api/browser-window
- Electron `globalShortcut` API: https://www.electronjs.org/docs/latest/api/global-shortcut
