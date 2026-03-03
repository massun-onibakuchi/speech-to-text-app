# Research: macOS Custom Titlebar, Traffic Lights, and Draggable Regions

**Date:** 2026-03-03
**Scope:** Electron 38 + macOS — hide the native titlebar, keep traffic lights (close / minimize / maximize), and set a CSS draggable region so the user can drag the window from the custom header.
**Refs:** [Electron Custom Title Bar tutorial](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) · [Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) · [Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles) · [BaseWindowConstructorOptions](https://www.electronjs.org/docs/latest/api/structures/base-window-options) · [DoltHub blog post](https://www.dolthub.com/blog/2025-02-11-building-a-custom-title-bar-in-electron/)

---

## 1. Current State of the App

| Aspect | Today | Target |
|--------|-------|--------|
| `titleBarStyle` | `"default"` (implicit) | `"hiddenInset"` |
| Native titlebar | Visible (light-grey strip) | Hidden — renderer paints full window |
| Traffic lights | Visible (green disabled via `maximizable:false`) | Visible (all three enabled, including green) |
| Draggable region | Native titlebar strip | Custom `<header>` via CSS `app-region: drag` |
| `backgroundColor` | `#1a1a1f` (macOS only) | Keep — prevents white flash |

### Files involved

| File | Role |
|------|------|
| `src/main/core/window-manager.ts` | BrowserWindow creation; sets `macosOptions` |
| `src/renderer/shell-chrome-react.tsx` | Header bar: logo, app name, recording dot |
| `src/renderer/app-shell-react.tsx` | Root layout: `<header>` + `<main>` + `<footer>` |
| `src/renderer/styles.css` | Tailwind v4 global styles, OKLCH tokens |

---

## 2. Electron API Surface

### 2.1 `titleBarStyle` (BrowserWindow constructor)

| Value | macOS behaviour | Windows/Linux behaviour |
|-------|----------------|------------------------|
| `"default"` | Standard OS titlebar | Standard OS titlebar |
| `"hidden"` | Hides titlebar; traffic lights stay at default position in upper-left | Hides titlebar; **no window controls** unless `titleBarOverlay` is set |
| `"hiddenInset"` | Hides titlebar; traffic lights shift inward (slightly indented from left edge) | Same as `hidden` |
| `"customButtonsOnHover"` | Hides titlebar + traffic lights appear on hover only (experimental) | N/A |

**Recommendation for this app:** `"hiddenInset"` — it gives the cleanest macOS look. Traffic lights are inset by a small amount, leaving room for padding in the header.

### 2.2 `trafficLightPosition` (macOS only)

```ts
trafficLightPosition: { x: number, y: number }
```

Sets the pixel offset of the traffic lights from the top-left corner of the window frame. Useful for vertically centering the lights within a taller custom header.

**Formula** (from DoltHub approach):
```ts
const HEADER_HEIGHT = 40           // our header is py-2 (~40px)
const TRAFFIC_LIGHT_HEIGHT = 14    // native traffic light dot height
const y = Math.round(HEADER_HEIGHT / 2 - TRAFFIC_LIGHT_HEIGHT / 2)
// ≈ 13px
```

### 2.3 `titleBarOverlay` (Windows/Linux)

When `titleBarStyle: "hidden"`, Windows/Linux lose all window controls. To restore them:

```ts
titleBarOverlay: {
  color: '#1a1a1f',        // match --background token
  symbolColor: '#e0e0e0',  // match --foreground token
  height: 40               // match custom header height
}
```

This enables the **Window Controls Overlay** API, which exposes CSS env vars:
- `env(titlebar-area-x)` / `env(titlebar-area-y)`
- `env(titlebar-area-width)` / `env(titlebar-area-height)`

### 2.4 `frame: false` vs `titleBarStyle: "hidden"`

| | `frame: false` | `titleBarStyle: "hidden"` |
|-|----------------|--------------------------|
| Native titlebar | Removed entirely | Removed |
| Traffic lights (macOS) | **Gone** | **Kept** |
| Window controls (Win/Linux) | **Gone** | Restorable via `titleBarOverlay` |
| Window shadow (macOS) | Kept | Kept |
| Rounded corners (macOS) | Kept | Kept |

**Never use `frame: false`** if you want macOS traffic lights. Use `titleBarStyle: "hidden"` or `"hiddenInset"`.

### 2.5 Other relevant constructor options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `maximizable` | boolean | `true` | Currently set to `false` — should be reverted to `true` (re-enable green button) |
| `fullscreenable` | boolean | `true` | On macOS, the green button enters fullscreen by default when maximizable. Keep `true`. |
| `acceptFirstMouse` | boolean | `false` | macOS only. If `true`, clicking an inactive window also clicks through to web contents. Consider setting `true` for power-user UX. |
| `transparent` | boolean | `false` | **Do NOT enable** — breaks resize, blocks DevTools transparency, and is unnecessary. |
| `vibrancy` | string | none | macOS only. Options: `sidebar`, `under-window`, `header`, etc. Could add `"sidebar"` to left panel later. Out of scope now. |

### 2.6 Instance methods

| Method | Platform | Notes |
|--------|----------|-------|
| `win.setWindowButtonVisibility(visible)` | macOS | Programmatically show/hide traffic lights |
| `win.setWindowButtonPosition(point \| null)` | macOS | Move traffic lights at runtime; `null` resets to default |
| `win.setTitleBarOverlay(options)` | Win/Linux | Update overlay color/height at runtime |

---

## 3. CSS Draggable Regions

### 3.1 Core mechanism

```css
/* Make the header draggable */
.titlebar {
  app-region: drag;          /* standard property (Electron 38+) */
  -webkit-app-region: drag;  /* legacy WebKit prefix — still needed for older Electron */
  user-select: none;         /* prevent accidental text selection while dragging */
  -webkit-user-select: none;
}
```

**Critical rule:** Elements with `app-region: drag` completely ignore ALL pointer events (click, mouseenter, mouseup, etc.). Any interactive element inside a draggable region **must** explicitly opt out:

```css
.titlebar button,
.titlebar a,
.titlebar input,
.titlebar select {
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
```

### 3.2 How it maps to our app

The `<header>` in `shell-chrome-react.tsx` is the natural drag target:

```
┌────────────────────────────────────────────────────────────────────┐
│  🔴 🟡 🟢  │  [logo] Speech-to-Text v1        ● Recording       │
│ traffic     │  ←——— draggable region ————————→                    │
│ lights      │                                                     │
└────────────────────────────────────────────────────────────────────┘
```

The traffic lights are rendered natively by macOS **behind** the web content, overlapping the top-left of the renderer. The header must leave space (left padding) for traffic lights so they don't overlap the logo.

### 3.3 Left padding for traffic lights

macOS traffic lights are approximately:
- **Width:** 68–70 px (three dots + spacing)
- **Height:** ~14 px

With `titleBarStyle: "hiddenInset"`, the lights are indented a few extra pixels. A safe `padding-left` for the header on macOS:

```css
/* Applied only on macOS — can use a data-attribute or CSS env var */
.titlebar-macos {
  padding-left: 78px;  /* 68px traffic lights + 10px breathing room */
}
```

Alternatively, use the Window Controls Overlay CSS env vars:
```css
.titlebar {
  padding-left: env(titlebar-area-x, 16px);
}
```
This returns 0 on macOS (traffic lights overlay on top of the content; the env var is for Win/Linux overlay). So a manual padding is safer on macOS.

### 3.4 Known issues and caveats

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **`app-region: drag` blocks all pointer events** | Buttons/links inside draggable area don't work | Apply `app-region: no-drag` to every interactive element inside |
| **Right-click on draggable area shows system context menu** | Platform behavior, not a bug | Don't add custom context menu on header |
| **Double-click on draggable area triggers maximize/restore** | macOS system behavior | This is desired UX. If we re-enable `maximizable: true`, double-click on header maximizes the window. |
| **`app-region: drag` broken with DevTools open** | Longstanding Chromium bug | No fix; only affects development |
| **Only rectangular shapes** | Can't use border-radius regions for drag | Not an issue for a rectangular header |
| **Inline styles don't work** | Must use CSS class/rule, not `style=""` | Use Tailwind class or CSS rule |
| **Text selection while dragging** | User accidentally selects header text | Apply `user-select: none` to draggable region |

### 3.5 Double-click behavior on macOS

When a user double-clicks a draggable region on macOS, the system applies the user's **System Preferences > Dock & Menu Bar > Double-click a window's title bar to** setting:
- **Zoom** (default): maximize/restore the window
- **Minimize**: minimize to dock

With `titleBarStyle: "hidden"` or `"hiddenInset"`, Electron handles this automatically for the native traffic-light strip. But for **custom** draggable regions in the renderer, you may need to handle it explicitly via IPC if the automatic behavior doesn't trigger reliably.

**DoltHub approach (optional, for robust double-click):**
```ts
// renderer
const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
  if (e.currentTarget === e.target) {
    window.speechToTextApi.macTitlebarDoubleClick()
  }
}

// main process
ipcMain.on('mac-titlebar-double-click', (event) => {
  const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (action === 'Minimize') win.minimize()
  else if (!win.isMaximized()) win.maximize()
  else win.unmaximize()
})
```

**Note:** In practice, Electron's built-in `app-region: drag` already respects macOS double-click-to-zoom. The IPC approach is only needed if you experience unreliable behavior.

---

## 4. Cross-Platform Strategy

```ts
// window-manager.ts
const HEADER_HEIGHT = 40
const TRAFFIC_LIGHT_HEIGHT = 14

const isDarwin = process.platform === 'darwin'

const platformOptions = isDarwin
  ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: {
        x: 13,
        y: Math.round(HEADER_HEIGHT / 2 - TRAFFIC_LIGHT_HEIGHT / 2)
      },
      backgroundColor: '#1a1a1f'
    }
  : {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: '#1a1a1f',
        symbolColor: '#f0f0f0',
        height: HEADER_HEIGHT
      }
    }

this.mainWindow = new BrowserWindow({
  width: 1120,
  height: 760,
  show: true,
  ...platformOptions,
  webPreferences: { ... }
})
```

**Key differences by platform:**

| Concern | macOS | Windows/Linux |
|---------|-------|---------------|
| Titlebar style | `"hiddenInset"` | `"hidden"` |
| Window controls | Native traffic lights (auto) | `titleBarOverlay` (explicit) |
| Header left padding | ~78px (traffic light width) | ~0px (overlay is in the far right) |
| Header right padding | Normal | Account for overlay width (~138px on Windows) |
| Double-click header | System zoom/minimize | N/A (system handles via overlay) |

---

## 5. Renderer Changes Required

### 5.1 Header component (`shell-chrome-react.tsx`)

```tsx
<header
  className={cn(
    'flex items-center justify-between border-b px-4 py-2 bg-card/50',
    'app-region-drag select-none'  // new: make draggable, prevent text selection
  )}
>
  {/* Content stays the same, but wrap in no-drag if needed */}
</header>
```

### 5.2 CSS additions (`styles.css`)

```css
/* Draggable region utilities for custom titlebar */
.app-region-drag {
  app-region: drag;
  -webkit-app-region: drag;
}

.app-region-no-drag {
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
```

### 5.3 Platform-aware left padding

The header needs extra left padding on macOS to avoid overlapping traffic lights. Options:

**Option A: CSS class toggled via preload/IPC**
```ts
// preload: expose platform
contextBridge.exposeInMainWorld('platform', process.platform)

// renderer
<header className={cn('...', window.platform === 'darwin' && 'pl-[78px]')}>
```

**Option B: CSS env var (Window Controls Overlay)**
```css
.titlebar {
  padding-left: max(16px, env(titlebar-area-x, 16px));
  padding-right: max(16px, calc(100% - env(titlebar-area-x, 100%) - env(titlebar-area-width, 0px)));
}
```
(This only works when `titleBarOverlay` is enabled; on macOS, env vars return 0.)

**Recommendation:** Option A is simpler and more reliable for macOS.

---

## 6. Impact on Existing PR #306 (`maximizable: false`)

PR #306 set `maximizable: false` to disable the green button. This new feature **reverses** that decision:

- Remove `maximizable: false` from `macosOptions`
- The green button (maximize/fullscreen) becomes active again
- `fullscreenable: true` (default) means clicking green enters **fullscreen** mode (macOS 10.11+)
- Double-clicking the header maximizes/restores (per system preference)

If we want the green button to **maximize** (fill screen without going fullscreen), we need:
```ts
fullscreenable: false  // green button maximizes instead of going fullscreen
```

This is a UX decision: fullscreen vs maximize. Most macOS apps use fullscreen (default).

---

## 7. Impact on Tests

### Unit tests (`window-manager.test.ts`)

Current tests assert:
- `maximizable: false` on darwin — **must change** to not assert this (or assert `maximizable` is absent)
- `backgroundColor: '#1a1a1f'` on darwin — still valid
- New assertions needed: `titleBarStyle`, `trafficLightPosition`

### E2E tests (`e2e/electron-ui.e2e.ts`)

- E2E selectors for settings page use `#settings-transcription-provider` etc. — unaffected
- Any test that checks window title visibility may need updating
- Tests that interact with the header area should still work (header is still rendered, just now draggable)

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Traffic lights overlap header content | Medium | Add left padding (~78px) on macOS |
| Buttons in header stop working due to `app-region: drag` | High | Apply `app-region: no-drag` to all interactive children |
| Windows/Linux users lose window controls | High | Always set `titleBarOverlay` on non-darwin |
| DevTools drag region bug | Low | Dev-only; no production impact |
| E2E tests break due to layout shift | Low | Header padding changes are small; selectors are id-based |
| Existing `maximizable: false` test breaks | Low | Update test to match new behavior |

---

## 9. Implementation Checklist

- [ ] **window-manager.ts:** Replace `macosOptions` with platform-aware config (`titleBarStyle`, `trafficLightPosition`, `titleBarOverlay`)
- [ ] **window-manager.ts:** Remove `maximizable: false` (re-enable green button)
- [ ] **styles.css:** Add `.app-region-drag` and `.app-region-no-drag` utility classes
- [ ] **shell-chrome-react.tsx:** Add `app-region-drag` class to `<header>`; ensure no interactive children need `no-drag`
- [ ] **shell-chrome-react.tsx or app-shell-react.tsx:** Add macOS-specific left padding for traffic light clearance
- [ ] **preload/index.ts:** Expose `process.platform` to renderer (if using Option A for padding)
- [ ] **window-manager.test.ts:** Update darwin test assertions (titleBarStyle, trafficLightPosition, remove maximizable:false check)
- [ ] **E2E:** Verify header interactions still work with draggable region

---

## 10. References

- [Electron Custom Title Bar Tutorial](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- [Electron Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)
- [Electron Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
- [BaseWindowConstructorOptions API](https://www.electronjs.org/docs/latest/api/structures/base-window-options)
- [DoltHub: Building a Custom Title Bar in Electron (Feb 2025)](https://www.dolthub.com/blog/2025-02-11-building-a-custom-title-bar-in-electron/)
- [Electron issue #39885: Fullscreen traffic light click area](https://github.com/electron/electron/issues/39885)
- [Electron issue #33462: app-region drag blocks clicks](https://github.com/electron/electron/issues/33462)
- [Electron issue #15163: Disable double-click maximize](https://github.com/electron/electron/issues/15163)
- [Electron issue #1354: app-region drag eats click events](https://github.com/electron/electron/issues/1354)
