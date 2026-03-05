<!--
Where: docs/research/issues-363-364-macos-menu-bar-research.md
What: Deep research dossier for issues #363 and #364 with detailed analysis of current macOS menu bar / tray behavior.
Why: Provide an implementation-ready understanding of current architecture, gaps, and risks before any code changes.
-->

# Research: Issues #363-#364 and Current macOS Menu Bar Behavior

Date: March 5, 2026

## 1. Scope and issue snapshot

This document analyzes:

1. Issue #363: Customize macOS menu bar
2. Issue #364: Default profile indicator stale after shortcut-based default change
3. Current implementation details of macOS tray/menu behavior in this app

Issue status (checked on March 5, 2026):

- #363 OPEN: https://github.com/massun-onibakuchi/speech-to-text-app/issues/363
- #364 OPEN: https://github.com/massun-onibakuchi/speech-to-text-app/issues/364

Important framing:
- #363 is a macOS tray/menu UX issue.
- #364 is a renderer state synchronization issue.
- They are both main+renderer integration topics, but #364 is not directly a menu bar/tray bug.

## 2. Terminology (to avoid mixing macOS menu concepts)

Electron on macOS has multiple menu surfaces:

1. Application menu (top macOS menu bar)
- Controlled via `Menu.setApplicationMenu(...)`.
- If not set, Electron provides a default app menu.

2. Tray menu (menu bar extras icon context menu)
- Controlled by `new Tray(image)` + `tray.setContextMenu(...)`.
- This is the top-right menu bar extras area on macOS.

3. Dock menu
- Controlled via `app.dock.setMenu(...)`.
- Appears on right-click/Control-click on dock icon.

Issue #363 language and screenshot align with the **Tray menu** path implemented in `WindowManager.ensureTray()`.

## 3. Current architecture: how macOS tray/menu is wired

## 3.1 Startup and lifecycle

Main lifecycle is in `src/main/core/app-lifecycle.ts`:

- `app.requestSingleInstanceLock()` is enforced.
- On `whenReady`:
  - `app.setLoginItemSettings({ openAtLogin: true })`
  - IPC handlers are registered.
  - Main window is created.
  - Tray is ensured (`windowManager.ensureTray()`).
- On `activate` (macOS app activation), `showMainWindow()` is called.
- On `window-all-closed`, app quits only on non-darwin.
- `before-quit` sets `isQuitting` marker.

## 3.2 Window close behavior (background mode)

In `src/main/core/window-manager.ts`:

- Main window `close` event is intercepted.
- Unless quitting explicitly, close is prevented and window is hidden.
- This preserves a live renderer and active shortcut behavior in background mode.

This behavior matches spec/user-flow requirements for hide-to-background lifecycle.

## 3.3 Tray creation behavior

`ensureTray()` currently does:

- `const icon = nativeImage.createEmpty()`
- `this.tray = new Tray(icon)`
- `this.tray.setToolTip('Speech-to-Text v1')`
- Context menu template:
  - `Show Window` -> `showMainWindow()`
  - `Hide Window` -> `mainWindow?.hide()`
  - separator
  - `Quit` role
- Left click on tray icon always calls `showMainWindow()`.

## 4. Why issue #363 happens in current code

Issue #363 reports:
- no icon
- unwanted menu items (`Show Window`, `Hide Window`)
- wants `Settings`

Direct root causes in current implementation:

1. No icon
- Tray icon uses `nativeImage.createEmpty()`.
- This creates a transparent empty image by design.
- Result: effectively no visible tray icon.

2. Useless menu items
- Context menu is hardcoded with both `Show Window` and `Hide Window`.
- There is no conditional enable/disable or context-aware replacement.

3. No Settings entry
- Tray context template contains no `Settings` item.
- No tray callback exists to navigate renderer to settings tab.

## 5. Official Electron behavior relevant to #363 (primary sources)

Official docs confirm:

1. Tray icon must be provided explicitly
- `Tray` requires a `NativeImage` or icon path.
- macOS tray icon appears in menu bar extras area.
- Source: Tray Menu tutorial (Electron)
  - https://www.electronjs.org/docs/latest/tutorial/tray

2. `nativeImage.createEmpty()` is empty
- `createEmpty()` returns an empty `NativeImage`.
- Source: nativeImage API
  - https://www.electronjs.org/docs/latest/api/native-image

3. macOS tray icon best practice
- Tray icons on macOS should be template images (filename suffix `Template`, `@2x` pair for retina).
- Source: Tray API platform considerations
  - https://www.electronjs.org/docs/latest/api/tray/

4. Application menu defaults
- If `Menu.setApplicationMenu(...)` is never called, Electron sets a default application menu.
- Source: Application Menu tutorial
  - https://www.electronjs.org/docs/latest/tutorial/application-menu

5. Dock behavior is separate
- Dock-specific controls are via `app.dock` (`hide`, `show`, `setMenu`, etc.) and are not currently used.
- Source: Dock docs/tutorial
  - https://www.electronjs.org/docs/latest/tutorial/macos-dock

Inference from these sources + code:
- The app currently customizes **tray menu** only.
- It does not customize **application menu** or **dock menu**.

## 6. Asset/build constraints affecting tray icon work

Current repository state:

- `resources/` contains sounds and sample artifact zip.
- No tray icon assets (`.png/.icns/.ico`) are present.
- `package.json` build config includes `resources/**`, but no icon-specific tray asset is currently defined/used.

Consequence:
- Implementing proper tray icon behavior requires adding explicit icon assets and referencing them from `WindowManager`.

## 7. Test coverage status for menu bar/tray behavior

Current tests (`window-manager.test.ts`, `app-lifecycle.test.ts`) validate:

- macOS titlebar options
- hide-on-close behavior
- explicit quit behavior
- lifecycle wiring (create window, ensure tray, activate)

Current test gaps for #363:

- No assertion that tray icon is non-empty/path-backed.
- No assertion of tray context menu labels/actions.
- No assertion for a Settings tray action.
- No assertion for show/hide item policy.

## 8. Issue #364 deep-link: why it appears and relation to menu bar

Issue #364 summary:
- After changing default profile via shortcut flow, Profile tab `(default)` badge does not refresh immediately.

Current shortcut change-default flow (`hotkey-service.ts`):

1. Shortcut triggers `changeDefaultTransform()` in main process.
2. Main reads current settings and chooses next default profile.
3. Main persists updated settings via `settingsService.setSettings(nextSettings)`.
4. Main emits a generic composite result message (`onCompositeResult`) for renderer feedback.

Renderer side (`renderer-app.tsx`):

- Renderer does not subscribe to a dedicated "settings changed externally" event.
- It loads settings once at boot (`getSettings`) and then mutates local settings via renderer-initiated actions.
- Hotkey result channel updates toast/activity but does not pull fresh settings.

Likely root cause for #364 (strong inference from code):
- Default profile is persisted correctly in main, but renderer in-memory `state.settings` is stale until another explicit settings refresh path occurs.

Relation to #363:
- Not direct menu bar behavior.
- Shared architectural theme: main-process actions can mutate state without renderer synchronization event.

## 9. Behavioral matrix (current vs issue intent)

### 9.1 Issue #363

- Tray icon visible
  - Current: No (empty image)
  - Expected: Yes
- Tray context menu includes Show/Hide
  - Current: Yes (always)
  - Expected: Remove these items
- Tray context menu includes Settings
  - Current: No
  - Expected: Yes

### 9.2 Issue #364

- Shortcut changes default preset in persisted settings
  - Current: Yes (main path writes settings)
- Profile tab badge updates immediately
  - Current: No (likely stale renderer state)

## 10. Implementation option space (research only; no code changes yet)

## 10.1 For #363 (tray/menu UX)

Option A: Minimal tray fix
- Replace empty tray icon with proper template icon asset.
- Adjust context menu template to remove Show/Hide and add Settings.

Option B: Context-aware tray menu
- Keep show/hide semantics but make labels dynamic (`Show` only when hidden, etc.).
- Add Settings and retain Quit.

Option C: Broader macOS polish
- Option A/B plus application menu customization (`Menu.setApplicationMenu`) and/or dock menu policy.

## 10.2 For #364 (state sync)

Option A: Emit settings-updated event from main
- Broadcast event after settings mutations triggered outside renderer.
- Renderer listens and refreshes `getSettings`.

Option B: Pull-on-shortcut-result fallback
- On specific hotkey success message, renderer refetches settings.
- Lower surface change, less general.

Option C: Unified settings write-through bus
- Consolidate all settings mutations under a synchronized event model.
- Highest consistency, larger refactor.

## 11. Risks and edge cases to account for

For #363:
- macOS template icon requirements (`Template` naming and `@2x`) for light/dark adaptability.
- tray click behavior should not unexpectedly steal focus when user expects passive action.
- Settings action needs a deterministic route-open contract (show window + select settings tab).

For #364:
- avoid overwriting in-progress renderer draft state when syncing settings from main.
- avoid race between renderer autosave timer and externally persisted settings.
- ensure profile badge update does not require manual tab switch.

## 12. Recommended verification checklist (pre-implementation)

For #363:
1. Confirm tray icon appears in macOS menu bar extras.
2. Confirm context menu no longer shows deprecated entries (if removed by design).
3. Confirm `Settings` action opens main window and navigates to settings tab.
4. Confirm `Quit` still triggers explicit close path.

For #364:
1. Trigger `change default` shortcut.
2. Verify persisted `defaultPresetId` changes in main settings store.
3. Verify Profiles tab badge updates immediately without manual refresh.
4. Verify no regression in autosave/profile draft guard flows.

## 13. Source index

Repository sources:

- `src/main/core/window-manager.ts`
- `src/main/core/app-lifecycle.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/hotkey-service.ts`
- `src/renderer/renderer-app.tsx`
- `src/main/core/window-manager.test.ts`
- `src/main/core/app-lifecycle.test.ts`
- `specs/spec.md` (window close/background requirements)
- `specs/user-flow.md` (flow 6 open-at-login + background shortcuts)

External primary docs:

- Electron Tray Menu tutorial:
  - https://www.electronjs.org/docs/latest/tutorial/tray
- Electron Tray API:
  - https://www.electronjs.org/docs/latest/api/tray/
- Electron nativeImage API:
  - https://www.electronjs.org/docs/latest/api/native-image
- Electron Application Menu tutorial:
  - https://www.electronjs.org/docs/latest/tutorial/application-menu
- Electron macOS Dock tutorial:
  - https://www.electronjs.org/docs/latest/tutorial/macos-dock
- Electron app API (activation policy / macOS app behavior):
  - https://www.electronjs.org/docs/latest/api/app
