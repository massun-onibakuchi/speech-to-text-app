<!--
Where: specs/h2-design-pick-and-run-transformation-ux.md
What: Design decision — profile picker UX modality and IPC contract for pickAndRunTransformation.
Why: Phase 3A pre-requisite H2. Determines how the user explicitly picks a transformation
     profile when the pickAndRunTransformation shortcut fires.
-->

# H2 — Design: `pickAndRunTransformation` Profile Picker UX

**Status:** Superseded by `specs/h3-dedicated-profile-picker-window-ux.md`
**Date:** 2026-02-17
**Phase:** 3A pre-requisite

## Supersession Note (2026-02-19)

This document originally approved **Approach 3B** (native `Menu.popup()`).
Implementation moved to the dedicated BrowserWindow contract in
`specs/h3-dedicated-profile-picker-window-ux.md`. This is an explicit design
departure from the original no-focus-steal preference in favor of:

- deterministic picker behavior and keyboard handling across app modes,
- testability through explicit picker window lifecycle and IPC hook,
- a richer profile presentation than text-only native menu entries.

Issue #85 further supersedes prior persistence assumptions: pick-and-run is
request-scoped (one-time) and does not update persisted active profile.
All new implementation and review decisions should follow h3 + `specs/spec.md`.

Historical-reference note:
- Sections below may mention removed concepts such as `activePresetId`.
- Those references are retained for historical design context only and are non-normative.

## 1. Problem Statement

Spec §4.2 L169 requires `pickAndRunTransformation` to:

1. Present the user with a list of available transformation profiles.
2. Let the user explicitly pick one.
3. Execute the transformation using that profile against clipboard top item.
4. Leave persisted active profile unchanged.

The **current implementation** (`HotkeyService.pickAndRunTransform()`) cycles through
presets in round-robin order — no explicit user choice. This does not satisfy the spec.

### Requirements from spec

- `pickAndRunTransformation` **MUST** run as request-scoped behavior and **MUST NOT**
  update persisted active profile as a side effect (issue #85 + spec update).
- Persisted profile/default changes from explicit profile management actions **MUST** take
  effect for subsequent requests only; in-flight requests **MUST NOT** be rewritten
  (spec §4.2 L186).
- Each shortcut execution **MUST** bind a profile snapshot at enqueue time (spec §4.2 L180).

## 2. Context

### Current architecture

| Component | Role |
|---|---|
| `HotkeyService` (main process) | Registers global shortcuts, dispatches to `CommandRouter` |
| `CommandRouter` (main process) | Validates, snapshots, enqueues to `TransformQueue` |
| `TransformQueue` (main process) | Processes transform jobs asynchronously |
| Renderer process | Single `main.ts` with vanilla DOM, receives IPC pushes |
| Preload bridge | Exposes `window.speechToTextApi` via `contextBridge` |

### Key constraint: Global shortcut triggers in main process

When the user presses the `pickAndRunTransformation` shortcut, the callback fires in
the **main process** (via Electron's `globalShortcut` API). The Electron window may be
hidden or in the background. The picker UI must appear **on top of the frontmost app**.

## 3. Approaches Evaluated

### 3A. Renderer Modal (BrowserWindow popup)

**How it works:**
1. Global shortcut fires in main process.
2. Main process sends IPC message to renderer: `showProfilePicker`.
3. Renderer shows an in-app modal with profile list.
4. User picks a profile.
5. Renderer sends back the picked `profileId` via IPC.
6. Main process enqueues transformation using the picked profile for this request only.

**Variant:** Use a dedicated small `BrowserWindow` (popup) instead of the main renderer window.

**Pros:**
- Full control over UI styling and behavior.
- Rich profile information display (name, provider, model, preview).
- Keyboard navigation (arrow keys + Enter) is straightforward with vanilla DOM.
- Consistent with existing renderer-based UI patterns in the codebase.

**Cons:**
- **Requires the main window to be visible** (or creating a new popup window).
- If the app is in menu-bar mode or hidden, showing the renderer requires `win.show()` + `win.focus()`, which steals focus from the user's frontmost app.
- Latency: window creation/show + IPC round trip + render + user interaction.
- The user may have been working in another app; showing our window is disruptive.
- Complex lifecycle: must handle window close, Escape key, click-away dismissal.

### 3B. Native macOS Context Menu (Electron `Menu.buildFromTemplate`)

**How it works:**
1. Global shortcut fires in main process.
2. Main process builds a native macOS context menu from the current profile list.
3. Menu is shown at the mouse cursor position (or screen center) using `menu.popup()`.
4. User clicks a profile name.
5. Callback fires in main process with the selected `profileId`.
6. Main process enqueues transformation using the selected profile for this request only.

**Pros:**
- **Appears instantly** — no window creation, no IPC round trip.
- **Does not steal focus** from the frontmost app. Native menus float above all windows.
- **Familiar macOS UX** — users know how to interact with context menus.
- **Keyboard accessible** — arrow keys + Enter work natively on macOS context menus.
- **Zero renderer involvement** — entirely in main process. No IPC contract needed for display.
- **Minimal code** — ~20 LOC to build menu from profiles array.
- **Dismissable** — clicking outside or pressing Escape closes the menu (native behavior).
- Matches how Raycast, Alfred, and similar macOS tools present quick-pick lists.

**Cons:**
- **Styling is limited** to native macOS menu appearance (no custom colors, no rich layouts).
- Cannot show extra metadata per profile (e.g., provider icon, model name) beyond the menu label.
- Menu items are text-only (can include accelerator hints but no custom widgets).
- If the profile list is very long (>15 items), native menus may feel unwieldy.
  - Mitigation: v1 profile count is expected to be small (3–8 profiles).
- `menu.popup()` positioning requires knowing where to show the menu:
  - Option A: Show at current mouse cursor position — works reliably.
  - Option B: Show at screen center — less natural but consistent.
  - Option C: Show anchored to tray icon (if menu-bar mode) — natural for menu-bar apps.

### 3C. Electron Tray Menu

**How it works:**
The app registers a macOS tray (menu bar) icon. When the shortcut fires, it opens the tray
menu with profile options.

**Pros:**
- Naturally anchored to tray icon.
- Works well for menu-bar utility apps.

**Cons:**
- **Only viable if the app is in menu-bar mode.** In standard app mode, there may be no tray icon.
- Cannot be dynamically triggered at arbitrary positions.
- **Not a general solution for both interface modes.**

### 3D. Dedicated Overlay Window (Transparent BrowserWindow)

**How it works:**
1. Global shortcut fires in main process.
2. Main process creates a small, frameless, transparent `BrowserWindow` positioned at
   the screen center or near the mouse cursor.
3. Window renders a minimal profile picker (list with keyboard nav).
4. User picks → IPC callback → window closes.

**Pros:**
- Full styling control — can look like Raycast/Alfred/Spotlight.
- Appears as overlay without disrupting the frontmost app.
- Can be keyboard-driven (arrow keys, type-to-filter).

**Cons:**
- **Significant implementation complexity**: new BrowserWindow, separate HTML, IPC contract,
  lifecycle management, focus handling, screen positioning.
- Must handle multi-monitor scenarios.
- Must handle edge cases: window creation failure, user switching spaces, etc.
- Overkill for a simple profile list with 3–8 items.
- Higher latency (window creation + render) than native menu.

### 3E. System Notification with Actions

**How it works:**
Use macOS notification with action buttons for each profile.

**Cons:**
- macOS limits notification actions to 1–2 buttons.
- Not suitable for dynamic lists.
- Notifications can be dismissed by DND mode.
- **Not viable.**

## 4. Analysis Matrix

| Criterion | 3A: Renderer Modal | 3B: Native Menu | 3C: Tray Menu | 3D: Overlay Window | 3E: Notification |
|---|---|---|---|---|---|
| Appears without focus steal | No | **Yes** | Partial | Yes | Yes |
| Works in all interface modes | Yes | **Yes** | No | Yes | No |
| Implementation complexity | Medium | **Low** | Low | High | Low |
| Latency to display | ~200–500 ms | **~10 ms** | ~10 ms | ~100–300 ms | ~50 ms |
| Keyboard navigation | Custom impl | **Native** | Native | Custom impl | None |
| Styling control | Full | Minimal | Minimal | Full | None |
| Renderer IPC needed | Yes | **No** | No | Yes | No |
| Dismissal behavior | Custom impl | **Native** | Native | Custom impl | Auto-dismiss |
| Profile count capacity | Unlimited | ~15 practical | ~10 | Unlimited | ~2 |

## 5. Verdict: Approach 3B — Native macOS Context Menu

**Recommended approach: 3B (native Electron `Menu.popup()`).**

### Rationale

1. **No focus stealing.** The native menu appears as a floating panel above all windows.
   The user stays in their current app context — critical because the shortcut fires while
   they're working in another app (e.g., browser, editor).

2. **Instant display.** Native menus appear in ~10 ms. No window creation, no IPC round trip,
   no renderer involvement. The entire flow stays in the main process.

3. **Zero IPC contract for display.** The profile picker is built and shown entirely in the
   main process. The execution path can reuse the existing
   `transform:composite-from-clipboard` pipeline while passing the picked profile as an
   execution-time override.

4. **Minimal implementation.** ~20–30 LOC in `HotkeyService` or a dedicated `ProfilePickerService`.
   Uses Electron's built-in `Menu.buildFromTemplate()` + `menu.popup()`.

5. **Native keyboard accessibility.** Arrow keys, Enter, Escape — all work out of the box.

6. **Familiar UX.** Users know how to use macOS context menus. No learning curve.

7. **Adequate for expected profile count.** v1 users are expected to have 3–8 profiles.
   Native menus handle this comfortably.

### Why not Overlay Window (3D)?

The overlay approach would provide a more polished Raycast/Spotlight-like experience
but requires significant implementation effort (new BrowserWindow, HTML, focus management,
multi-monitor support) for marginal UX benefit. For v1 with a small profile count,
native menus are the pragmatic choice.

### Future upgrade path

If user feedback indicates the need for richer profile picker UX (search/filter,
profile preview, grouped categories), we can upgrade to an overlay window (3D) in a
future version. The IPC contract and `CommandRouter` integration remain the same —
only the picker UI component changes.

## 6. IPC Contract Design

### Minimal contract

Because the native menu approach runs entirely in the main process, **no new IPC channel
is required** for displaying the picker. The flow is:

```
Global shortcut fires
  → HotkeyService callback (main process)
    → Build Menu from settings.transformation.presets
    → menu.popup() — user sees native menu
    → User clicks profile item
      → Menu callback fires (main process)
        → commandRouter.runCompositeFromClipboard({ profileIdOverride: pickedId })
        → broadcastCompositeTransformStatus(result)
```

### Cancel handling

If the user dismisses the menu (Escape or click-away), `menu.popup()` returns without
triggering any callback. No transformation runs. This satisfies the spec requirement
that the shortcut can be cancelled.

### IPC contract for renderer notification (reuses existing)

The renderer is notified of the transformation result via the existing
`transform:composite-status` push channel. No new channel needed.

If the renderer needs to know that `defaultPresetId` changed (e.g., to update a status
indicator), that change should only come from explicit settings/default actions, not
pick-and-run. For v1, renderer re-fetch behavior remains unchanged.

## 7. Proposed Implementation Shape

### Option A: Inline in `HotkeyService` (simplest)

```typescript
// In HotkeyService.pickAndRunTransform() — replace current cyclic-next logic
private async pickAndRunTransform(): Promise<void> {
  const settings = this.settingsService.getSettings()
  const presets = settings.transformation.presets
  if (presets.length === 0) return

  const pickedId = await this.showProfilePicker(presets, settings.transformation.lastPickedPresetId)
  if (!pickedId) return  // user cancelled

  // Execute transformation with one-time profile override
  const result = await this.commandRouter.runCompositeFromClipboard({
    profileIdOverride: pickedId
  })
  this.onCompositeResult?.(result)
}

private showProfilePicker(
  presets: TransformationPreset[],
  currentFocusId: string | null
): Promise<string | null> {
  return new Promise((resolve) => {
    const template = presets.map((preset) => ({
      label: preset.name + (preset.id === currentFocusId ? ' ✓' : ''),
      click: () => resolve(preset.id)
    }))

    const menu = Menu.buildFromTemplate(template)
    menu.popup({
      callback: () => resolve(null)  // menu closed without selection
    })
  })
}
```

### Option B: Dedicated `ProfilePickerService` (cleaner separation)

```
src/main/services/profile-picker-service.ts
```

Extracts the menu logic into its own service, injected into `HotkeyService`.
This is cleaner for testing (can mock the picker) and follows the existing
single-purpose module pattern.

**Recommendation:** Start with Option A for simplicity. Extract to Option B
if the picker logic grows (e.g., adding checkmarks, submenus, keyboard shortcut hints).

## 8. Menu UX Details

### Menu item format

```
┌─────────────────────────────┐
│ Default Rewrite           ✓ │  ← currently active profile marked
│ Email Formatter             │
│ Code Review                 │
│ Japanese → English          │
└─────────────────────────────┘
```

- Active profile marked with `✓` (checkmark) via `checked: true` on the menu item.
- Menu items are profile `name` (or `title` after schema alignment).

### Menu positioning

`menu.popup()` without explicit coordinates defaults to the **current mouse cursor
position** on macOS. This is the natural behavior for a context-menu triggered by a
global shortcut.

### Keyboard flow

1. User presses `Cmd+Opt+P` (global shortcut for `pickAndRunTransformation`).
2. Native menu appears at cursor.
3. User presses ↓/↑ to navigate, Enter to select, Escape to cancel.
4. Selection triggers transformation; Escape does nothing.

## 9. Dependency on Menu API

The `Menu` class from Electron must be injected into `HotkeyService` (or
`ProfilePickerService`) for testability. Current `HotkeyService` already uses
dependency injection for `globalShortcut` and `settingsService`.

```typescript
interface HotkeyDependencies {
  // ... existing deps ...
  menuFactory?: {
    buildFromTemplate: typeof Menu.buildFromTemplate
  }
}
```

For tests, `menuFactory` can be mocked to simulate user picking a profile or cancelling.

## 10. Open Questions

1. **Should the menu show provider/model info?** E.g., "Default Rewrite (Gemini Flash 8B)"
   → Recommendation: Start with profile name only. Add provider/model in parentheses
   if users request it.

2. **Submenu for profile management?** E.g., "Edit Profiles..." at the bottom.
   → Recommendation: Out of scope for v1. Keep the menu focused on picking.

3. **What if there's only 1 profile?** Should the picker skip and auto-select?
   → Recommendation: Yes, skip the menu and auto-select if there's exactly 1 profile.
   This matches the `runDefaultTransformation` behavior and avoids unnecessary UI.
