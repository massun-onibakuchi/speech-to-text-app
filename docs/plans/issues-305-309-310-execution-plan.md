# Execution Plan — Issues #305, #309 & #310

> **Date:** 2026-03-03
> **Research:** [`docs/research/macos-custom-titlebar-traffic-lights.md`](../research/macos-custom-titlebar-traffic-lights.md)

---

## Ticket Overview

| Priority | Ticket | Issue | Summary | PR Count |
|----------|--------|-------|---------|----------|
| 1 | [T1 — Frameless Profile Picker](#ticket-1--frameless-profile-picker-issue-310) | #310 | Remove native titlebar from picker popup | 1 PR |
| 2 | [T2 — Custom Titlebar + Draggable Header](#ticket-2--custom-titlebar--draggable-header-issue-309) | #309 | Hide titlebar, keep traffic lights, CSS drag region | 1 PR |
| 3 | [T3 — Radix Primitives Foundation](#ticket-3--radix-primitives-foundation-issue-305-pr-1) | #305 | Install deps + create shared UI wrappers | 1 PR |
| 4 | [T4 — Output Settings: RadioGroup + Switch](#ticket-4--output-settings-radiogroup--switch-issue-305-pr-2) | #305 | Replace custom radio/checkbox in settings-output | 1 PR |
| 5 | [T5 — Tabs + Separator](#ticket-5--tabs--separator-issue-305-pr-3) | #305 | Replace TabButton + `<hr>` in app-shell | 1 PR |
| 6 | [T6 — Profiles Panel: Select](#ticket-6--profiles-panel-select-issue-305-pr-4) | #305 | Replace remaining native `<select>` in profiles panel | 1 PR |

### Priority Rationale

- **T1 (P1):** Smallest change (2 files), immediate visual fix, no dependencies. Ship fast.
- **T2 (P2):** Cross-platform titlebar is a prerequisite for polished UX. Touches `shell-chrome-react.tsx` and `styles.css` — must merge before T5 (which rewrites `app-shell-react.tsx` tabs that share the same header area).
- **T3 (P3):** Foundation for T4–T6. No behavioral changes — just installs deps and creates wrapper files. Must merge before any Radix consumer PR.
- **T4 (P4):** First Radix consumer. Isolated to `settings-output-react.tsx` — no overlap with T1/T2 files.
- **T5 (P5):** Rewrites `app-shell-react.tsx` tabs + separators. Must come after T2 (which modifies `styles.css` and header layout) to avoid merge conflicts.
- **T6 (P6):** Final cleanup. Replaces last native `<select>` elements. Depends on T3 foundation.

---

## Ticket 1 — Frameless Profile Picker (Issue #310)

### Goal

Remove the native titlebar from the profile-picker popup window. The picker is a small, transient, `alwaysOnTop` popup — the native frame is redundant because the `.card` CSS already provides visual chrome (`border-radius: 8px`, `box-shadow`).

### Approach

**Strategy:** Change `frame: true` → `frame: false` and add `backgroundColor` to prevent white flash. Optionally add `border-radius` on `<html>` for rounded corners on macOS (native rounded corners may not apply to frameless windows).

**Why `frame: false` is safe here:** The picker already sets `maximizable: false`, `minimizable: false`, `fullscreenable: false` — no traffic lights appear even with `frame: true`. Removing the frame only removes the titlebar strip.

**Alternative considered:** Using `titleBarStyle: 'hidden'` instead of `frame: false`. Rejected because it's unnecessary overhead — the picker has no window controls to preserve, and `frame: false` is simpler.

### Scope & Files

| File | Change |
|------|--------|
| `src/main/services/profile-picker-service.ts` | `frame: true` → `frame: false`, add `backgroundColor: '#1a1a1f'`, add `backgroundColor?: string` to `PickerBrowserWindowOptions` interface |
| `src/main/services/profile-picker-service.test.ts` | Update assertions for `frame: false` and `backgroundColor` |

### Code Snippets

**`profile-picker-service.ts` (lines ~324–342) — before:**
```ts
const pickerWindow = this.windowFactory.create({
  // ...
  frame: true,
  title: 'Pick Transformation Profile',
  // ...
})
```

**After — interface (lines ~17–35):**
```ts
export interface PickerBrowserWindowOptions {
  // ... existing fields ...
  frame: boolean
  backgroundColor?: string  // ← NEW: prevent white flash on frameless window
  title: string
  // ...
}
```

**After — window creation (lines ~324–342):**
```ts
const pickerWindow = this.windowFactory.create({
  // ...
  frame: false,
  backgroundColor: '#1a1a1f',
  title: 'Pick Transformation Profile',
  // ...
})
```

**`useContentSize: true` with `frame: false`:** When the frame is removed, `useContentSize: true` is effectively a no-op — the content area equals the full window area. The `WINDOW_BASE_HEIGHT` / `WINDOW_ITEM_HEIGHT` constants target content dimensions and remain correct.

**Inline HTML hardening — rounded corners:** macOS may lose native rounded corners with `frame: false`. Test on macOS first; if needed, add to the picker's inline `<style>`:
```css
html, body {
  border-radius: 8px;
  overflow: hidden;
}
```
This is a **conditional task** — only apply if visual regression is confirmed.

### Trade-offs

| Pro | Con |
|-----|-----|
| Immediate visual improvement — no grey titlebar | Frameless windows lose native rounded corners on macOS (mitigated with CSS) |
| Tiny diff, easy to review | `useContentSize: true` behavior change risk (low — constants target content area) |
| No renderer changes needed | N/A |

### Tasks

- [ ] Read `profile-picker-service.ts` and `profile-picker-service.test.ts` fully
- [ ] Add `backgroundColor?: string` to `PickerBrowserWindowOptions` interface
- [ ] Change `frame: true` → `frame: false` in `profile-picker-service.ts`
- [ ] Add `backgroundColor: '#1a1a1f'` to picker window options
- [ ] Evaluate if inline HTML needs `border-radius` on `<html>`/`<body>` for rounded corners
- [ ] Update test assertions in `profile-picker-service.test.ts`
- [ ] Run unit tests: `npx vitest run src/main/services/profile-picker-service.test.ts`
- [ ] Manual smoke test: open picker, verify no titlebar, keyboard nav works

### Gates

- [ ] `profile-picker-service.test.ts` passes
- [ ] Full test suite passes (`npm test`)
- [ ] Picker opens without native titlebar
- [ ] Keyboard navigation (Up/Down/Enter/Escape) still works
- [ ] Click selection still works
- [ ] Auto-close timeout (60s) still works
- [ ] No white flash on open

---

## Ticket 2 — Custom Titlebar + Draggable Header (Issue #309)

### Goal

Replace the default Electron titlebar with a custom layout:
1. Hide the native titlebar strip on the main window
2. Keep macOS traffic lights (close / minimize / maximize) — re-enable the green button
3. Make the app's `<header>` bar a draggable window region via CSS `app-region: drag`
4. Support Windows/Linux via `titleBarOverlay`

### Approach

**Strategy — Main process (`window-manager.ts`):**
- macOS: `titleBarStyle: 'hiddenInset'` + `trafficLightPosition: { x: 13, y: 13 }` — hides titlebar while preserving traffic lights inset into the content area.
- Windows/Linux: `titleBarStyle: 'hidden'` + `titleBarOverlay: { color: '#1a1a1f', symbolColor: '#f0f0f0', height: 40 }` — hides titlebar but adds a native overlay for min/max/close buttons.
- Remove `maximizable: false` (re-enable green button).

**Strategy — Renderer:**
- Add `.app-region-drag` / `.app-region-no-drag` utility classes in `styles.css`.
- Apply `app-region-drag` + `select-none` to the `<header>` in `shell-chrome-react.tsx`.
- Add ~78px left padding on macOS to clear traffic lights.
- Add ~140px right padding on Windows/Linux to clear `titleBarOverlay`.
- Expose `process.platform` to renderer via preload bridge.

**Why `titleBarStyle: 'hiddenInset'` over `frame: false`:**
`frame: false` removes traffic lights entirely. `hiddenInset` hides the grey titlebar strip while keeping traffic lights inset with proper spacing. This is the Electron-recommended approach for macOS apps that want a custom titlebar with native controls.

**Alternative considered:** Using `titleBarStyle: 'hidden'` on macOS. Rejected because `hiddenInset` gives better traffic light positioning (offset from window edge) and is the standard for macOS apps.

### Scope & Files

| File | Change |
|------|--------|
| `src/main/core/window-manager.ts` | Platform-aware titlebar config, remove `maximizable: false` (darwin only) |
| `src/main/core/window-manager.test.ts` | Update darwin assertions; non-darwin assertions for `titleBarOverlay` |
| `src/renderer/styles.css` | Add `.app-region-drag` / `.app-region-no-drag` utilities + `--traffic-light-clearance` CSS variable |
| `src/renderer/shell-chrome-react.tsx` | Add drag class to header, macOS left padding, Windows/Linux right padding, `no-drag` on inner children |
| `src/renderer/shell-chrome-react.test.tsx` | Assert `app-region-drag` class on `<header>` |
| `src/preload/index.ts` | Expose `process.platform` to renderer |
| `src/renderer/env.d.ts` | Add `electronPlatform: string` to global `Window` interface |

### Code Snippets

**`window-manager.ts` — platform config (replace lines ~24–31):**
```ts
// Platform-aware titlebar configuration
const platformTitlebarOptions: Electron.BrowserWindowConstructorOptions =
  process.platform === 'darwin'
    ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 13, y: 13 },
        backgroundColor: '#1a1a1f',
      }
    : {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#1a1a1f',
          symbolColor: '#f0f0f0',
          height: 40,
        },
        backgroundColor: '#1a1a1f',
      }
```

> Note: `maximizable: false` is removed — green button re-enabled. Non-darwin never had `maximizable: false`, so that branch is unchanged.

**`styles.css` — new utility classes + CSS variable (add after base layer):**
```css
/* Traffic-light clearance for macOS custom titlebar */
:root {
  --traffic-light-clearance: 78px;  /* 68px traffic lights + 10px breathing room */
  --titlebar-overlay-clearance: 140px; /* Windows min/max/close overlay width */
}

/* Electron window drag regions — applied to <header> for custom titlebar */
.app-region-drag {
  app-region: drag;
  -webkit-app-region: drag;
}

.app-region-no-drag {
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
```

**`shell-chrome-react.tsx` — header with drag region + platform padding:**
```tsx
const isDarwin = window.electronPlatform === 'darwin'

<header
  className={cn(
    'flex items-center justify-between border-b px-4 py-2 bg-card/50',
    'app-region-drag select-none',
    isDarwin ? 'pl-[var(--traffic-light-clearance)]' : 'pr-[var(--titlebar-overlay-clearance)]'
  )}
>
  {/* Logo + App name — no-drag to allow future interactive elements */}
  <div className="flex items-center gap-2 app-region-no-drag">
    {/* ... logo + name ... */}
  </div>

  {/* Recording state dot — no-drag for future interactivity */}
  <div className="flex items-center gap-1.5 app-region-no-drag" aria-live="polite" aria-atomic="true">
    {/* ... state dot ... */}
  </div>
</header>
```

> **Note:** `app-region-no-drag` is applied defensively to inner `<div>` children. The current header has no interactive elements, but this prevents silent breakage when any are added later. Non-interactive text/icons inside `no-drag` zones still behave correctly.

**`preload/index.ts` — expose platform:**
```ts
contextBridge.exposeInMainWorld('electronPlatform', process.platform)
```

**`env.d.ts` — type declaration:**
```ts
declare global {
  interface Window {
    speechToTextApi: IpcApi
    electronPlatform: string  // ← exposed via preload
  }
}
```

**`shell-chrome-react.test.tsx` — new assertion:**
```tsx
it('renders header with drag region class', () => {
  const { container } = render(<ShellChromeReact isRecording={false} />)
  const header = container.querySelector('header')
  expect(header?.className).toContain('app-region-drag')
})
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Custom titlebar matches dark OKLCH design | Drag region blocks pointer events — future interactive header elements need `no-drag` |
| Green maximize button restored | Cross-platform testing surface increases |
| Standard Electron pattern | DevTools may break drag region (Chromium bug, dev-only) |
| Windows/Linux get native overlay controls | CSS variables for padding add a small abstraction layer |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Traffic lights overlap header content | Medium | `--traffic-light-clearance: 78px` left padding on macOS; derived from 68px lights + 10px gap |
| Header children become unclickable | High | `app-region-no-drag` applied defensively to inner `<div>` children |
| Win/Linux users lose window controls | High | `titleBarOverlay` always set on non-darwin; tested per platform |
| Win/Linux overlay obscures right-side content | High | `--titlebar-overlay-clearance: 140px` right padding on non-darwin |
| Missing `env.d.ts` type causes TS error | Critical | `electronPlatform` added to `Window` interface in `env.d.ts` |
| E2E layout shift from padding | Low | Padding is modest; selectors are id-based not position-based |
| `maximizable: false` removal breaks tests | Low | Update darwin test assertions in same PR; non-darwin test unchanged |

### Tasks

- [ ] Read all scoped files fully (including `env.d.ts`)
- [ ] Expose `process.platform` via preload (`src/preload/index.ts`)
- [ ] Add `electronPlatform: string` to `Window` interface in `src/renderer/env.d.ts`
- [ ] Update `window-manager.ts` with platform-aware titlebar config
- [ ] Remove `maximizable: false` from darwin options (non-darwin never had it)
- [ ] Add `.app-region-drag` / `.app-region-no-drag` + CSS variables to `styles.css`
- [ ] Update `shell-chrome-react.tsx` — drag class, macOS left padding, Windows/Linux right padding, `no-drag` on children
- [ ] Update `window-manager.test.ts` — darwin assertions (titleBarStyle, trafficLightPosition) + non-darwin assertions (titleBarOverlay)
- [ ] Update `shell-chrome-react.test.tsx` — assert `app-region-drag` on header
- [ ] Run unit tests: `npm test`
- [ ] Manual smoke test: drag header, verify traffic lights, verify double-click behavior, verify Windows overlay clearance

### Gates

- [ ] `window-manager.test.ts` passes (darwin + non-darwin)
- [ ] `shell-chrome-react.test.tsx` passes
- [ ] Full test suite passes (`npm test`)
- [ ] macOS: native titlebar hidden, traffic lights visible and functional
- [ ] macOS: green button triggers fullscreen
- [ ] macOS: dragging header moves window
- [ ] macOS: header content does not overlap traffic lights
- [ ] Windows/Linux: native overlay controls visible
- [ ] Windows/Linux: header is draggable

---

## Ticket 3 — Radix Primitives Foundation (Issue #305, PR 1)

### Goal

Install Radix UI dependencies and create shared component wrappers in `src/renderer/components/ui/`. No behavioral changes — primitives are unused until T4–T6.

### Approach

**Strategy:** Follow the conventions established by the existing `select.tsx` wrapper:
- `forwardRef` pattern with `React.ElementRef` / `React.ComponentPropsWithoutRef`
- `data-slot` attribute on root elements for test targeting
- `cn()` utility for class merging (Tailwind-aware)
- `displayName` assignment on every exported component
- OKLCH design tokens from `styles.css`
- File header comments (where, what, why)

**Why create wrappers (not use Radix directly):** Wrappers centralize styling, ensure consistent OKLCH token usage, and allow global visual changes in one place. This is the established pattern in the codebase (`select.tsx` already does this).

**Reference:** `resources/artifacts-sample.zip` contains shadcn/ui-style wrappers. We adapt these to match our existing `select.tsx` conventions.

### Scope & Files

| File | Change |
|------|--------|
| `package.json` | Add 6 Radix dependencies |
| `src/renderer/components/ui/radio-group.tsx` | **NEW** — Radix RadioGroup + RadioGroupItem with circle indicator |
| `src/renderer/components/ui/switch.tsx` | **NEW** — Radix Switch with sliding thumb |
| `src/renderer/components/ui/label.tsx` | **NEW** — Radix Label with peer-disabled support |
| `src/renderer/components/ui/separator.tsx` | **NEW** — Radix Separator (horizontal/vertical) |
| `src/renderer/components/ui/tabs.tsx` | **NEW** — Radix Tabs, TabsList, TabsTrigger, TabsContent |
| `src/renderer/components/ui/checkbox.tsx` | **NEW** — Radix Checkbox with CheckIcon indicator (not consumed by T4–T6; included for completeness — the issue spec requires it) |

### Code Snippets

**Dependencies to install:**
```bash
npm install @radix-ui/react-checkbox @radix-ui/react-radio-group \
  @radix-ui/react-switch @radix-ui/react-label \
  @radix-ui/react-separator @radix-ui/react-tabs
```

**`radio-group.tsx` — example following `select.tsx` conventions:**
```tsx
// Where: src/renderer/components/ui/radio-group.tsx
// What:  Radix RadioGroup + RadioGroupItem with OKLCH-styled circle indicator.
// Why:   Replaces custom <input type="radio"> + dot pattern with accessible primitive.

import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import { cn } from '../../lib/utils'

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    data-slot="radio-group"
    className={cn('grid gap-3', className)}
    {...props}
  />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    data-slot="radio-group-item"
    className={cn(
      'aspect-square size-4 shrink-0 rounded-full border border-primary',
      'shadow-xs transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-2 fill-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
```

**`switch.tsx`:**
```tsx
// Where: src/renderer/components/ui/switch.tsx
// What:  Radix Switch with sliding thumb, styled with OKLCH tokens.
// Why:   Replaces custom <input type="checkbox"> + slider pattern.

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    data-slot="switch"
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center',
      'rounded-full border-2 border-transparent shadow-xs transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        'pointer-events-none block size-4 rounded-full bg-background shadow-lg',
        'ring-0 transition-transform',
        'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
```

**Other wrappers** (`label.tsx`, `separator.tsx`, `tabs.tsx`, `checkbox.tsx`) follow the same pattern. Each is ~30–60 LOC.

### Trade-offs

| Pro | Con |
|-----|-----|
| Zero behavioral changes — safe foundation PR | 6 new dependencies added to bundle |
| Establishes consistent wrapper conventions | Files unused until T4–T6 (dead code temporarily) |
| Accessible by default (Radix handles ARIA) | Team must learn Radix API surface |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle size increase from 6 Radix packages | Low | Radix packages are small (<5KB each gzipped); tree-shakeable |
| Wrapper styles don't match existing visuals | Medium | Match OKLCH tokens exactly; visual compare before merging |
| Breaking `select.tsx` conventions | Low | Code review against existing wrapper; enforce same patterns |

### Tasks

- [ ] Read existing `select.tsx` wrapper to confirm conventions
- [ ] Install 6 Radix dependencies
- [ ] Create `radio-group.tsx` following `select.tsx` conventions
- [ ] Create `switch.tsx`
- [ ] Create `label.tsx`
- [ ] Create `separator.tsx`
- [ ] Create `tabs.tsx`
- [ ] Create `checkbox.tsx`
- [ ] Verify TypeScript compilation passes (`npx tsc --noEmit`)
- [ ] Run full test suite: `npm test`

### Gates

- [ ] All 6 wrapper files created with correct conventions (`forwardRef`, `data-slot`, `cn()`, `displayName`)
- [ ] TypeScript compilation passes
- [ ] Full test suite passes (no regressions from new deps)
- [ ] No wrapper file exceeds 100 LOC

---

## Ticket 4 — Output Settings: RadioGroup + Switch (Issue #305, PR 2)

### Goal

Replace custom radio buttons and toggle switches in `settings-output-react.tsx` with Radix `RadioGroup` / `RadioGroupItem` and `Switch` primitives.

### Approach

**Strategy:** Swap native `<input type="radio">` + custom dot markup with `RadioGroup` + `RadioGroupItem`. Swap native `<input type="checkbox">` + custom slider markup with `Switch`. Wire the same `onChange` callbacks to Radix's `onValueChange` / `onCheckedChange` APIs.

**Why not a gradual swap:** The file only has 4 controls total (2 radios, 2 checkboxes). Replacing all at once in a single file keeps the diff coherent and avoids a mixed-control state.

**Current controls (from `settings-output-react.tsx`):**
- Lines 53–83: Card `<label>` wrapping `<input type="radio">` (transcript) + custom circle dot indicator
- Lines 84–114: Card `<label>` wrapping `<input type="radio">` (transformed) + custom circle dot indicator
- Lines 117–152: Card `<label>` wrapping `<input type="checkbox">` (copy) + custom toggle slider
- Lines 153–188: Card `<label>` wrapping `<input type="checkbox">` (paste) + custom toggle slider

**Important:** Each control is wrapped in a styled card `<label>` with conditional `border-primary/50 bg-primary/5` active state, `data-output-source-card` / `data-output-destination-card` attributes, and descriptive subtitle text. The card UI pattern **must be preserved** — only the hidden input + custom indicator markup gets swapped for Radix primitives.

**Callback wiring:** The internal `applySelection()` function (line 41) takes `(selection, { copyToClipboard, pasteAtCursor })`. Radix's `onValueChange`/`onCheckedChange` pass primitives (string/boolean), so callbacks are wired through `applySelection` with the correct shape.

### Scope & Files

| File | Change |
|------|--------|
| `src/renderer/settings-output-react.tsx` | Replace 2 `<input type="radio">` + custom dots → `RadioGroupItem` inside existing card `<label>`, replace 2 `<input type="checkbox">` + custom sliders → `Switch` inside existing card `<label>`, remove `ChangeEvent` import |
| `src/renderer/settings-output-react.test.tsx` | Update selectors (radio: `[role="radio"]`, switch: `[role="switch"]`), add `vi.mock` shims for Radix if needed |

### Code Snippets

**Before — radio card (lines ~53–83):**
```tsx
<label
  className={cn(
    'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
    selectedTextSource === 'transcript'
      ? 'border-primary/50 bg-primary/5'
      : 'border-border bg-card hover:bg-accent'
  )}
  data-output-source-card="transcript"
>
  <input type="radio" ... className="sr-only" ... />
  <div className="flex items-center gap-2">
    <span className="size-4 rounded-full border-2 ...">  {/* custom dot */}
      {selectedTextSource === 'transcript' && <span className="size-2 rounded-full bg-primary" />}
    </span>
    <span className="text-xs text-foreground">Raw dictation</span>
  </div>
</label>
```

**After — Radix RadioGroup wrapping card labels (preserving card UI):**
```tsx
<RadioGroup
  value={selectedTextSource}
  onValueChange={(value: string) => {
    const source = value as OutputTextSource
    applySelection(source, { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
  }}
>
  {/* Card layout preserved — only the hidden input + custom dot is replaced */}
  <label
    className={cn(
      'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
      selectedTextSource === 'transcript'
        ? 'border-primary/50 bg-primary/5'
        : 'border-border bg-card hover:bg-accent'
    )}
    data-output-source-card="transcript"
    htmlFor="settings-output-text-transcript"
  >
    <div className="flex items-center gap-2">
      <RadioGroupItem value="transcript" id="settings-output-text-transcript" />
      <span className="text-xs text-foreground">Raw dictation</span>
    </div>
  </label>

  <label
    className={cn(/* ... same card styling for 'transformed' ... */)}
    data-output-source-card="transformed"
    htmlFor="settings-output-text-transformed"
  >
    <div className="flex items-center gap-2">
      <RadioGroupItem value="transformed" id="settings-output-text-transformed" />
      <span className="text-xs text-foreground">Transformed text</span>
    </div>
  </label>
</RadioGroup>
```

**Before — toggle switch card (lines ~117–152):**
```tsx
<label
  className={cn('mt-3 flex items-center justify-between rounded-lg border p-3 ...', ...)}
  data-output-destination-card="copy"
>
  <input type="checkbox" id="settings-output-copy" className="sr-only" ... />
  <div className="flex flex-col">
    <span className="text-xs text-foreground">Copy to clipboard</span>
    <span className="text-[10px] text-muted-foreground">Keep output ready for paste</span>
  </div>
  <span className="relative inline-flex h-5 w-9 ..."> {/* custom slider */} </span>
</label>
```

**After — Radix Switch inside card (preserving card + subtitle):**
```tsx
<label
  className={cn(
    'mt-3 flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
    copyChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
  )}
  data-output-destination-card="copy"
  htmlFor="settings-output-copy"
>
  <div className="flex flex-col">
    <span className="text-xs text-foreground">Copy to clipboard</span>
    <span className="text-[10px] text-muted-foreground">Keep output ready for paste</span>
  </div>
  <Switch
    id="settings-output-copy"
    checked={copyChecked}
    onCheckedChange={(checked: boolean) => {
      applySelection(selectedTextSource, { copyToClipboard: checked, pasteAtCursor: pasteChecked })
    }}
  />
</label>
```

> **Key:** The card `<label>`, `data-output-*` attributes, conditional active styling, subtitle text, and `justify-between` layout are all preserved. Only the `<input>` + custom indicator is swapped for the Radix primitive.

**Test update — new selectors:**
```tsx
// Radio: query by role instead of input type
const transcriptRadio = host.querySelector('[role="radio"][value="transcript"]')

// Switch: query by role
const copySwitch = host.querySelector('[role="switch"]#settings-output-copy')
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Full ARIA support (keyboard + screen reader) | Test selectors change (`[role="radio"]` vs `input[type="radio"]`) |
| Removes custom dot + slider markup (~40 LOC) | Radix `onValueChange` (string) / `onCheckedChange` (boolean) differ from native `onChange` (event) |
| Card UI pattern fully preserved | Must verify visual parity (RadioGroupItem dot size, Switch track color match existing design) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Card-level active state styling lost | High | Card `<label>` wrapper with conditional `border-primary/50 bg-primary/5` is preserved in code snippets above — not part of Radix swap |
| Callback wiring error (`applySelection` signature) | High | Wire through `applySelection(source, { copyToClipboard, pasteAtCursor })` exactly as current code does; snippets above show correct wiring |
| Visual regression (dot/toggle sizing) | Medium | Match OKLCH tokens in RadioGroupItem/Switch wrapper; visual compare before merge |
| Tests break from DOM structure change | Medium | Update selectors to `[role=...]`; keep same ID attributes and `data-output-*` attributes |
| `vi.mock` needed for Radix portals in jsdom | Low | Same pattern used for `Select` in existing tests |

### Tasks

- [ ] Read `settings-output-react.tsx` and `settings-output-react.test.tsx` fully
- [ ] Wrap radio `<fieldset>` content with `RadioGroup`, wire `onValueChange` through `applySelection`
- [ ] Replace 2× `<input type="radio">` + custom dot → `RadioGroupItem` inside existing card `<label>`
- [ ] Replace 2× `<input type="checkbox">` + custom slider → `Switch` inside existing card `<label>`
- [ ] Preserve all card wrappers, `data-output-*` attributes, subtitle text, and conditional active styling
- [ ] Remove `ChangeEvent` import (only used for checkbox `onChange` — no longer needed after Switch migration)
- [ ] Update test selectors to `[role="radio"]` and `[role="switch"]`
- [ ] Add `vi.mock` shims for Radix components if portal rendering fails in jsdom
- [ ] Run unit tests: `npx vitest run src/renderer/settings-output-react.test.tsx`
- [ ] Run full test suite: `npm test`

### Gates

- [ ] `grep -n 'type="radio"\|type="checkbox"' src/renderer/settings-output-react.tsx` → **0 hits**
- [ ] `settings-output-react.test.tsx` passes
- [ ] Full test suite passes
- [ ] Visual parity with current design (same look, better a11y)

---

## Ticket 5 — Tabs + Separator (Issue #305, PR 3)

### Goal

Replace the custom `TabButton` component and native `<hr>` elements in `app-shell-react.tsx` with Radix `Tabs` + `Separator` primitives.

### Approach

**Strategy:** Replace custom `TabButton` (lines 158–188) with Radix `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`. Replace 2× `<hr>` (lines 415, 436) with Radix `Separator`. Use `forceMount` on `TabsContent` to preserve current behavior (all panels stay mounted — required for persistent state in settings forms).

**Why `forceMount`:** The current implementation renders all tab panels simultaneously and uses CSS to show/hide them. This preserves form state when switching tabs. Radix `TabsContent` unmounts by default, so `forceMount` is needed to keep existing behavior.

**Current state:**
- Lines 158–188: Custom `TabButton` component — `<button>` with `aria-pressed`, `border-b-2` active indicator
- Lines 415, 436: `<hr className="my-4 border-border" />`
- 6 tab buttons rendered in a sidebar `<nav>` (lines ~333–378)

### Scope & Files

| File | Change |
|------|--------|
| `src/renderer/app-shell-react.tsx` | Remove `TabButton`, replace with Radix `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`; replace 2× `<hr>` → `Separator` |
| `src/renderer/app-shell-react.test.tsx` | Update selectors (`[role="tab"]`, `[role="tabpanel"]`, `[data-slot="separator"]`); verify `forceMount` behavior |

### Code Snippets

**Before — TabButton (lines ~158–188):**
```tsx
const TabButton = ({ tab, activeTab, icon: Icon, label, onNavigate }: {...}) => {
  const isActive = tab === activeTab
  return (
    <button
      type="button"
      data-route-tab={tab}
      aria-pressed={isActive ? 'true' : 'false'}
      className={cn(/* active/inactive styling */)}
      onClick={() => onNavigate(tab)}
    >
      <Icon className="size-4" /> {label}
    </button>
  )
}
```

**After — Radix Tabs wrapping the sidebar:**
```tsx
<Tabs value={activeTab} onValueChange={(value) => onNavigate(value as TabRoute)}>
  <TabsList className="flex flex-col gap-1">
    <TabsTrigger value="profiles" data-route-tab="profiles">
      <LayoutGrid className="size-4" /> Profiles
    </TabsTrigger>
    {/* ... other triggers ... */}
  </TabsList>

  <TabsContent value="profiles" forceMount className={activeTab !== 'profiles' ? 'hidden' : ''}>
    {/* ... panel content ... */}
  </TabsContent>
  {/* ... other panels ... */}
</Tabs>
```

**Before — hr (lines ~415, 436):**
```tsx
<hr className="my-4 border-border" />
```

**After — Separator:**
```tsx
<Separator className="my-4" />
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Proper `role="tab"` / `role="tabpanel"` semantics | `forceMount` + CSS `hidden` is slightly awkward |
| Keyboard navigation (arrow keys between tabs) built-in | Largest single-file diff in the migration |
| Removes custom `TabButton` (~30 LOC) | Need to verify sidebar layout compatibility with Radix `TabsList` |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `forceMount` behavior differs from current show/hide | High | Test that form state persists across tab switches |
| Sidebar layout breaks (Radix TabsList defaults to horizontal) | Medium | Override with `flex-col` in `TabsList` className |
| Merge conflict with T2 (`styles.css` changes) | Medium | T2 merges first; T5 rebases on top |
| Custom `data-route-tab` attribute lost | Low | Keep as additional attribute on `TabsTrigger` for E2E selectors |

### Tasks

- [ ] Read `app-shell-react.tsx` and `app-shell-react.test.tsx` fully
- [ ] Remove custom `TabButton` component
- [ ] Wrap sidebar + panels with Radix `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`
- [ ] Add `forceMount` to all `TabsContent` panels; use CSS `hidden` for inactive
- [ ] Replace 2× `<hr>` with `Separator`
- [ ] Update test selectors to `[role="tab"]`, `[role="tabpanel"]`, `[data-slot="separator"]`
- [ ] Verify form state persists across tab switches in tests
- [ ] Run unit tests: `npx vitest run src/renderer/app-shell-react.test.ts`
- [ ] Run full test suite: `npm test`

### Gates

- [ ] `grep -n 'TabButton\|<hr ' src/renderer/app-shell-react.tsx` → **0 hits**
- [ ] `app-shell-react.test.tsx` passes
- [ ] Full test suite passes
- [ ] Keyboard navigation (arrow keys) works between tabs
- [ ] Form state persists when switching tabs

---

## Ticket 6 — Profiles Panel: Select (Issue #305, PR 4)

### Goal

Replace the remaining 2 native `<select>` elements in `profiles-panel-react.tsx` with the existing Radix `Select` wrapper (from PR #308).

### Approach

**Strategy:** Reuse the existing `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` / `SelectValue` components from `src/renderer/components/ui/select.tsx`. No new primitives needed — this is a pure consumption PR.

**Current state (from `profiles-panel-react.tsx`):**
- Line 209–216: Provider `<select>` — read-only (`disabled`), always shows "google"
- Line 222–231: Model `<select>` — interactive, uses `onChange` with `ChangeEvent<HTMLSelectElement>`

### Scope & Files

| File | Change |
|------|--------|
| `src/renderer/profiles-panel-react.tsx` | Replace 2× `<select>` → Radix `Select`; the `ChangeEvent` import stays (still used by `<input>` and `<textarea>`) — only the `ChangeEvent<HTMLSelectElement>` usage at line 225 is removed |
| `src/renderer/profiles-panel-react.test.tsx` | Update selectors (`[role="combobox"]` for trigger, `[role="option"]` for items); **significant rework** of style regression guard test (lines ~519–547) which asserts `className` on `HTMLSelectElement` — must switch to asserting `data-slot="select-trigger"` on Radix trigger |

### Code Snippets

**Before — provider select (lines ~209–216):**
```tsx
<select
  id="profile-edit-provider"
  value="google"
  disabled
  className="w-full h-7 rounded-md border border-input bg-input/30 px-2 text-xs disabled:opacity-60"
>
  <option value="google">google</option>
</select>
```

**After — Radix Select (disabled):**
```tsx
<Select value="google" disabled>
  <SelectTrigger id="profile-edit-provider" className="w-full h-7 text-xs">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="google">google</SelectItem>
  </SelectContent>
</Select>
```

**Before — model select (lines ~222–231):**
```tsx
<select
  id="profile-edit-model"
  value={draft.model}
  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
    onChangeDraft({ model: e.target.value as TransformationPreset['model'] })
  }}
  className="..."
>
  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
</select>
```

**After — Radix Select (interactive):**
```tsx
<Select
  value={draft.model}
  onValueChange={(value) => onChangeDraft({ model: value as TransformationPreset['model'] })}
>
  <SelectTrigger id="profile-edit-model" className="w-full h-7 text-xs">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
  </SelectContent>
</Select>
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Consistent `Select` usage across entire app | Portal rendering may need `vi.mock` in tests |
| Reuses existing wrapper (zero new code) | `onValueChange` signature change (string vs event) |
| Better a11y (ARIA combobox pattern) | Disabled select visual may differ slightly |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Radix portal not rendering in jsdom tests | Medium | `vi.mock` shim pattern already established in other Select tests |
| Style regression guard test (lines ~519–547) needs rewrite | Medium | Switch assertions from `HTMLSelectElement.className` to `[data-slot="select-trigger"]` attribute checks |
| Disabled select visual mismatch | Low | Existing `Select` wrapper handles `disabled:opacity-50`; adjust if needed |
| `ChangeEvent` import wrongly removed | Low | `ChangeEvent` is still used for `HTMLInputElement` (line 192) and `HTMLTextAreaElement` (line 246) — only the `HTMLSelectElement` usage is removed |

### Tasks

- [ ] Read `profiles-panel-react.tsx` and `profiles-panel-react.test.tsx` fully
- [ ] Replace provider `<select>` (disabled) → Radix `Select`
- [ ] Replace model `<select>` (interactive) → Radix `Select` with `onValueChange`
- [ ] Keep `ChangeEvent` import (still used by `<input>` and `<textarea>`)
- [ ] Update test selectors to `[role="combobox"]` and `[role="option"]`
- [ ] Rework style regression guard test (lines ~519–547): replace `HTMLSelectElement` class assertions with `data-slot="select-trigger"` checks
- [ ] Add `vi.mock` shim for Radix Select portal if needed
- [ ] Run unit tests: `npx vitest run src/renderer/profiles-panel-react.test.tsx`
- [ ] Run full test suite: `npm test`

### Gates

- [ ] `grep -rn '<select\b' src/renderer/ --include='*.tsx' | grep -v test | grep -v components/ui` → **0 hits**
- [ ] `profiles-panel-react.test.tsx` passes
- [ ] Full test suite passes
- [ ] Visual parity with current design

---

## Dependency Graph

```
T1 (Picker frameless #310)  ──────────────────────────────►  merge
T2 (Custom titlebar #309)   ──────────────────────────────►  merge
T3 (Radix foundation #305)  ──►  T4 (RadioGroup+Switch)  ──►  merge
                             ──►  T6 (Profiles Select)    ──►  merge
                     T3 ──►  T5 (Tabs+Separator)          ──►  merge
```

**Parallel tracks:**
- **Track A:** T1 → merge (independent)
- **Track B:** T2 → merge (independent)
- **Track C:** T3 → T4 → merge (T4 depends on T3)
- **Track C':** T3 → T6 → merge (T6 depends on T3, parallel with T4)
- **Track D:** T3 → T5 → merge (T5 depends on T3)

**Hard dependencies:** T4, T5, T6 all require T3 (foundation wrappers). T1 and T2 are fully independent.

**Soft dependency (recommended):** Merge T2 before T5. They touch different files (`styles.css` vs `app-shell-react.tsx`) so there is no technical conflict, but T2 establishes the header layout, and T5 rewrites tabs in the same visual area. Merging T2 first ensures stable visual context. If the team wants to parallelize, T5 can proceed independently.

---

## Files NOT in Scope

These files were reviewed and confirmed to need **no changes** for any ticket:

- `src/main/main.ts` — no window creation changes needed at this level
- `src/renderer/lib/utils.ts` — `cn()` utility already exists, no changes needed

---

## Appendix A: Sub-Agent Review Summary — Round 1 (T1 + T2)

A Plan sub-agent reviewed T1 and T2 against the actual source code. Key findings addressed:

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | `PickerBrowserWindowOptions` interface missing `backgroundColor` field | Critical | Added interface update to T1 scope |
| 2 | `env.d.ts` missing from T2 scope (TS compilation failure) | Critical | Added to T2 scope table + code snippet |
| 3 | Windows/Linux right padding not addressed (overlay obscures content) | Major | Added `--titlebar-overlay-clearance` CSS var + conditional right padding |
| 4 | `app-region-no-drag` not applied to header children | Major | Applied defensively to inner `<div>` children |
| 5 | `useContentSize` behavior with `frame: false` hand-waved | Minor | Added explicit explanation confirming no-op behavior |
| 6 | 78px magic number violates project conventions | Minor | Extracted to `--traffic-light-clearance` CSS variable |
| 7 | `shell-chrome-react.test.tsx` assertions were vague | Minor | Added concrete test snippet |

**Verdict:** Approved with changes (all applied).

---

## Appendix B: Sub-Agent Review Summary — Round 2 (T3–T6)

A Plan sub-agent reviewed the full 6-ticket plan, focusing on T3–T6. Key findings addressed:

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | T4 "After" snippets discarded card UI pattern (card `<label>`, active styling, subtitle text) | Major | Rewrote snippets to preserve card wrappers, `data-output-*` attributes, conditional styling; only `<input>` + custom indicator swapped |
| 2 | T4 callback wiring referenced non-existent props (`onChangeCopyToClipboard`) | Major | Fixed to wire through `applySelection(source, { copyToClipboard, pasteAtCursor })` correctly |
| 3 | T6 style regression guard test (lines ~519–547) needs significant rewrite, not just selector change | Major | Added explicit note + task for reworking `HTMLSelectElement` class assertions to `data-slot="select-trigger"` checks |
| 4 | T6 `ChangeEvent` removal wording ambiguous — import still needed for `<input>` and `<textarea>` | Major | Clarified that only `ChangeEvent<HTMLSelectElement>` usage is removed; import stays |
| 5 | T5→T2 hard dependency is overstated (different files) | Minor | Softened to "recommended ordering"; T5 can proceed independently if needed |
| 6 | T3 `checkbox.tsx` has no consumer in T4–T6 | Minor | Added note: included per issue spec; not consumed by current scope |
| 7 | T4/T6 test command had `.test.ts` typo (should be `.test.tsx`) | Minor | Fixed |

**Verdict:** Approved with changes (all applied).
