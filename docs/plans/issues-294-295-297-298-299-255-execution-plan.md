<!--
Where: docs/plans/issues-294-295-297-298-299-255-execution-plan.md
What: Execution plan for issues #294, #295, #297, #298, #299, #255 — one ticket per PR.
Why: Provide a step-by-step, risk-aware, code-grounded implementation path with explicit
     approaches, scope files, trade-offs, snippets, and gates for each ticket.
Revision: v2 — addresses sub-agent critique: closed issue reconciliation, scope gaps,
          macOS titlebar limitation, grid column width fix, process.platform mocking,
          TypeScript types in snippets, and per-phase grep gates.
-->

# Execution Plan: #294, #297, #298, #295, #255, #299

## Priority Order

| # | Issue | Title | Priority | GitHub State |
|---|-------|-------|----------|--------------|
| 1 | #294 | Remove left-panel helper text | P1 — trivial cleanup, zero logic risk | CLOSED (code not updated — see Pre-implementation Note) |
| 2 | #297 | Fixed 50-character API key mask | P1 — security UX, 2-file change | CLOSED (code not updated — see Pre-implementation Note) |
| 3 | #298 | Shortcuts row alignment | P2 — layout-only change | CLOSED (code not updated — see Pre-implementation Note) |
| 4 | #295 | macOS chrome: disable maximize + black titlebar | P2 — main process, macOS-specific | OPEN |
| 5 | #255 | Select component strategy decision (gate) | P3 — doc gate, unblocks #299 | OPEN |
| 6 | #299 | Introduce Radix UI and remove legacy styling | P3 — largest scope, blocked on #255 | OPEN |

**Priority rationale:**
- #294 and #297 are pure mechanical changes with near-zero regression surface — highest ROI.
- #298 is a layout-only refactor that stays within one component.
- #295 is isolated to main-process window config, but requires macOS verification.
- #255 is a doc-only PR that gates #299; must merge before any Radix code.
- #299 is the widest scope change and touches the most test selectors; goes last.

## Pre-implementation Note: Closed Issues With Unimplemented Code

Issues #294, #297, and #298 are **CLOSED on GitHub**, but inspection of the source files confirms that none of their intended code changes have been applied:

| Issue | Expected change | Current state |
|-------|----------------|---------------|
| #294 | "Click to record" removed from `home-react.tsx` | Text still at line 199 |
| #297 | 50-char mask in both API key forms | Still `'••••••••'` (8 bullets) at `settings-api-keys-react.tsx:53` and `settings-stt-provider-form-react.tsx:133` |
| #298 | Horizontal row in shortcut editor | Still `flex flex-col gap-1.5` at `settings-shortcut-editor-react.tsx:255` |

**Required action before starting these tickets:** Run `gh issue view <N> --comments` for each to find the closing rationale. If issues were closed without a code fix, re-open them or create linked follow-up issues. Document the reason in the PR body for each ticket. Do not implement against closed issues silently.

## Global Workflow Rules
- One ticket = one PR = one branch (`wt switch --base main --create <branch> --yes`).
- Do not start ticket N+1 until ticket N PR is merged.
- Read all affected files fully before any edit.
- Verify external APIs (Electron docs, Radix docs) via context7 before coding.
- Run `pnpm typecheck` and targeted tests before pushing.
- Attach before/after visual artifacts for UI tickets.
- Include rollback note and tested-on environment in every PR body.
- Run sub-agent + other coding agent review, then address findings before merge.

---

## Ticket #294 — Remove left-panel helper text

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/294

### Goal
Remove two instructional text strings from the left panel (and related settings panel) without leaving residual whitespace or spacing regressions.

### Approach
**String 1: "Click to record"** lives in `home-react.tsx` at line 199 inside the idle-state branch of the state-label ternary. The idle `<span>` shows either the blocked reason or the fallback string. The blocked-reason banner above the button (lines 117–133) already shows the full reason + nextStep + link — the idle label below the button is redundant. Remove the entire idle `<span>` (the false branch of `isProcessing ? ... : <span>`) by replacing it with `null`.

**String 2: "Recording is enabled in v1..."** is NOT absent from the codebase as initially assumed. It appears twice in `settings-recording-react.tsx` (at approximately lines 88 and 137 — exact lines confirmed via code search). Remove both occurrences and any wrapping elements that would leave blank space.

No other affected files were identified by search. Both target elements are UI-only with no logic consequences.

### Scope Files
| File | Change |
|------|--------|
| `src/renderer/home-react.tsx` | Replace idle-state `<span>` (line ~199) with `null` |
| `src/renderer/settings-recording-react.tsx` | Remove "Recording is enabled in v1…" text and wrappers |
| `src/renderer/home-react.test.tsx` | Remove/update assertions for "Click to record" text |
| `src/renderer/settings-recording-react.test.tsx` | Remove/update assertions for removed text |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **Remove entire idle span (chosen)** | Clean, no orphan whitespace; reason already shown in banner | Slightly less text feedback in unblocked-idle state |
| Keep span, hide "Click to record" | No layout change | Keeps dead render path for unblocked idle |
| Replace with `sr-only` span | Preserves a11y hint | Adds complexity not required by the issue |

### Code Snippet — Before / After

**`home-react.tsx` ~line 197 — Before:**
```tsx
) : (
  <span className="text-sm text-muted-foreground">
    {recordingBlocked ? recordingBlocked.reason.split('.')[0] : 'Click to record'}
  </span>
)}
```

**After:**
```tsx
) : null}
```

> The blocked-reason is already shown in the banner above the button (lines 117–133 of `home-react.tsx`).

### Checklist
- [ ] "Click to record" string is absent from rendered DOM.
- [ ] "Recording is enabled in v1…" strings absent from `settings-recording-react.tsx`.
- [ ] Blocked state: reason still shown via banner above the button.
- [ ] No unexpected blank gap in the idle left panel (`gap-4` flexbox adjusts naturally).
- [ ] `home-react.test.tsx` passes with updated assertions.
- [ ] `settings-recording-react.test.tsx` passes with updated assertions.

### Tasks
1. Run `gh issue view 294 --comments` to confirm closing rationale; document in PR body.
2. Read `home-react.tsx` fully; remove the idle-state `<span>` (lines 197–201).
3. Search for "Recording is enabled" in codebase; locate exact lines in `settings-recording-react.tsx`; remove both occurrences and any wrapping elements.
4. Read `home-react.test.tsx`; update assertions.
5. Read `settings-recording-react.test.tsx`; update assertions.
6. Run `pnpm test --filter home-react && pnpm test --filter settings-recording-react`.
7. Run `pnpm typecheck`.

### Gates
- `home-react.test.tsx` passes.
- `settings-recording-react.test.tsx` passes.
- `pnpm typecheck` clean.
- Manual: idle panel shows button, waveform, no text below button.

---

## Ticket #297 — Fixed 50-character API key mask

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/297

### Goal
Replace all variable-length masked API key displays with a fixed 50-asterisk string so the real key length cannot be inferred from the UI.

### Approach
Two components render masked API key values using the current pattern `'••••••••'` (8 U+2022 BULLET characters):
- `settings-api-keys-react.tsx` line 53 (Google key)
- `settings-stt-provider-form-react.tsx` line 133 (STT provider key)

The fix replaces both with a 50-character asterisk string `'*'.repeat(50)`.

**Character-set note:** The issue spec says use `*` (U+002A ASTERISK), not `•` (U+2022 BULLET). This is an intentional character change. Tests that currently assert `expect(input.value).toBe('••••••••')` must change to `expect(input.value).toBe('*'.repeat(50))`. Both inputs use `type="password"`, so browsers render the value as password-style bullet characters regardless of the underlying value — the security benefit is that the underlying value length (50) no longer leaks the real key length (which was inferable from the 8-dot mask).

**Constant placement:** `lib/utils.ts` is a single-purpose file that exports only `cn()` (Tailwind class merger). Per AGENTS.md, modules should be single-purpose. Adding `API_KEY_MASK` there mixes concerns. Instead, define `API_KEY_MASK` as a module-level constant at the top of each component file. This approach is simple, avoids a new file for a one-liner, and keeps each file self-contained. If more files need it in the future, extract at that point.

### Scope Files
| File | Change |
|------|--------|
| `src/renderer/settings-api-keys-react.tsx` | Replace `'••••••••'` with `API_KEY_MASK` constant (defined at top of file) |
| `src/renderer/settings-stt-provider-form-react.tsx` | Same as above |
| `src/renderer/settings-api-keys-react.test.tsx` | Update mask value assertions (from 8 bullets to 50 asterisks) |
| `src/renderer/settings-stt-provider-form-react.test.tsx` | Same as above |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **Module-level constant per file (chosen)** | AGENTS.md single-purpose compliance; self-contained | Two definitions (DRY tradeoff) |
| Shared in `lib/utils.ts` | Single source of truth | Violates `utils.ts` single-purpose contract |
| Shared `api-key-mask.ts` module | Explicit encapsulation, DRY | New file for a one-liner is over-engineering at current scope |

### Code Snippet — Before / After

**`settings-api-keys-react.tsx` — Before:**
```tsx
value={isSavedRedacted ? '••••••••' : value}
```

**After:**
```tsx
// 50-character fixed mask prevents real key length inference regardless of actual key length.
// Uses '*' (U+002A) per issue #297 spec. Browser renders type="password" as bullets visually.
const API_KEY_MASK = '*'.repeat(50)

// ... (in JSX):
value={isSavedRedacted ? API_KEY_MASK : value}
```

**`settings-stt-provider-form-react.tsx` — Same pattern.**

**Test assertions — Before:**
```ts
expect(input.value).toBe('••••••••')
```
**After:**
```ts
expect(input.value).toBe('*'.repeat(50))
// or:
expect(input.value).toHaveLength(50)
expect(input.value).toBe('*'.repeat(50))
```

### Checklist
- [ ] Run `gh issue view 297 --comments` to confirm closing rationale.
- [ ] `API_KEY_MASK = '*'.repeat(50)` defined at top of `settings-api-keys-react.tsx`.
- [ ] Same constant defined at top of `settings-stt-provider-form-react.tsx`.
- [ ] All test assertions updated from 8-bullet to 50-asterisk.
- [ ] `grep -r '••••••••' src/renderer/` returns zero hits.
- [ ] `pnpm typecheck` clean.

### Tasks
1. Run `gh issue view 297 --comments`; document in PR body.
2. Add `API_KEY_MASK` constant to `settings-api-keys-react.tsx` (module level, before component).
3. Replace mask string in the `value={}` prop.
4. Repeat for `settings-stt-provider-form-react.tsx`.
5. Read `settings-api-keys-react.test.tsx`; update all mask assertions.
6. Read `settings-stt-provider-form-react.test.tsx`; update all mask assertions.
7. Run `grep -r '••••••••' src/renderer/` to confirm zero remaining occurrences.
8. Run `pnpm test --filter settings-api-keys && pnpm test --filter settings-stt-provider-form`.
9. Run `pnpm typecheck`.

### Gates
- Both component test suites pass.
- `pnpm typecheck` clean.
- `grep -r '••••••••' src/renderer/` = no results.
- Manual: masked display renders 50 bullets (browser renders `type="password"` value as bullets).

---

## Ticket #298 — Shortcuts UI: horizontal row alignment

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/298

### Goal
Display the Shortcut Title label and Keybind Input on one horizontal row (left label, right input) while preserving all capture/validation behavior.

### Approach
The current layout (`flex flex-col gap-1.5`) stacks label above input. The fix changes the inner wrapper to a CSS Grid layout, which ensures all 6 rows' labels and inputs align to consistent columns regardless of label length.

**Column width decision:** The longest label is "Change default transformation shortcut" (~38 chars). At Inter `text-xs` (12px), this renders at approximately 225–240px. Use `grid-cols-[14rem_1fr]` (224px) to safely contain the label. Do not use `12rem` (192px) as it would clip on the longest label.

**`shrink-0` removed:** In a CSS Grid context, `shrink-0` (a flexbox property) has no effect. The column width constraint handles label containment. No need to add it to the `<span>`.

**Overflow handling:** Labels should not overflow their grid column. Add `overflow-hidden text-ellipsis whitespace-nowrap` to the `<span>` as a safety net. At 14rem, wrapping is extremely unlikely for any of the 6 current labels, but the truncation style prevents layout breakage if labels are ever changed.

### Scope Files
| File | Change |
|------|--------|
| `src/renderer/settings-shortcut-editor-react.tsx` | Change row wrapper from `flex flex-col gap-1.5` to `grid grid-cols-[14rem_1fr]` |
| `src/renderer/settings-shortcut-editor-react.test.tsx` | Update layout class assertions |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **CSS Grid `grid-cols-[14rem_1fr]` (chosen)** | All 6 rows' labels align in the same column; fits longest label comfortably | Fixed column width: labels wider than 14rem would need adjustment |
| Flex row `flex-row items-center` | Simple | Label lengths vary → inputs misalign across rows |
| Table layout | Perfect column alignment | Semantic mismatch; not idiomatic in React/Tailwind |

### Code Snippet — Before / After

**Before** (`settings-shortcut-editor-react.tsx` ~lines 253–290):
```tsx
<div className="space-y-3" ref={containerRef}>
  {SHORTCUT_FIELDS.map((field) => (
    <div className="space-y-1.5" key={field.key}>
      <div className="flex flex-col gap-1.5 text-xs">
        <span id={`${field.inputId}-label`}>{field.label}</span>
        <input
          id={field.inputId}
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          ...
        />
      </div>
      {/* capture hint */}
      {/* error paragraph */}
    </div>
  ))}
</div>
```

**After:**
```tsx
<div className="space-y-3" ref={containerRef}>
  {SHORTCUT_FIELDS.map((field) => (
    <div className="space-y-1.5" key={field.key}>
      {/* Grid: fixed 14rem label column + flex-grow input column */}
      <div className="grid grid-cols-[14rem_1fr] items-center gap-3 text-xs">
        <span
          id={`${field.inputId}-label`}
          className="overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {field.label}
        </span>
        <input
          id={field.inputId}
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          ...
        />
      </div>
      {/* Capture hint and error remain outside the grid row */}
      {capturingKey === field.key && (
        <p className="text-[10px] text-primary" data-shortcut-capture-hint={field.key}>
          Recording... press a key combination with at least one modifier.
        </p>
      )}
      <p className="min-h-4 text-[10px] text-destructive" id={field.errorId}>
        {captureErrors[field.key] || validationErrors[field.key] || ''}
      </p>
    </div>
  ))}
</div>
```

### Checklist
- [ ] Run `gh issue view 298 --comments` to confirm closing rationale.
- [ ] Label and input appear side-by-side (grid row) for all 6 shortcuts.
- [ ] Column is `14rem` (224px) — fits "Change default transformation shortcut" at text-xs.
- [ ] No truncation visible for any current label at 1024px+ window width.
- [ ] Tab/focus order unchanged (DOM order label → input is preserved; grid does not reorder).
- [ ] Shortcut capture behavior unchanged (click, Enter/Space, Escape still work).
- [ ] Error and capture-hint paragraphs still appear below the grid row.
- [ ] `settings-shortcut-editor-react.test.tsx` passes.

### Tasks
1. Run `gh issue view 298 --comments`; document in PR body.
2. Read `settings-shortcut-editor-react.tsx` fully (confirmed done above).
3. Read `settings-shortcut-editor-react.test.tsx` to identify class/structure assertions.
4. Change `flex flex-col gap-1.5` to `grid grid-cols-[14rem_1fr] items-center gap-3` in the inner wrapper div.
5. Add `overflow-hidden text-ellipsis whitespace-nowrap` to the label `<span>`.
6. Do NOT add `shrink-0` (no-op in CSS Grid).
7. Keep all `aria-*`, `data-shortcut-capturing`, capture behavior, `onKeyDown`, `onClick` unchanged.
8. Update test assertions that check the old flex-col class.
9. Run `pnpm test --filter settings-shortcut-editor`.
10. Run `pnpm typecheck`.

### Gates
- `settings-shortcut-editor-react.test.tsx` passes.
- `pnpm typecheck` clean.
- Manual visual: 6 rows have labels flush-left and inputs aligned in the same right column at 1024px.
- Manual: keyboard capture (Enter starts, Escape cancels) unaffected.

---

## Ticket #295 — macOS chrome: disable maximize + black titlebar

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/295

### Goal
Disable the macOS zoom/maximize button and visually unify the title bar with the app's solid black background. Keep native traffic-light controls. Do not introduce a custom frameless title bar.

### Approach

**Electron API verification (must do before coding):** Fetch current Electron docs via context7 to confirm supported options for the current Electron version (38.0.0).

**Disabling maximize:** `maximizable: false` on `BrowserWindow` grays out the green zoom button on macOS and makes it non-interactive. This is the supported Electron API for this purpose.

**Title bar color — Critical Limitation:** `backgroundColor` on `BrowserWindow` sets the **window content area** background color (the flash visible before the renderer paints). On macOS with `titleBarStyle: 'default'` (no value set = default native), the **title bar strip** (where traffic lights live) renders in the macOS system chrome color (gray/dark depending on OS appearance setting) and **cannot be changed via `backgroundColor`**. Setting `backgroundColor: '#1a1a1f'` will NOT make the title bar black — the titlebar strip color is controlled by the OS.

**Option to achieve a truly unified black surface:** Use `titleBarStyle: 'hiddenInset'` which keeps native traffic lights but hides the native title bar strip, allowing web content to extend under the traffic lights. This requires:
1. `titleBarStyle: 'hiddenInset'` on BrowserWindow
2. `trafficLightPosition: { x: 12, y: 12 }` to position traffic lights
3. In renderer (`app-shell-react.tsx`): top area must have `-webkit-app-region: drag` CSS so the user can drag the window
4. Renderer top padding (`pt-7` or similar) to prevent content from rendering under traffic lights

This is renderer scope that the issue explicitly says to avoid ("No custom frameless title-bar implementation is introduced"). The issue also notes it "intentionally targets the supported native approach."

**Recommended approach for this ticket:**
- Implement `maximizable: false` (unambiguously within scope).
- Implement `backgroundColor: '#1a1a1f'` (reduces white flash on load — a real improvement even if titlebar chrome remains system gray).
- Document the titlebar color limitation explicitly in both the code comment and the PR body.
- Leave `titleBarStyle` as default (omitted = native). The unified black titlebar requires a follow-up issue that intentionally scopes in renderer changes.

**Platform guard:** All macOS-specific options are applied conditionally via `process.platform === 'darwin'` to avoid affecting Windows/Linux behavior.

**Test note:** The CI environment runs on Linux (`OS Version: Linux 6.12.54-linuxkit`). In Vitest, `process.platform` reflects the actual host OS — the darwin conditional branch will never execute in CI without explicit mocking. The test must stub `process.platform` using `vi.stubGlobal` (or equivalent) for the darwin assertion to run.

### Scope Files
| File | Change |
|------|--------|
| `src/main/core/window-manager.ts` | Add platform-conditional `maximizable: false` and `backgroundColor` |
| `src/main/core/window-manager.test.ts` | Add platform-conditional test with `process.platform` stubbed to `'darwin'` |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **`maximizable: false` + `backgroundColor` (chosen)** | Minimal, no renderer scope, stays within issue's stated "native approach" | Titlebar strip remains system chrome color (not black) — partial implementation |
| `titleBarStyle: 'hiddenInset'` + renderer drag region | Achieves true unified black surface | Adds renderer scope, risk of drag-area misconfiguration affecting window management |
| `titleBarStyle: 'customButtonsOnHover'` | Hides traffic lights until hover | Violates "keep red/yellow visible" requirement |

### Code Snippet — Before / After

**Before** (`window-manager.ts`):
```ts
this.mainWindow = new BrowserWindow({
  width: 1120,
  height: 760,
  show: true,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
})
```

**After:**
```ts
// macOS-specific chrome options.
// maximizable: false — disables the green zoom/maximize button (grays it out).
// backgroundColor: matches --background OKLCH(0.13 0.005 260) ≈ #1a1a1f.
//   NOTE: This affects the window content flash before renderer paint.
//   It does NOT change the native macOS title bar strip color (system chrome).
//   A fully black title bar requires titleBarStyle:'hiddenInset' + renderer drag region
//   (follow-up scope, explicitly out of this issue per issue #295 notes).
const macosOptions = process.platform === 'darwin'
  ? { maximizable: false, backgroundColor: '#1a1a1f' }
  : {}

this.mainWindow = new BrowserWindow({
  width: 1120,
  height: 760,
  show: true,
  ...macosOptions,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
})
```

**Test stub for darwin (window-manager.test.ts):**
```ts
describe('createMainWindow on darwin', () => {
  let originalPlatform: string

  beforeEach(() => {
    originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true })
  })

  it('sets maximizable: false and backgroundColor on macOS', () => {
    const window = manager.createMainWindow()
    const constructorCall = MockBrowserWindow.mock.calls[0][0]
    expect(constructorCall.maximizable).toBe(false)
    expect(constructorCall.backgroundColor).toBe('#1a1a1f')
  })
})

describe('createMainWindow on non-darwin', () => {
  it('does not set macOS-specific options on linux', () => {
    // process.platform is already linux in CI — no stub needed
    const window = manager.createMainWindow()
    const constructorCall = MockBrowserWindow.mock.calls[0][0]
    expect(constructorCall.maximizable).toBeUndefined()
  })
})
```

### Checklist
- [ ] Electron BrowserWindow docs verified via context7 for v38+ `maximizable` and `backgroundColor` behavior.
- [ ] `maximizable: false` applied only on `darwin`.
- [ ] `backgroundColor: '#1a1a1f'` applied only on `darwin`.
- [ ] `titleBarStyle` NOT set (keeps fully native traffic lights).
- [ ] `window-manager.test.ts` stubs `process.platform` to `'darwin'` for the darwin-specific assertions.
- [ ] Non-darwin test confirms no macOS options are applied on Linux/Windows.
- [ ] `pnpm typecheck` clean.
- [ ] PR body: documents Electron version tested, macOS version tested, known titlebar limitation.
- [ ] PR body: notes that a fully unified black titlebar requires a follow-up issue.

### Tasks
1. Verify Electron BrowserWindow `maximizable` and `backgroundColor` options via context7 docs.
2. Read `window-manager.ts` and `window-manager.test.ts` fully.
3. Add `macosOptions` conditional block to `createMainWindow()`.
4. Update `window-manager.test.ts`:
   - Add darwin-platform test using `Object.defineProperty(process, 'platform', ...)`.
   - Add non-darwin test asserting no macOS options.
5. Run `pnpm test --filter window-manager`.
6. Run `pnpm typecheck`.
7. Write PR body with: Electron version, macOS test env, titlebar limitation note, follow-up scope note.

### Gates
- `window-manager.test.ts` passes, including the platform-conditional assertions.
- `pnpm typecheck` clean.
- On macOS (manual): green zoom button is grayed out and non-interactive; red/yellow still functional.
- On macOS (manual): window content area flash on show is dark (not white).
- On non-macOS: no behavioral change.

---

## Ticket #255 — Select component strategy decision (gate for #299)

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/255

### Goal
Produce a merged, authoritative decision record for the select component strategy. This PR gates #299 — #299 implementation must not start until this doc is merged.

### Approach
**First step:** Read existing decision docs before creating a new one to avoid contradictions:
- `docs/decisions/shadcn-ui-setup.md` — may already establish Radix/shadcn Select as the direction.
- `docs/decisions/stt-provider-unified-form.md` — may touch select component decisions.

If existing docs already commit to Option B (Radix Select), this ticket updates those docs to add the explicit migration scope and E2E plan, rather than creating a net-new document.

If no prior select-specific decision exists, create `docs/decisions/select-component-strategy.md`.

Either way, the output is: a clear, merged document that makes #299 unambiguous to implement.

**Chosen option:** Option B from issue #255 — add `@radix-ui/react-select` and build a shared primitive. Rationale: native `<select><option>` cannot theme popup/item colors cross-platform; Radix provides ARIA Listbox semantics, keyboard nav, and focus management out of the box; Electron desktop bundle overhead is negligible.

**Key decisions to document:**
- Scope of migration: `settings-stt-provider-form-react.tsx` (provider + model selects) and `settings-recording-react.tsx` (method, sample rate, device selects — plus STT provider/model selects duplicated in this file).
- Out of scope: non-select controls, profile picker, any custom listbox outside the settings panel.
- Shared primitive location: `src/renderer/components/ui/select.tsx` (following shadcn-ui-setup convention).
- E2E selector migration: Radix replaces `<select id="…">` with `<button>` + portal `<div>`. E2E selectors must migrate from native select IDs to `data-testid` attributes before DOM changes land.
- Bundle impact: ~15–20KB gzipped. Acceptable for Electron desktop.
- Accessibility: ARIA Listbox pattern; keyboard nav (Up/Down, Home/End, type-ahead) included in Radix.

### Scope Files
| File | Change |
|------|--------|
| `docs/decisions/select-component-strategy.md` (or existing file) | Create or update with explicit decision record |

### Trade-offs
| Option | Pro | Con |
|--------|-----|-----|
| **Option B: Radix Select (chosen)** | Full theme control, accessible, keyboard nav OOTB | Dependency addition, DOM structure change breaks E2E selectors |
| Option A: Keep native | Zero dependency delta | Cannot style popup/item colors cross-platform |
| Option C: Custom listbox | Full control | High engineering/a11y risk, maintenance burden |

### Checklist
- [ ] Read `docs/decisions/shadcn-ui-setup.md` and `stt-provider-unified-form.md` before creating new doc.
- [ ] Decision doc is explicit on chosen option (B), rationale, scope, non-goals.
- [ ] E2E selector migration strategy documented.
- [ ] Dependency governance: MIT license confirmed, `pnpm audit` noted.
- [ ] `docs/decisions/select-component-strategy.md` (or updated existing doc) merged before #299 starts.

### Tasks
1. Read `docs/decisions/shadcn-ui-setup.md`.
2. Read `docs/decisions/stt-provider-unified-form.md`.
3. Determine: create new `select-component-strategy.md` or update existing doc.
4. Write/update decision doc with all key decisions listed in Approach section above.
5. PR review: get explicit maintainer confirmation that Option B is final decision.
6. Merge before starting #299.

### Gates
- Doc is explicit, actionable, non-ambiguous.
- No code changes in this PR.
- PR approved by maintainer before #299 begins.
- Does not contradict existing decision docs (or supersedes them with an explicit note).

---

## Ticket #299 — Introduce Radix UI and remove legacy styling

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/299

**Prerequisite:** Ticket #255 must be merged before this ticket starts.

### Goal
Replace all native `<select>` controls (in the settings panel) with a shared Radix-based `<Select>` primitive styled to match app design tokens. Remove the `SELECT_CLS`/`SELECT_MONO_CLS` constants and legacy native select markup from migrated files.

### Approach
Three phases within a single PR (small, reviewable commits):

**Phase 0: Preflight**
- `pnpm add @radix-ui/react-select`.
- `pnpm audit` — confirm no security advisories.
- Create `src/renderer/components/ui/` directory.
- Create `src/renderer/components/ui/select.tsx` (shared primitive, see snippet below).
- No component migrations in this phase — just the primitive. Commit separately.

**Phase A: Migrate `settings-stt-provider-form-react.tsx`**
- Replace 2 native `<select>` elements (provider + model) with `<Select>` from shared primitive.
- Remove `SELECT_CLS` / `SELECT_MONO_CLS` from this file.
- Update `settings-stt-provider-form-react.test.tsx` selectors.
- **Phase A gate:** `grep -n "SELECT_CLS" src/renderer/settings-stt-provider-form-react.tsx` = zero hits before moving to Phase B.

**Phase B: Migrate `settings-recording-react.tsx`**
- This file contains: recording method select, sample rate select, device select, **plus** duplicate STT provider select and model select (these are in the same file). All 5 must be migrated.
- Remove `SELECT_CLS` / `SELECT_MONO_CLS` from this file.
- Update `settings-recording-react.test.tsx` selectors.
- **Phase B gate:** `grep -n "SELECT_CLS" src/renderer/settings-recording-react.tsx` = zero hits before Phase C.

**Phase C: Cleanup**
- Confirm `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` = zero hits.
- Run full renderer test suite.
- Run `pnpm typecheck`.

### Scope Files
| File | Change |
|------|--------|
| `package.json` | Add `@radix-ui/react-select` |
| `src/renderer/components/ui/select.tsx` | **New file** — shared Radix Select primitive |
| `src/renderer/settings-stt-provider-form-react.tsx` | Phase A: replace 2 selects, remove SELECT_CLS |
| `src/renderer/settings-recording-react.tsx` | Phase B: replace 5 selects, remove SELECT_CLS |
| `src/renderer/settings-stt-provider-form-react.test.tsx` | Phase A: update selectors |
| `src/renderer/settings-recording-react.test.tsx` | Phase B: update selectors |

### Trade-offs
| Aspect | Risk | Mitigation |
|--------|------|------------|
| E2E selector churn | Radix replaces `<select id="…">` with `<button>` + portal | Pre-migrate test selectors to `data-testid` before DOM changes; keep `id` on `SelectTrigger` for backward compat |
| Radix portal in Electron | Portal appends to `document.body`; Electron with `contextIsolation: true` is fine | Confirm in Electron dev mode |
| Popover off-screen at bottom of window | At 760px window height, a select near the panel bottom may render outside viewport | Verify with a select in the lower half of settings; use `position="item-aligned"` if popper clips |
| Bundle size | +~15–20KB gzipped | Document in PR; acceptable for Electron |
| Over-scoped cleanup | Temptation to clean unrelated styles | Only remove `SELECT_CLS`/`SELECT_MONO_CLS` — no other style changes |

### Code Snippet — Shared Primitive (`src/renderer/components/ui/select.tsx`)

```tsx
/*
 * Where: src/renderer/components/ui/select.tsx
 * What: Shared Radix UI Select primitive, styled to app design tokens.
 * Why: Issue #299 — replace native <select> controls for cross-platform item styling.
 *      Follows shadcn-ui-setup.md convention for components/ui/ primitives.
 */

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

// data-slot attributes allow external CSS targeting without class coupling.
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
      'w-full h-8 rounded-md border border-input bg-input/30',
      'hover:bg-input/50 px-2 text-xs',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'transition-colors flex items-center justify-between gap-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
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
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 text-muted-foreground">
        <ChevronUp className="size-3" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1">
        {children}
      </SelectPrimitive.Viewport>
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
      'relative flex w-full cursor-default select-none items-center',
      'rounded-sm py-1.5 pl-2 pr-8 text-xs outline-none',
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

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem
}
```

**Usage in `settings-stt-provider-form-react.tsx` (Phase A):**
```tsx
// Before:
<select id="settings-transcription-provider" className={SELECT_CLS} value={selectedProvider}
  onChange={(e) => { /* ... */ }}>
  {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
</select>

// After:
<Select
  value={selectedProvider}
  onValueChange={(val) => {
    const provider = val as Settings['transcription']['provider']
    // same dispatch logic as onChange above
  }}
>
  <SelectTrigger id="settings-transcription-provider" data-testid="select-transcription-provider">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {sttProviderOptions.map(opt => (
      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

> Note: Keep `id` on `SelectTrigger` for backward-compatible E2E selectors during transition. Add `data-testid` for new-style selectors. After all E2E tests are migrated, the `id` can be removed in a follow-up.

### Checklist
- [ ] #255 doc is merged before starting this ticket.
- [ ] `@radix-ui/react-select` added; `pnpm audit` clean; MIT license noted.
- [ ] `src/renderer/components/ui/select.tsx` created with correct TypeScript types (`React.forwardRef` + `React.ComponentPropsWithoutRef`).
- [ ] Phase A: STT provider + model selects migrated; tests pass; `grep -n "SELECT_CLS" settings-stt-provider-form-react.tsx` = 0.
- [ ] Phase B: All 5 selects in `settings-recording-react.tsx` migrated; tests pass; `grep -n "SELECT_CLS" settings-recording-react.tsx` = 0.
- [ ] Phase C: `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` = 0.
- [ ] Popover verified: SelectContent does not clip off-screen when trigger is in lower half of 760px window.
- [ ] Full renderer test suite passes.
- [ ] `pnpm typecheck` clean.
- [ ] Bundle delta documented in PR body.

### Tasks
1. Confirm #255 is merged. Stop if not.
2. Fetch Radix Select API docs via context7; verify `Root`, `Trigger`, `Content`, `Item`, `Value` APIs.
3. `pnpm add @radix-ui/react-select`; run `pnpm audit`; note bundle delta.
4. **Phase 0:** Create `src/renderer/components/ui/select.tsx`. Verify `pnpm typecheck` passes.
5. **Phase A:** Migrate `settings-stt-provider-form-react.tsx` (2 selects). Update test file. Run `pnpm test --filter settings-stt-provider-form`. Confirm `grep -n "SELECT_CLS" settings-stt-provider-form-react.tsx` = 0.
6. **Phase B:** Migrate `settings-recording-react.tsx` (all 5 selects including STT provider/model duplicates). Update test file. Run `pnpm test --filter settings-recording-react`. Confirm `grep -n "SELECT_CLS" settings-recording-react.tsx` = 0.
7. **Phase C:** Run `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/`. Must return 0 results.
8. Run `pnpm test` (full suite). Fix any failures.
9. Run `pnpm typecheck`.
10. Manually test in Electron dev: open Settings → confirm all selects open/close, keyboard nav works, items are styled correctly. Test a select near the bottom of the panel (verify no off-screen clip; if clipping occurs, add `position="item-aligned"` to `SelectContent`).
11. Write PR body with bundle delta, Electron compat note, E2E strategy, rollback path.

### Gates
- All renderer tests pass.
- `pnpm typecheck` clean.
- `grep -rn "SELECT_CLS\|SELECT_MONO_CLS" src/renderer/` = 0 results.
- Radix select popovers open/close in Electron dev mode without z-index or viewport issues.
- Keyboard navigation (Up/Down, Home/End) works in all migrated selects.
- PR body includes dependency governance entry and bundle delta.

---

## Execution Sequence (Step-by-step)

```
1. Ticket #294  → PR → merge
2. Ticket #297  → PR → merge
3. Ticket #298  → PR → merge
4. Ticket #295  → PR → merge
5. Ticket #255  → PR → merge  ← gate: #299 blocked until this lands
6. Ticket #299  → PR → merge
```

Branching convention:
```
wt switch --base main --create issue-294-remove-helper-text --yes
wt switch --base main --create issue-297-fixed-api-key-mask --yes
wt switch --base main --create issue-298-shortcuts-row-layout --yes
wt switch --base main --create issue-295-macos-maximize-titlebar --yes
wt switch --base main --create issue-255-select-decision --yes
wt switch --base main --create issue-299-radix-select-migration --yes
```

## Review Criteria Summary

| Criterion | #294 | #297 | #298 | #295 | #255 | #299 |
|-----------|------|------|------|------|------|------|
| Granularity | 2 files, line deletions | 2 components + constant | 1 component, layout change | 1 class, platform-gated | Docs only | Phased: 0→A→B→C, 5 selects |
| Priority | P1 | P1 | P2 | P2 | P3 gate | P3 |
| Feasibility | High | High | High | Medium (macOS only, CI mocking needed) | High | Medium |
| Potential risk | Spacing regression; missed "Recording is enabled" text | Wrong character type in tests | Label width at narrow viewports | macOS version variance; titlebar limitation | Contradicting existing docs | E2E selector churn; portal z-index; type mismatch in snippets |
| Mitigation | Read settings-recording-react.tsx; grep for string | Explicit character-set note; 7 named test assertions | Use 14rem column; overflow-hidden truncation safety | `process.platform` stub in tests; document limitation | Read existing decision docs first | TypeScript forwardRef types; phase-gate greps; off-screen popover check |
