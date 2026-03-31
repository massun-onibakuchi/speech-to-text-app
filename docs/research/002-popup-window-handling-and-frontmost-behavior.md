---
title: Popup window handling and frontmost-app behavior
description: Map the popup-related files, runtime flows, and macOS frontmost-app mechanics for scratch space, the profile picker, and the settings surface.
date: 2026-03-31
status: concluded
tags:
  - research
  - windows
  - scratch-space
  - macos
  - electron
---

# Popup Window Handling and Frontmost-App Behavior

## Summary

This codebase has three native window paths relevant to "popup" behavior:

1. The main app window, which also hosts Settings.
2. The scratch-space utility window, which is a separate `BrowserWindow`.
3. The transformation profile picker window, which is another separate `BrowserWindow`.

The key distinction is:

- Settings is not its own popup window. It is a route/state inside the main app window.
- Scratch space is the small floating popup that must stay background-like.
- The profile picker is a separate floating popup that intentionally steals focus, then restores the previous app afterward.

The profile picker is also the popup used by the other shortcut flows the user called out:

- `pickTransformation`
- `changeTransformationDefault` when there are 3 or more presets

For the user-reported behavior, the scratch-space window is the critical path. On macOS, whether Dicta becomes the frontmost app is controlled primarily by how the window is shown:

- `win.show()` gives focus.
- `win.focus()` explicitly gives focus.
- `win.showInactive()` shows the window without focusing it.

Electron's official docs also matter here:

- `BrowserWindow.show()` shows and focuses the window.
- `BrowserWindow.showInactive()` shows the window without focusing it.
- macOS window `type: 'panel'` adds `NSWindowStyleMaskNonactivatingPanel`, making the window behave more like a utility panel and appear on all Spaces.

That combination explains the intended product split:

- Settings may legitimately bring Dicta frontmost.
- Small utility popups should not register Dicta as the frontmost app just by opening.

## Scope of Files Examined

### Main-process window ownership

- `src/main/core/window-manager.ts`
- `src/main/core/app-lifecycle.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/profile-picker-service.ts`
- `src/main/services/scratch-space-service.ts`
- `src/main/infrastructure/frontmost-app-focus-client.ts`

### Renderer and bridge files

- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/renderer/scratch-space-app.tsx`

### Tests and durable docs

- `src/main/core/window-manager.test.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/main/infrastructure/frontmost-app-focus-client.test.ts`
- `src/renderer/scratch-space-app.test.tsx`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/adr/0001-scratch-space-native-titlebar.md`

## Window Inventory

## 1. Main App Window

### File

- `src/main/core/window-manager.ts`

### What it is

This is the one persistent primary `BrowserWindow` for the app. It is created by `WindowManager.createMainWindow()`.

### Important behavior

- Created with `show: true`.
- On macOS it uses `titleBarStyle: 'hidden'`.
- On close, it hides instead of closing unless the app is quitting.
- It is restored by:
  - app activation
  - second-instance activation
  - tray menu `Settings...`

### Why it matters for frontmost-app behavior

This window is expected to become foreground when explicitly shown:

- `showMainWindow()` does `win.show()` then `win.focus()`.
- `openSettingsFromTray()` does `win.show()` then `win.focus()`, then sends `app:open-settings`.

That means Settings is intentionally foregrounded because Settings is not a separate popup. It is a mode/state inside the main app window.

### Important nuance

There is no dedicated native "settings window" service in this repo. "Open settings window" actually means:

1. show/focus the main window
2. send `IPC_CHANNELS.onOpenSettings`
3. let the renderer switch to the settings view

So the user requirement "When I open app setting window, app may switch to frontmost app" already matches the architecture.

## 2. Scratch-Space Popup

### File

- `src/main/services/scratch-space-window-service.ts`

### What it is

This is the dedicated small floating utility window opened by the `openScratchSpace` shortcut.

### Window configuration

The service creates a single reusable `BrowserWindow` with these notable options:

- fixed small dimensions
- `show: false`
- `alwaysOnTop: true`
- `resizable: false`
- `minimizable: false`
- `maximizable: false`
- `fullscreenable: false`
- `skipTaskbar: true`
- preload bridge enabled

Platform-specific window shape:

- macOS:
  - `type: 'panel'`
  - `backgroundColor: '#060709'`
- non-macOS:
  - hidden title bar overlay
  - same background color

### Renderer target

The scratch window loads the same renderer bundle as the main app, but with a query parameter:

- dev: `...?window=scratch-space`
- prod: `index.html?window=scratch-space`

The renderer-side scratch UI lives in:

- `src/renderer/scratch-space-app.tsx`

### Lifecycle behavior

- The window is created lazily on first use.
- It is reused across open/close cycles.
- Closing the window hides it instead of destroying it, unless the app is quitting.
- When shown, it sends `IPC_CHANNELS.onOpenScratchSpace` so the renderer refreshes state and focuses the textarea.

### Paste-target capture

This service also owns `targetBundleId`, which records the app that was frontmost before scratch space was opened.

Capture rule in `show()`:

- capture only if `captureTarget !== false`
- and either the window is not visible
- or there is no existing `targetBundleId`

This is important because it prevents the target app from drifting while the popup remains open.

## 3. Profile Picker Popup

### File

- `src/main/services/profile-picker-service.ts`

### What it is

This is a separate popup window used for profile-selection shortcut flows.

Specifically, it is used by:

- `pickTransformation`
- `changeTransformationDefault` when there are 3 or more presets

It is not used when `changeTransformationDefault` has exactly 2 presets, because that shortcut toggles directly without opening a popup.

### How it differs from scratch space

This window is intentionally focus-taking:

- it captures the previously frontmost app first
- it opens and focuses its own picker window
- after selection or cancel, it restores the previous app via AppleScript

The picker is therefore a "temporary focus steal with restore" design, not a "stay in the background" design.

That same behavior applies whether the picker was opened by:

- `pickTransformation`
- `changeTransformationDefault` in the 3+ preset branch

### Window configuration

The picker creates a small `BrowserWindow` with:

- `show: false`
- `alwaysOnTop: true`
- `frame: false`
- `autoHideMenuBar: true`
- `sandbox: true`

The content is not a React route. It is inline HTML loaded from a `data:` URL.

### Session behavior and lifetime rules

The picker service has several non-obvious lifecycle rules:

- if there are 0 presets:
  - `pickProfile()` resolves `null`
  - no popup is created
- if there is exactly 1 preset:
  - `pickProfile()` returns that preset id immediately
  - no popup is created
- if a picker session is already active:
  - the existing picker window is reused
  - the existing promise is returned
  - a second shortcut press does not create a second picker window
- the picker auto-closes after `PICKER_AUTO_CLOSE_TIMEOUT_MS` (60 seconds)

The service also keeps `activeSession` in memory so concurrent calls do not create stacked chooser windows.

### Why it matters

This file demonstrates the repo already supports two distinct popup models:

- scratch space: non-frontmost utility window
- profile picker: frontmost temporary chooser with focus restore

That split supports the user requirement without requiring one global rule for all popups.

## Shortcut-Specific Popup Ownership

The user clarification is correct: popup/frontmost behavior is not only about scratch space.

Shortcut-to-window mapping:

### `openScratchSpace`

- opens the dedicated scratch-space popup
- should stay background-like on open

### `pickTransformation`

- opens the dedicated profile-picker popup
- intentionally foregrounds the picker
- restores the previously frontmost app after selection or cancel
- guarded by `pickAndRunInFlight`, so repeated shortcut presses while one request is active do not stack concurrent picker/transform runs

### `changeTransformationDefault`

- 0 presets:
  - no popup
  - error result
- 1 preset:
  - no popup
  - effective no-op
- 2 presets:
  - no popup
  - toggles directly to the other preset
- 3 or more presets:
  - opens the same profile-picker popup used by `pickTransformation`

When it does open the picker, it does not use `lastPickedPresetId` for focus. It prefocuses the current default preset because the action is "change the default", not "repeat my last picked one-shot transform choice."

This means the repo has two shortcut-driven popup families:

- scratch-space popup family
- profile-picker popup family

## Window Wiring and Control Flow

## Hotkey to Scratch Space

Relevant files:

- `src/shared/domain.ts`
- `src/main/services/hotkey-service.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/scratch-space-window-service.ts`

Flow:

1. Settings stores `shortcuts.openScratchSpace`.
2. `HotkeyService` registers the global shortcut in the main process.
3. In `register-handlers.ts`, `openScratchSpace` is wired to `scratchSpaceWindowService.show()`.
4. `ScratchSpaceWindowService.show()` captures the previous frontmost bundle id if needed.
5. It shows the popup using the macOS/non-macOS-specific show path.
6. It sends `scratch-space:open` to the renderer.
7. `scratch-space-app.tsx` reloads settings and draft, resets the selected profile, and focuses the textarea.

## Hotkey to Pick-and-Run Transformation

Relevant files:

- `src/main/services/hotkey-service.ts`
- `src/main/services/profile-picker-service.ts`
- `src/main/ipc/register-handlers.ts`

Flow:

1. User presses the `pickTransformation` global shortcut.
2. `HotkeyService.runPickAndRunTransform()` loads settings and presets.
3. It resolves picker focus in this order:
   - `lastPickedPresetId`
   - `defaultPresetId`
   - first preset
4. It calls `pickProfileHandler(...)`.
5. In `register-handlers.ts`, that handler is wired to `profilePickerService.pickProfile(...)`.
6. The picker captures the currently frontmost app.
7. The picker opens with `show()` and `focus()`.
8. On successful selection:
   - `lastPickedPresetId` is persisted
   - the chosen preset runs for this request only
   - `defaultPresetId` is not changed
9. On selection or cancel, the picker restores the previously frontmost app.

This is an intentionally activating popup flow.

Implementation nuances:

- the picker UI is rendered from inline HTML, not the React renderer bundle
- selection is returned by navigating to a synthetic URL prefix: `picker://select/<id>`
- `webContents.on('will-navigate', ...)` intercepts that navigation and resolves the selection
- `Escape` closes the picker window
- Up/Down/Enter are handled entirely inside the inline HTML

## Hotkey to Change Default Transformation

Relevant files:

- `src/main/services/hotkey-service.ts`
- `src/main/services/profile-picker-service.ts`

Flow:

1. User presses the `changeTransformationDefault` global shortcut.
2. `HotkeyService.changeDefaultTransform()` loads the presets and current default.
3. It branches by preset count:
   - 0 presets: emits an error result
   - 1 preset: keeps the current default, no popup
   - 2 presets: toggles directly to the other preset, no popup
   - 3 or more presets: opens `ProfilePickerService`
4. In the 3+ preset case, the picker is focused on the current default preset.
5. If the chosen preset differs from the current default:
   - `defaultPresetId` is updated
   - settings are broadcast
   - the default-profile-changed sound plays
6. If the choice is canceled or unchanged, no durable settings change is applied.

So `changeTransformationDefault` only participates in popup/frontmost behavior in the 3+ preset branch.

## What Is Not a Native Popup Window

Not every "popup-looking" interaction in the app creates a native `BrowserWindow`.

Examples of non-native popups:

- confirm dialogs implemented in renderer React
- settings panels/tabs inside the main app shell
- any Radix dialog/modal rendered inside the existing window tree

These renderer-local surfaces may look like popups to the user, but they do not affect macOS frontmost-app registration the same way native `BrowserWindow` instances do. For the frontmost-app problem, the meaningful boundary is:

- native Electron window
- versus renderer-only modal inside an already-open window

## Tray to Settings

Relevant files:

- `src/main/core/window-manager.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`

Flow:

1. User chooses `Settings...` from the tray menu.
2. `WindowManager.openSettingsFromTray()` calls `win.show()` and `win.focus()`.
3. It sends `IPC_CHANNELS.onOpenSettings`.
4. The renderer reacts by opening the settings view inside the main window.

This is not a popup architecture. It is the main window being foregrounded and retargeted.

## Scratch-Space Execute and Paste

Relevant files:

- `src/renderer/scratch-space-app.tsx`
- `src/main/services/scratch-space-service.ts`
- `src/main/infrastructure/frontmost-app-focus-client.ts`

Flow:

1. User presses `Cmd+Enter` in scratch space.
2. Renderer persists the draft.
3. Renderer calls `runScratchSpaceTransformation`.
4. Main process resolves the transformation preset and validates the target app exists.
5. Main process transforms the text.
6. Main process hides the scratch window.
7. Main process calls `activateBundleId(targetBundleId)`.
8. Main process waits `TARGET_APP_FOCUS_DELAY_MS` (120ms).
9. Main process forces output with:
   - `copyToClipboard: true`
   - `pasteAtCursor: true`
10. On success:
   - clear draft
   - clear `targetBundleId`
11. On failure:
   - reopen scratch space without recapturing target

This is the reason frontmost-app capture is part of the popup service rather than the renderer.

## Frontmost-App Mechanics

## Current helper

### File

- `src/main/infrastructure/frontmost-app-focus-client.ts`

### What it does

It wraps two AppleScript calls:

- capture:
  - `tell application "System Events" to get bundle identifier of first application process whose frontmost is true`
- restore:
  - `tell application id "<bundleId>" to activate`

### Why this exists

Electron itself does not expose a high-level "give focus back to whichever macOS app was frontmost before my popup opened" primitive. The repo therefore uses AppleScript as the OS bridge.

### Limitations

- macOS only
- depends on `osascript`
- best-effort behavior
- focus restoration is not transactional
- if the target app quits while the popup is open, restore fails

## What actually controls whether Dicta becomes frontmost

For this repo, the decisive factor is not only "is this a popup window?" It is the combination of:

- window type
- show method
- explicit focus calls

### Relevant Electron behavior from official docs

From Electron's official documentation:

- `BrowserWindow.show()` "Shows and gives focus to the window."
- `BrowserWindow.showInactive()` "Shows the window but doesn't focus on it."
- macOS `type: 'panel'` adds `NSWindowStyleMaskNonactivatingPanel` and makes the window float on top of full-screen apps and appear on all Spaces.

Implication:

- `show()` and `focus()` are activation paths.
- `showInactive()` is the non-activation path.
- `type: 'panel'` supports the utility-panel presentation, but it does not replace the need to choose the correct show method.

## Why scratch space and settings should behave differently

The codebase and spec already imply two product classes:

### Settings/main window

- user is intentionally opening the app shell
- foregrounding is acceptable
- current code uses `show()` + `focus()`

### Small popup utility window

- user wants a transient drafting surface over another app
- the original app remains the real work context
- the popup should not become "the app the OS thinks is frontmost" merely by appearing

That is why the current scratch-space service uses:

- macOS `type: 'panel'`
- `showInactive()`

while `WindowManager` still uses:

- `show()`
- `focus()`

## File-by-File Ownership Map

## Native popup creation

- `src/main/services/scratch-space-window-service.ts`
  - creates and manages the scratch-space `BrowserWindow`
  - owns target-app capture state
- `src/main/services/profile-picker-service.ts`
  - creates and manages the picker `BrowserWindow`
  - owns temporary focus capture/restore around the picker
- `src/main/core/window-manager.ts`
  - creates the main app window
  - does not create a separate settings popup

## Popup-trigger wiring

- `src/main/ipc/register-handlers.ts`
  - composes services
  - wires the hotkey handler to `scratchSpaceWindowService.show()`
  - wires the picker service into transform flows

## OS frontmost-app bridge

- `src/main/infrastructure/frontmost-app-focus-client.ts`
  - captures frontmost bundle id
  - restores bundle id on demand

## Renderer popup behavior

- `src/renderer/scratch-space-app.tsx`
  - draft UI
  - profile selection
  - close on `Escape`
  - transform on `Cmd+Enter`
  - textarea focus on open

## Preload and IPC contracts

- `src/preload/index.ts`
  - exposes scratch-space APIs to the renderer
- `src/shared/ipc.ts`
  - names all IPC channels for popup open/hide/execute behavior

## Tests that define expected behavior

- `src/main/services/scratch-space-window-service.test.ts`
  - macOS panel config
  - `showInactive()` path on macOS
  - reopening while visible does not switch back to `show()`
- `src/main/infrastructure/frontmost-app-focus-client.test.ts`
  - AppleScript capture/restore contract
- `src/main/core/window-manager.test.ts`
  - settings flow still foregrounds the main window
- `src/renderer/scratch-space-app.test.tsx`
  - draft restore
  - `Escape` hides
  - `Cmd+Enter` execution
  - reopen resets default profile

## How the Current Design Handles the User Requirement

User requirement, restated:

- scratch-space shortcut should not make Dicta become the frontmost app
- settings may become frontmost
- small popup windows should stay background-like, similar to Raycast

Current architectural answer:

- scratch space is a dedicated utility window with macOS non-activating show behavior
- settings is not a popup, so it can still foreground the main app window
- the picker is a separate exception that intentionally steals focus, then restores it

This split is coherent with both the code and the spec.

## Risks and Edge Cases

## 1. Renderer focus vs app activation are different concerns

Even when the window itself is shown without app activation, the renderer still wants local text-entry focus. The code handles this by:

- showing the window non-activating
- sending `scratch-space:open`
- focusing the textarea in the renderer on the next animation frame

This is subtle because "focused input in the popup" and "Dicta is the system frontmost app" are not the same question.

## 2. Reopen behavior must not recapture the target app

If scratch space is already visible and is shown again, recapturing the target app at that moment would be wrong because Dicta or the popup itself could be the currently active context. The service avoids this by preserving `targetBundleId` while the popup session stays alive.

## 3. Paste-time restore is still an activation

Scratch space is non-activating on open, but the final paste flow deliberately activates the original target app before sending paste output. That is correct and expected. "Do not become frontmost on open" does not mean "never activate any app later."

## 4. The picker is intentionally different

If someone generalizes "all popups should use `showInactive()`," that would likely break the picker UX because the picker depends on actively taking focus for keyboard selection. The codebase should keep these two popup classes distinct.

## 5. Settings is not a native popup

If future work introduces a real separate settings `BrowserWindow`, that would change this analysis. Today, Settings is still the main shell window.

## Durable Spec Alignment

The current durable spec already encodes the intended distinction:

- `specs/spec.md`
  - scratch space must open above the current app
  - on macOS it must not make Dicta become the system frontmost app merely by opening
  - scratch-space execution must restore focus to the original target app before paste
- `specs/user-flow.md`
  - opening scratch space does not register Dicta as frontmost by itself
  - before paste, the original app is activated

This means the product expectation is now explicit, not just inferred from implementation.

## Conclusions

## What the popup files are

If the question is "which files own popup windows and where are they handled?", the core answer is:

- `src/main/services/scratch-space-window-service.ts`
  - small scratch-space popup
- `src/main/services/profile-picker-service.ts`
  - transform-profile picker popup
  - used by `pickTransformation`
  - also used by `changeTransformationDefault` when there are 3+ presets
- `src/main/core/window-manager.ts`
  - main app window, including settings

## What governs the reported behavior

If the question is "why does a popup sometimes make Dicta the frontmost app?", the answer is:

- any path using `show()` or `focus()` foregrounds the app/window
- the scratch popup must use the non-activating path on macOS
- settings is allowed to foreground because it is the main app window

## Most important architectural distinction

The repo should be understood as having two popup categories, not one:

- non-activating utility popups:
  - scratch space
- activating transactional popups:
  - profile picker for `pickTransformation`
  - profile picker for `changeTransformationDefault` when there are 3+ presets

That distinction is the core intricacy behind the user's requested behavior.

## Sources

- Electron BrowserWindow docs: https://www.electronjs.org/docs/api/browser-window
- Electron BaseWindow docs: https://www.electronjs.org/docs/latest/api/base-window
- Electron app docs: https://www.electronjs.org/docs/latest/api/app/
