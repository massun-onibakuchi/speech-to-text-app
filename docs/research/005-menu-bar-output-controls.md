---
title: Menu bar output controls on macOS
description: Map Dicta's current tray architecture, output-state model, and macOS/Electron menu constraints for adding output-mode toggles and multi-select output destinations in the menu bar.
date: 2026-04-01
status: concluded
review_by: 2026-04-08
tags:
  - research
  - macos
  - menu-bar
  - electron
  - output
---

# Menu bar output controls on macOS

## Goal

Study how Dicta's existing macOS menu bar integration works today, what product and architecture constraints already exist, and what must change to support this feature:

- toggle output mode from the macOS menu bar
- multi-select output destinations from the macOS menu bar
- keep the existing Settings window as the durable full-control surface
- avoid implementation work until the seams, risks, and rollout shape are clear

This report focuses on the current codebase plus official Electron platform behavior. The repo instruction mentions Context7 for current docs, but that tool is not available in this environment, so this research uses official Electron documentation directly and grounds every app-specific claim in the local code.

## Executive summary

Dicta already runs as a tray-backed macOS background utility, but the current tray menu is intentionally static and minimal:

- `Settings...`
- separator
- `Quit`

The important architectural fact is that tray menu state lives entirely in the main process, while the output controls that users can edit today live in the shared settings schema and are mutated through the renderer's `setSettings` flow.

That means the new feature is not "just a menu template change." It requires a first-class main-process settings mutation path that can:

1. read persisted output settings
2. update only the relevant output fields
3. re-render the tray menu from current settings
4. keep renderer state in sync via the existing `onSettingsUpdated` broadcast

The current settings model is already close to what the feature needs:

- output mode is `settings.output.selectedTextSource`
- output destinations are represented as `copyToClipboard` and `pasteAtCursor`
- the shared helper `buildOutputSettingsFromSelection()` already enforces the current product rule that transcript and transformed destination rules stay synchronized

The main design choice is therefore not the data model. It is the ownership model:

- tray mutations should happen in main process
- the renderer should observe and refresh from persisted settings
- the tray menu should be rebuilt from persisted state after every relevant settings change, not just tray-side changes

## Current product baseline

### What the menu bar does today

The app starts a tray icon during app lifecycle initialization:

- [src/main/core/app-lifecycle.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/app-lifecycle.ts)

`AppLifecycle.initialize()` does the following after `app.whenReady()`:

1. enables launch at login
2. registers IPC handlers
3. creates the main window
4. calls `windowManager.ensureTray()`

The tray is managed here:

- [src/main/core/window-manager.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.ts)

Today `WindowManager.ensureTray()`:

- creates a tray icon from `resources/tray/speech_to_text@2x.png`
- marks the icon as a template image for macOS menu bar rendering
- sets tooltip text to `Dicta`
- builds a context menu with:
  - `Settings...`
  - separator
  - `Quit`

The tests make that contract explicit:

- [src/main/core/window-manager.test.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.test.ts)

Important current behavior:

- there is no tray click handler that reopens the window
- choosing `Settings...` intentionally shows and focuses the main window
- closing the main window hides it instead of quitting, so global shortcuts stay alive

This matches the current user-flow and spec docs:

- [specs/user-flow.md](/workspace/.worktrees/feat/output-mode-menu/specs/user-flow.md)
- [specs/spec.md](/workspace/.worktrees/feat/output-mode-menu/specs/spec.md)

### What "output mode" means today

The current output state is defined in:

- [src/shared/domain.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/domain.ts)

Relevant shape:

```ts
output: {
  selectedTextSource: 'transcript' | 'transformed',
  transcript: {
    copyToClipboard: boolean,
    pasteAtCursor: boolean
  },
  transformed: {
    copyToClipboard: boolean,
    pasteAtCursor: boolean
  }
}
```

Current defaults:

- `selectedTextSource: 'transformed'`
- transcript destinations: copy on, paste off
- transformed destinations: copy on, paste off

The capture pipeline already treats output mode as a single selected source:

- [src/main/core/command-router.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/command-router.ts)
- [src/main/orchestrators/capture-pipeline.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/orchestrators/capture-pipeline.ts)

Behavior today:

1. capture snapshot binds current settings at enqueue time
2. if `selectedTextSource === 'transformed'`, the default transformation profile is attached
3. output commit chooses one text source only
4. `getSelectedOutputDestinations(snapshot.output)` picks the destination rule for the selected source
5. if transformed output is unavailable, capture falls back to transcript while preserving the selected destinations

That means tray-side output-mode changes only affect future jobs. They must not alter already-enqueued snapshots.

### What "multi-select destinations" means today

The settings UI already models destination selection as two independent booleans:

- copy to clipboard
- paste at cursor

The renderer surface is here:

- [src/renderer/settings-output-react.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/settings-output-react.tsx)

The shared synchronization helper is here:

- [src/shared/output-selection.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/output-selection.ts)

That helper is important:

```ts
export const buildOutputSettingsFromSelection = (
  output,
  selection,
  destinations
) => ({
  ...output,
  selectedTextSource: selection,
  transcript: { ...destinations },
  transformed: { ...destinations }
})
```

This means the current shipped product intentionally uses one shared destination matrix for whichever source is selected, while keeping legacy-compatible `transcript` and `transformed` fields synchronized in persisted settings.

So the menu-bar feature does not need a new destination model. It needs a new control surface for the existing one.

## Current ownership and data flow

### Settings ownership

Persisted settings are owned by the main process:

- [src/main/services/settings-service.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/services/settings-service.ts)

Renderer edits call:

- `window.speechToTextApi.setSettings(...)`

Bridge:

- [src/preload/index.ts](/workspace/.worktrees/feat/output-mode-menu/src/preload/index.ts)

IPC registration:

- [src/main/ipc/register-handlers.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/ipc/register-handlers.ts)

Current update cycle:

1. renderer sends a full `Settings` payload through IPC
2. main process validates and persists it
3. main process re-registers hotkeys
4. on external mutations, main process can broadcast `settings:on-updated`
5. renderer refreshes settings from main when it receives that event

The tray currently does not participate in this flow at all.

### Why tray-side mutation needs a dedicated seam

The current tray owner, `WindowManager`, has no access to:

- `SettingsService`
- output-selection helpers
- `broadcastSettingsUpdated()`

At the same time, `register-handlers.ts` has access to settings services but does not own the tray menu.

So adding output controls directly inside `WindowManager` without changing ownership would either:

- duplicate settings persistence logic in the window layer, or
- force `WindowManager` to reach sideways into main-process service composition

Both would be poor fits.

The cleanest future implementation seam is:

1. keep tray-window mechanics in `WindowManager`
2. introduce a small tray-menu controller or builder owned by the main-process composition root
3. let that controller read and mutate settings through `SettingsService`
4. rebuild the tray menu whenever relevant settings change

## Existing spec constraints that matter

The durable docs already impose several requirements on this feature even before any new spec work is written.

### Tray behavior constraints

From current docs:

- closing the main window hides to background instead of quitting
- clicking the menu bar icon must not reopen the main window by itself
- the main window opens from the menu bar only when the user chooses `Settings...`

Implication:

- output controls must be added inside the tray context menu, not by adding a click handler that opens UI

### Output behavior constraints

From the spec:

- capture output selects exactly one source via `output.selectedTextSource`
- capture must not emit both transcript and transformed text in the same successful capture run
- when transformed output is unavailable, output falls back to transcript while keeping the configured destinations
- settings UI should preserve synchronized destination controls across transcript/transformed rules

Implication:

- tray output mode should be represented as a mutually exclusive choice
- tray destinations should be represented as independent toggles
- tray destination toggles should keep transcript/transformed destination rules synchronized, just like Settings does today

### Background utility constraints

The settings schema already contains:

```ts
interfaceMode: {
  value: 'standard_app' | 'menu_bar_utility'
}
```

This exists in [src/shared/domain.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/domain.ts), but current code reads almost nothing from it. In practice the app already behaves like a menu-bar utility with a hide-to-tray main window, regardless of this field.

Implication:

- the new feature should not assume that `interfaceMode.value` is a complete existing runtime switch
- this field is a likely place to anchor future "menu bar mode" product behavior, but it is not yet an implemented tray-behavior controller

## Official Electron and macOS facts relevant to this feature

### Tray menus are native menus

Electron's `Tray` exposes a native system tray or status bar item and uses a `Menu` for its context menu.

Relevant docs:

- Electron Tray API: https://www.electronjs.org/docs/latest/api/tray
- Electron Menu API: https://www.electronjs.org/docs/latest/api/menu
- Electron MenuItem API: https://www.electronjs.org/docs/latest/api/menu-item

Important implications for Dicta:

- tray menus are built from a template, not from renderer JSX
- menu state is represented by native menu item properties such as `type`, `checked`, `enabled`, and `submenu`
- `checkbox` items are the correct fit for multi-select destinations
- `radio` items are the correct fit for mutually exclusive output mode

### `MenuItem` types already match the feature directly

Electron `MenuItem` supports:

- `checkbox`
- `radio`
- `submenu`
- `separator`

That maps cleanly to this feature:

- `Output Mode`
  - `Raw dictation`
  - `Transformed text`
- `Output Destinations`
  - `Copy to clipboard`
  - `Paste at cursor`

No custom native UI is needed for this first version.

### Focus behavior matters

Electron documents:

- `BrowserWindow.show()` shows and focuses the window
- `BrowserWindow.showInactive()` shows without focusing

Relevant doc:

- Electron BrowserWindow API: https://www.electronjs.org/docs/latest/api/browser-window

This matters because tray-based output controls should not open the main window at all for the normal toggle path. The only tray action that should focus the main window remains `Settings...`.

### Template tray icon behavior already matches macOS expectations

Dicta already calls `icon.setTemplateImage(true)` in `WindowManager.ensureTray()`.

That is the correct macOS-friendly tray icon path for monochrome menu bar rendering and should remain unchanged.

## Local code paths that will matter later

### Main-process files most likely in scope

- [src/main/core/window-manager.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.ts)
- [src/main/core/window-manager.test.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.test.ts)
- [src/main/ipc/register-handlers.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/ipc/register-handlers.ts)
- [src/main/services/settings-service.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/services/settings-service.ts)

Likely new module candidates:

- `src/main/menu-bar/` or `src/main/tray/` for menu template building and settings mutations

### Shared files most likely in scope

- [src/shared/domain.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/domain.ts)
- [src/shared/output-selection.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/output-selection.ts)
- [src/shared/ipc.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/ipc.ts)

### Renderer files that may need alignment

- [src/renderer/settings-output-react.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/settings-output-react.tsx)
- [src/renderer/renderer-app.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/renderer-app.tsx)

The renderer does not need to own tray interactions, but it does need to reflect tray-side settings changes through existing refresh behavior.

## Implementation-shaping observations

### 1. The simplest safe menu structure is a submenu structure

Recommended menu shape:

```text
Settings...
Output Mode
  Raw dictation
  Transformed text
Output Destinations
  Copy to clipboard
  Paste at cursor
Quit
```

Why this is cleaner than flat items:

- groups related controls
- avoids overloading the top-level tray menu
- uses the native semantics Electron already provides
- scales if more menu-bar settings appear later

### 2. The tray should mutate the same persisted settings as the Settings window

Tray changes should not introduce a parallel ephemeral store.

Why:

- output routing reads from persisted settings snapshots
- renderer already understands settings refresh from main
- hot future additions should not need reconciliation between tray state and settings state

### 3. The menu should be rebuilt from persisted settings after every mutation

The current tray menu is set once in `ensureTray()`.

For this feature, a safe deterministic rule is:

1. read latest settings
2. build menu template from settings
3. set tray context menu

Rebuilding after every tray-side change keeps `checked` states honest and avoids hidden reliance on mutable menu item instances.

### 4. In-flight jobs must remain snapshot-based

Because capture requests snapshot settings at enqueue time, tray changes must only affect future jobs.

This is correct and should remain unchanged.

It avoids race conditions like:

- user stops recording
- job enqueues with `transformed`
- user flips tray mode to `transcript`
- already-enqueued job unexpectedly changes behavior

### 5. Renderer and tray must converge through one source of truth

Expected synchronization rule:

- tray change persists settings in main
- renderer save persists settings in main
- main rebuilds tray menu from persisted output state after either path
- main broadcasts `onSettingsUpdated`
- renderer reloads current settings and redraws

This keeps the Settings window accurate if it is already open while the tray is being used.

There is one important complication in the current renderer implementation: external settings refresh replaces in-memory settings and invalidates pending autosave work. Without an explicit conflict policy, a tray-originated output change can discard unsaved Settings edits.

## Risks and trade-offs

### Risk: overloading `WindowManager`

If tray menu building, state reading, and state mutation are all added to `WindowManager`, that class will mix:

- window lifecycle
- tray icon management
- settings persistence
- business rules for output selection

That would make tests broader and harder to reason about.

Preferred direction:

- keep `WindowManager` responsible for window mechanics
- move tray menu state into a dedicated collaborator

### Risk: diverging destination semantics between tray and Settings

If tray toggles only mutate `output.selectedTextSource` and the currently selected source's rule, while the Settings window still synchronizes both transcript and transformed rules, the app will gain two incompatible edit paths for one concept.

Preferred direction:

- tray toggles should reuse the same shared synchronization rule as renderer Settings

### Risk: tray updates can discard unsaved Settings edits

Current confidence: 72

Reason:

- the renderer already refreshes from persisted settings on `onSettingsUpdated`
- that refresh path replaces local state rather than merging only output fields
- tray-driven changes can therefore clobber dirty Settings form state unless the implementation defines a conflict policy

This is a real product and engineering decision, not just a testing concern.

### Risk: changing `interfaceMode` without defining runtime behavior

There is already an `interfaceMode.value` setting, but it is not yet the durable runtime source of tray behavior.

Confidence is below 80 on folding this feature into `interfaceMode` in the first PR, because that would mix:

- tray output controls
- broader app shell behavior
- potentially window-open and launch behavior

Safer first move:

- implement tray output controls independently
- decide later whether `interfaceMode` should become the durable product switch for a deeper menu-bar-only mode

### Risk: no renderer-open fallback for advanced options

The tray menu is a fast-control surface, not a full configuration surface. It is appropriate for:

- mode selection
- destination toggles

It is not appropriate for:

- transformation preset editing
- diagnostics
- output-warning education

So `Settings...` should remain available and unchanged.

## Testing implications

The existing test suite already covers the current tray shape and output behavior. The future feature should extend that rather than create ad hoc coverage.

Likely test additions:

- `WindowManager` or new tray-controller tests for submenu structure and checked state
- tray mutation tests that verify persisted settings change correctly
- renderer refresh tests to confirm tray-side external mutations are reflected in Settings
- output-selection helper tests if tray-specific mutation helpers are introduced

Most important behavioral assertions:

1. `Raw dictation` and `Transformed text` are mutually exclusive.
2. `Copy to clipboard` and `Paste at cursor` are independently selectable.
3. tray mutation updates persisted settings, not an in-memory shadow copy.
4. menu checkmarks reflect persisted settings after each mutation.
5. choosing `Settings...` still opens and focuses the main window.
6. clicking the tray icon still does not reopen the window.

## Recommended rollout direction

This is the cleanest shape for implementation later:

1. extract tray menu construction into a dedicated main-process module
2. add a small main-process output-settings mutation helper that reuses shared output-selection semantics
3. wire tray menu rebuilds off persisted settings reads
4. broadcast settings updates after tray-side mutations
5. extend tests around tray menu structure, mutation behavior, and renderer refresh
6. update durable specs once the implementation behavior is finalized

## Open questions

### 1. Should tray controls also expose `interfaceMode`?

Current confidence: 58

Reason:

- schema support exists
- runtime behavior does not
- mixing app-shell mode switching into the same PR would likely make the diff too large

### 2. Should tray labels say `Output Mode` or `Text Output`?

Current confidence: 74

`Output Mode` matches the existing Settings surface today, but `Text Output` may be more user-obvious in a small menu.

### 3. Should the menu allow both destinations off?

Current confidence: 91

Current product already allows both off and shows a warning only in Settings. The tray should preserve that behavior rather than silently force one on.

## Source links

Official docs used:

- Electron BrowserWindow API: https://www.electronjs.org/docs/latest/api/browser-window
- Electron Tray API: https://www.electronjs.org/docs/latest/api/tray
- Electron Menu API: https://www.electronjs.org/docs/latest/api/menu
- Electron MenuItem API: https://www.electronjs.org/docs/latest/api/menu-item

Repo files examined:

- [src/main/core/app-lifecycle.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/app-lifecycle.ts)
- [src/main/core/app-lifecycle.test.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/app-lifecycle.test.ts)
- [src/main/core/window-manager.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.ts)
- [src/main/core/window-manager.test.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/window-manager.test.ts)
- [src/main/ipc/register-handlers.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/ipc/register-handlers.ts)
- [src/main/services/settings-service.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/services/settings-service.ts)
- [src/main/services/hotkey-service.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/services/hotkey-service.ts)
- [src/main/core/command-router.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/core/command-router.ts)
- [src/main/orchestrators/capture-pipeline.ts](/workspace/.worktrees/feat/output-mode-menu/src/main/orchestrators/capture-pipeline.ts)
- [src/shared/domain.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/domain.ts)
- [src/shared/output-selection.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/output-selection.ts)
- [src/shared/ipc.ts](/workspace/.worktrees/feat/output-mode-menu/src/shared/ipc.ts)
- [src/preload/index.ts](/workspace/.worktrees/feat/output-mode-menu/src/preload/index.ts)
- [src/renderer/settings-output-react.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/settings-output-react.tsx)
- [src/renderer/settings-output-react.test.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/settings-output-react.test.tsx)
- [src/renderer/renderer-app.tsx](/workspace/.worktrees/feat/output-mode-menu/src/renderer/renderer-app.tsx)
- [specs/spec.md](/workspace/.worktrees/feat/output-mode-menu/specs/spec.md)
- [specs/user-flow.md](/workspace/.worktrees/feat/output-mode-menu/specs/user-flow.md)
- [docs/research/002-popup-window-handling-and-frontmost-behavior.md](/workspace/.worktrees/feat/output-mode-menu/docs/research/002-popup-window-handling-and-frontmost-behavior.md)
