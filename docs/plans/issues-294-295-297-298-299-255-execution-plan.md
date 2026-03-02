<!--
Where: docs/plans/issues-294-295-297-298-299-255-execution-plan.md
What: Execution plan for issues #294, #295, #297, #298, #299, #255 — one ticket per PR.
Why: Provide a step-by-step, risk-aware, code-grounded implementation path with explicit
     approaches, scope files, trade-offs, snippets, and gates for each ticket.
Revision: v3 — marks #294, #297, #298 as shipped (PRs #301–#303 merged to main);
          updates implementation notes to match actual code; trims to remaining tickets.
-->

# Execution Plan: #294, #297, #298, #295, #255, #299

## Status Overview

| # | Issue | Title | State |
|---|-------|-------|-------|
| 1 | #294 | Remove left-panel helper text | ✅ Shipped — PR #301 |
| 2 | #297 | Fixed 50-character API key mask | ✅ Shipped — PR #302 |
| 3 | #298 | Shortcuts row alignment | ✅ Shipped — PR #303 |
| 4 | #295 | macOS chrome: disable maximize + black titlebar | 🔲 Pending |
| 5 | #255 | Select component strategy decision (gate) | 🔲 Pending — gates #299 |
| 6 | #299 | Introduce Radix UI and remove legacy styling | 🔲 Pending — blocked on #255 |

---

## Shipped Tickets (reference)

### #294 — Remove left-panel helper text (PR #301)

**What was done:**
- `home-react.tsx`: idle state `<span>` narrowed — "Click to record" removed; only shows the blocked
  reason when `recordingBlocked !== null`, returns `null` for unblocked-idle:
  ```tsx
  ) : recordingBlocked ? (
    <span className="text-sm text-muted-foreground">
      {recordingBlocked.reason.split('.')[0]}
    </span>
  ) : null}
  ```
- `settings-recording-react.tsx`: "Recording is enabled in v1…" helper paragraph removed.
- Tests updated in `home-react.test.tsx` and `settings-recording-react.test.tsx`.

---

### #297 — Fixed 50-character API key mask (PR #302)

**What was done:**
- New module `src/renderer/api-key-mask.ts`:
  ```ts
  export const FIXED_API_KEY_MASK = '*'.repeat(50)
  ```
- Both `settings-api-keys-react.tsx` and `settings-stt-provider-form-react.tsx` import and use
  `FIXED_API_KEY_MASK` in place of the former 8-bullet string.
- Both forms also gained **autosave on blur** (saves key when focus leaves the input if a draft
  is present), removing the explicit Save button from `settings-stt-provider-form-react.tsx`.
- Tests updated in both component test files and `api-key-mask.test.ts` added.

---

### #298 — Shortcuts UI: horizontal row alignment (PR #303)

**What was done:**
- `settings-shortcut-editor-react.tsx`: row wrapper changed to CSS Grid with responsive column:
  ```tsx
  <div className="grid grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] items-center gap-3 text-xs">
  ```
  Uses `minmax(14rem, 20rem)` for the label column (shrinks/grows within bounds) and
  `minmax(0,1fr)` for the input, ensuring correct flex-grow without overflow.
- Tests updated in `settings-shortcut-editor-react.test.tsx`.

---

## Pending Tickets

### Priority order for remaining work

| # | Issue | Priority | Rationale |
|---|-------|----------|-----------|
| 1 | #295 | P1 | Self-contained main-process change, no renderer scope |
| 2 | #255 | P2 gate | Doc-only, but must merge before any #299 code |
| 3 | #299 | P3 | Widest scope, blocked on #255 |

---

## Ticket #295 — macOS chrome: disable maximize + black titlebar

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/295

### Goal
Disable the macOS zoom/maximize button and reduce the white flash before renderer paint by matching
`backgroundColor` to the app background. Keep native traffic-light controls. Do not introduce a
custom frameless title bar.

### Approach

**Verify Electron API via context7** before coding (current Electron version: 38.0.0).

**`maximizable: false`** — disables the green zoom button on macOS (grays it out, non-interactive).
This is the Electron-supported API for this purpose.

**`backgroundColor: '#1a1a1f'`** — sets the window content area background before the renderer
paints. Matches the app's `--background` token (`oklch(0.13 0.005 260)` ≈ `#1a1a1f`). Reduces
white flash on window show.

**Known limitation:** `backgroundColor` does NOT change the native macOS title-bar strip color
(the system chrome bar where traffic lights sit). That bar renders in the OS-native style regardless.
Achieving a truly unified black surface requires `titleBarStyle: 'hiddenInset'` plus renderer-side
`-webkit-app-region: drag` CSS — which is explicitly out of scope per the issue ("no custom
frameless title-bar"). This limitation must be documented in the PR.

**Platform guard:** Apply options only on `darwin` to leave Windows/Linux unchanged.

**Test platform note:** CI runs on Linux. `process.platform` is the real host OS in Vitest — the
`darwin` branch will never execute without an explicit stub. Use `Object.defineProperty` to stub
`process.platform` in the darwin-specific test cases.

### Scope Files
| File | Change |
|------|--------|
| `src/main/core/window-manager.ts` | Add `macosOptions` conditional with `maximizable` and `backgroundColor` |
| `src/main/core/window-manager.test.ts` | Add darwin/non-darwin tests with `process.platform` stub |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **`maximizable: false` + `backgroundColor` only (chosen)** | Minimal, zero renderer scope, stays within issue scope | Title-bar strip remains system gray on macOS — not fully black |
| `titleBarStyle: 'hiddenInset'` + renderer drag region | True unified black surface | Adds renderer scope, drag-area misconfiguration risk |
| `titleBarStyle: 'customButtonsOnHover'` | Hides traffic lights until hover | Violates "keep red/yellow visible" |

### Code Snippet

**`window-manager.ts` — Before:**
```ts
this.mainWindow = new BrowserWindow({
  width: 1120,
  height: 760,
  show: true,
  webPreferences: { ... }
})
```

**After:**
```ts
// macOS: disable zoom button + set dark background to avoid white flash.
// backgroundColor matches --background token (oklch(0.13 0.005 260) ≈ #1a1a1f).
// NOTE: does NOT change the native title-bar strip color (system chrome).
// A fully unified black bar requires titleBarStyle:'hiddenInset' (out of scope here).
const macosOptions = process.platform === 'darwin'
  ? { maximizable: false, backgroundColor: '#1a1a1f' }
  : {}

this.mainWindow = new BrowserWindow({
  width: 1120,
  height: 760,
  show: true,
  ...macosOptions,
  webPreferences: { ... }
})
```

**`window-manager.test.ts` — darwin stub pattern:**
```ts
describe('createMainWindow — darwin', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
  })
  it('sets maximizable:false and backgroundColor on macOS', () => {
    manager.createMainWindow()
    const opts = MockBrowserWindow.mock.calls[0][0]
    expect(opts.maximizable).toBe(false)
    expect(opts.backgroundColor).toBe('#1a1a1f')
  })
})
describe('createMainWindow — non-darwin', () => {
  it('does not set macOS options on linux', () => {
    manager.createMainWindow()
    const opts = MockBrowserWindow.mock.calls[0][0]
    expect(opts.maximizable).toBeUndefined()
  })
})
```

### Checklist
- [ ] Electron `maximizable` and `backgroundColor` docs verified via context7 for v38.
- [ ] `maximizable: false` + `backgroundColor: '#1a1a1f'` applied on `darwin` only.
- [ ] `titleBarStyle` not set (native traffic lights preserved).
- [ ] `window-manager.test.ts`: darwin test stubs `process.platform`; both darwin + non-darwin cases pass.
- [ ] `pnpm typecheck` clean.
- [ ] PR body: Electron version, macOS version tested, titlebar limitation documented, follow-up noted.

### Tasks
1. Verify Electron BrowserWindow options via context7.
2. Read `window-manager.ts` and `window-manager.test.ts` fully.
3. Add `macosOptions` conditional in `createMainWindow()`.
4. Add darwin/non-darwin test cases with `process.platform` stub.
5. Run `pnpm test --filter window-manager && pnpm typecheck`.
6. Create PR with rollback note and platform limitation documented.

### Gates
- `window-manager.test.ts` passes including platform-conditional cases.
- `pnpm typecheck` clean.
- macOS manual: green button grayed out; red/yellow functional; no white flash on show.
- Non-macOS: no behavioral change.

---

## Ticket #255 — Select component strategy decision (gate for #299)

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/255

### Goal
Produce a merged decision record that definitively chooses the select component strategy and makes
#299 unambiguous to implement.

### Approach
**First:** read existing decision docs to avoid duplication or contradiction:
- `docs/decisions/shadcn-ui-setup.md` — may already commit to Radix/shadcn Select.
- `docs/decisions/stt-provider-unified-form.md` — may touch select decisions.

If those docs already establish Option B (Radix Select), update them rather than creating a new
document. Otherwise create `docs/decisions/select-component-strategy.md`.

**Chosen option:** Option B — add `@radix-ui/react-select` and build a shared primitive at
`src/renderer/components/ui/select.tsx`.

**Key points to record:**
- Migration scope: `settings-stt-provider-form-react.tsx` (provider + model) and
  `settings-recording-react.tsx` (method, sample rate, device + duplicate STT provider/model selects).
- Out of scope: profile picker, non-select controls.
- E2E impact: Radix replaces `<select id="…">` with `<button>` + portal `<div>` — E2E selectors
  must migrate to `data-testid` before DOM changes land.
- Bundle: ~15–20 KB gzipped; acceptable for Electron desktop.
- Accessibility: Radix implements ARIA Listbox; keyboard nav (Up/Down, Home/End) included.
- License: MIT ✓.

### Scope Files
| File | Change |
|------|--------|
| `docs/decisions/select-component-strategy.md` (or existing) | Create or update |

### Checklist
- [ ] Existing decision docs read before writing.
- [ ] Chosen option (B), rationale, scope, non-goals explicit.
- [ ] E2E selector migration plan included.
- [ ] Dependency governance noted (license, `pnpm audit`).
- [ ] Merged before #299 starts.

### Tasks
1. Read `docs/decisions/shadcn-ui-setup.md` and `stt-provider-unified-form.md`.
2. Create or update decision doc with all key points above.
3. Get maintainer approval; merge.

### Gates
- Doc is explicit, actionable, non-ambiguous; no code changes.
- Approved by maintainer before #299 begins.

---

## Ticket #299 — Introduce Radix UI and remove legacy styling

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/299

**Prerequisite:** #255 merged.

### Goal
Replace native `<select>` controls in the settings panel with a shared Radix `<Select>` primitive
styled to app design tokens. Remove `SELECT_CLS`/`SELECT_MONO_CLS` constants from migrated files.

### Approach — Three phases, one PR

**Phase 0: Preflight**
- `pnpm add @radix-ui/react-select`; `pnpm audit`; note bundle delta.
- Create `src/renderer/components/ui/select.tsx` (shared primitive — see snippet).
- Commit separately; verify `pnpm typecheck` passes before any migration.

**Phase A: Migrate `settings-stt-provider-form-react.tsx`** (2 selects: provider + model)
- Replace with shared `<Select>`; remove `SELECT_CLS`/`SELECT_MONO_CLS`.
- Update `settings-stt-provider-form-react.test.tsx`.
- **Gate:** `grep -n "SELECT_CLS" src/renderer/settings-stt-provider-form-react.tsx` = 0 results.

**Phase B: Migrate `settings-recording-react.tsx`** (5 selects: method, sample rate, device, STT
provider, STT model — the last two are duplicated in this file)
- Replace all 5; remove `SELECT_CLS`/`SELECT_MONO_CLS`.
- Update `settings-recording-react.test.tsx`.
- **Gate:** `grep -n "SELECT_CLS" src/renderer/settings-recording-react.tsx` = 0 results.

**Phase C: Cleanup**
- `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` must return 0.
- Full renderer test suite + `pnpm typecheck`.

### Scope Files
| File | Change |
|------|--------|
| `package.json` | Add `@radix-ui/react-select` |
| `src/renderer/components/ui/select.tsx` | New — shared Radix Select primitive |
| `src/renderer/settings-stt-provider-form-react.tsx` | Phase A: 2 selects, remove SELECT_CLS |
| `src/renderer/settings-recording-react.tsx` | Phase B: 5 selects, remove SELECT_CLS |
| `src/renderer/settings-stt-provider-form-react.test.tsx` | Phase A: update selectors |
| `src/renderer/settings-recording-react.test.tsx` | Phase B: update selectors |

### Trade-offs
| Aspect | Risk | Mitigation |
|--------|------|------------|
| E2E selector churn | Radix replaces `<select id>` with `<button>` + portal | Pre-migrate to `data-testid`; keep `id` on `SelectTrigger` during transition |
| Popover off-screen | 760px window height — trigger near bottom may clip | Test lower-panel selects; use `position="item-aligned"` if clipping occurs |
| Bundle size | +~15–20 KB gzipped | Document in PR; acceptable for Electron |
| Over-scope | Temptation to clean unrelated styles | Only remove `SELECT_CLS`/`SELECT_MONO_CLS` |

### Shared Primitive Snippet (`src/renderer/components/ui/select.tsx`)

```tsx
/*
 * Where: src/renderer/components/ui/select.tsx
 * What: Shared Radix UI Select primitive styled to app design tokens.
 * Why: Issue #299 — replaces native <select> for cross-platform item styling.
 *      Follows shadcn-ui-setup.md convention for components/ui/ primitives.
 */
import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      'w-full h-8 rounded-md border border-input bg-input/30 hover:bg-input/50',
      'px-2 text-xs flex items-center justify-between gap-2',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-3 opacity-50 shrink-0" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      data-slot="select-content"
      className={cn(
        'relative z-50 min-w-[8rem] overflow-hidden rounded-md',
        'border border-border bg-popover text-popover-foreground shadow-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 text-muted-foreground">
        <ChevronUp className="size-3" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1 text-muted-foreground">
        <ChevronDown className="size-3" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm',
      'py-1.5 pl-2 pr-8 text-xs outline-none',
      'focus:bg-accent focus:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem }
```

### Checklist
- [ ] #255 merged before starting.
- [ ] `@radix-ui/react-select` added; `pnpm audit` clean; license (MIT) noted.
- [ ] `src/renderer/components/ui/select.tsx` created with `React.forwardRef` + `ComponentPropsWithoutRef` types.
- [ ] Phase A done; `grep -n "SELECT_CLS" settings-stt-provider-form-react.tsx` = 0.
- [ ] Phase B done; `grep -n "SELECT_CLS" settings-recording-react.tsx` = 0.
- [ ] Phase C: `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` = 0.
- [ ] Popover off-screen check at 760px window height.
- [ ] Full renderer tests pass; `pnpm typecheck` clean.
- [ ] Bundle delta in PR body.

### Tasks
1. Confirm #255 merged.
2. Fetch Radix Select docs via context7; verify API.
3. `pnpm add @radix-ui/react-select`; `pnpm audit`; record bundle delta.
4. **Phase 0:** Create `src/renderer/components/ui/select.tsx`; `pnpm typecheck`.
5. **Phase A:** Migrate `settings-stt-provider-form-react.tsx` (2 selects); update tests; phase gate grep.
6. **Phase B:** Migrate `settings-recording-react.tsx` (5 selects); update tests; phase gate grep.
7. **Phase C:** Final grep; full test suite; `pnpm typecheck`.
8. Test in Electron dev: all selects open/close; keyboard nav works; no viewport clipping.
9. PR: bundle delta, E2E strategy, rollback path.

### Gates
- All renderer tests pass; `pnpm typecheck` clean.
- `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` = 0.
- Keyboard nav (Up/Down, Home/End) works in all migrated selects in Electron dev.
- PR body includes dependency governance entry and bundle delta.

---

## Execution Sequence

```
✅ #294 (PR #301) → ✅ #297 (PR #302) → ✅ #298 (PR #303)
   → 🔲 #295 → 🔲 #255 → 🔲 #299
```

Branches:
```
wt switch --base main --create issue-295-macos-maximize-titlebar --yes
wt switch --base main --create issue-255-select-decision --yes
wt switch --base main --create issue-299-radix-select-migration --yes
```
