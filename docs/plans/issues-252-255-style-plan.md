# Execution Plan: Issues #252, #255 — Style Tickets

Where: `docs/plans/issues-252-255-style-plan.md`
What: Step-by-step delivery plan for the two remaining open UI style issues.
Why: Issues #249, #267, #268 are closed. These two style tickets are now unblocked.

---

## Context & Constraints

- One issue maps to one PR.
- Priority is by user-facing impact and implementation risk.
- No new runtime dependencies unless strictly necessary; AGENTS.md rule.
- No backward-compat style variants — replace legacy patterns outright.
- All PRs must include test proof, typecheck pass, and before/after evidence.
- Branch convention: `style/255-select-controls`, `style/252-picker-menu`.

---

## Priority Order

| Rank | Issue | PR branch | Rationale |
|------|-------|-----------|-----------|
| P1   | #255 Style: Inconsistency in selection controls | `style/255-select-controls` | Affects three tabs (Audio Input, Profiles, Settings); higher visual surface |
| P2   | #252 Style: Transformation pop-up menu inconsistent | `style/252-picker-menu` | Isolated BrowserWindow HTML; narrower blast radius |

---

## Ticket #255 → PR #1

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/255
**Branch:** `style/255-select-controls`

### Goal

Standardize every select-like control in the Audio Input, Profiles, and Settings tabs
to one consistent field pattern (label + select trigger) using the existing app design
tokens. Remove all legacy/bare-minimum styling; no backward-compat branches remain.

### Scope

In-scope files (native `<select>` elements to restyle):
- `src/renderer/settings-recording-react.tsx` — STT provider, STT model, recording method, sample rate, audio source
- `src/renderer/settings-stt-provider-form-react.tsx` — STT provider, STT model
- `src/renderer/profiles-panel-react.tsx` — Provider (read-only), Model (in `ProfileEditForm`)

Out of scope: output radio cards, API key inputs, shortcut editor, toggle switches.

### Key Architectural Decision (must resolve before coding)

The issue body shows shadcn `<Select>` / `<SelectTrigger>` components. The project
has **no** `@radix-ui/react-select` installed. Two valid paths:

| Path | Trade-off |
|------|-----------|
| A — Improve native `<select>` styling | No new dependency; limited hover/focus customization; matches AGENTS.md constraint |
| B — Install `@radix-ui/react-select` + shadcn wrapper | Full spec fidelity; adds a runtime dep; more test surface |

**Recommended: Path A** — Use native `<select>` with the full token set from the spec.
Only escalate to Path B if visual fidelity review rejects Path A output.

**Label DOM pattern (critical — do NOT restructure):** All in-scope selects already use a
wrapping-`<label>` pattern where the `<select>` is a child of the `<label>` element (no
separate `htmlFor`). Do **not** restructure to separate `htmlFor`/`id` pairs — that changes
the DOM surface and breaks implicit label association for screen readers. Apply
`text-muted-foreground` to the `<span>` inside the wrapping label, not to the outer
`<label>` element (which already carries `text-xs`). Add `gap-2` to the existing
`flex-col` label instead of a new wrapping `<div className="space-y-2">`.

**Spacing — avoid double-stack:** The parent shell (`app-shell-react.tsx`) already
applies `space-y-4` on wrapping sections. Do **not** add `space-y-4` at the component
level — this doubles spacing tokens. Keep or reduce existing `space-y-3` inside the
component to maintain actual visual density.

**Profiles edit form labels:** The `profiles-panel-react.tsx` edit form uses
`text-[10px] text-muted-foreground` per spec §6.4. Do **not** change these to
`text-xs` — they are already correct. Only apply `text-muted-foreground` to labels
in `settings-recording-react.tsx` and `settings-stt-provider-form-react.tsx`.

Target select class set (Path A, applied inside existing wrapping-label structure):

```tsx
<label className="flex flex-col gap-2 text-xs">
  <span className="text-muted-foreground">{fieldLabel}</span>
  <select
    id={id}
    className="w-full h-8 rounded-md border border-input bg-input/30 hover:bg-input/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
  >
    ...
  </select>
</label>
```

Key token changes vs. current:
- `w-full` (was missing) — full-width stretch inside section
- `rounded-md` (was `rounded`) — matches `--radius: 0.5rem`; correct for non-card controls (not `rounded-lg` which is for cards)
- `bg-input/30 hover:bg-input/50` (was `bg-input`) — semi-transparent surface with hover
- `focus-visible:ring-2 focus-visible:ring-ring` (was missing in settings files) — keyboard accessibility
- `gap-2` on wrapping label (was `gap-1.5`) — label↔control spacing
- `<span className="text-muted-foreground">` on the inner span (color was missing)

### Checklist

- [ ] *(Pre-coding)* Enumerate all in-scope `<select>` elements and their current classNames across the three files; confirm DOM structure (wrapping-label vs. htmlFor).
- [ ] Confirm the exact Tailwind class set with `style-update.md` section 4 tokens.
- [ ] Decide Path A vs Path B (default A; escalate if review rejects).
- [ ] Restyle all in-scope selects to the target class set.
- [ ] Add `text-muted-foreground` to the `<span>` inside wrapping labels in `settings-recording-react.tsx` and `settings-stt-provider-form-react.tsx` only.
- [ ] Normalize label↔control gap to `gap-2` on the wrapping label flex container; do NOT add `space-y-4` at the component level (parent already applies it).
- [ ] Remove every legacy style variant in targeted components.
- [ ] Verify all existing select → callback behaviors fire unchanged.
- [ ] Update/add component tests to assert new class presence on trigger and label.
- [ ] Run `pnpm typecheck` — zero errors.
- [ ] Capture before/after screenshots for: default, hover, focus, disabled states.
- [ ] Update docs/changelog with scope and removed legacy variants.

### Tasks (step-by-step)

**Step 1 — Pre-coding baseline (does not produce a diff)**
1. Read `settings-recording-react.tsx`, `settings-stt-provider-form-react.tsx`, `profiles-panel-react.tsx` in full.
2. List every `<select>` id and its current className.
3. Confirm all use the wrapping-label pattern (no htmlFor restructuring needed).
4. Cross-check against `docs/style-update.md` section 4 (design tokens) and issue #255 body section "Form Field Pattern".

**Step 2 — Implement style unification**
1. Apply the target select class set to all in-scope selects (add `w-full`, change `rounded` → `rounded-md`, `bg-input` → `bg-input/30 hover:bg-input/50`, add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors`).
2. Add `text-muted-foreground` to the inner `<span>` of wrapping labels in `settings-recording-react.tsx` and `settings-stt-provider-form-react.tsx`. Do NOT change `profiles-panel-react.tsx` edit-form labels (already at `text-[10px] text-muted-foreground` per spec §6.4).
3. Change `gap-1.5` → `gap-2` on wrapping label flex containers. Do NOT add `space-y-4` at component level.
4. Remove any inline style, legacy class branch, or one-off override in the three target files.
5. Re-read each modified file top-to-bottom to verify indentation and syntax.

**Step 3 — Test updates**
1. In `settings-recording-react.test.tsx`: add assertions for `w-full`, `focus-visible:ring-2 focus-visible:ring-ring`, and `text-muted-foreground` on the label.
2. In `settings-stt-provider-form-react.test.tsx`: same pattern for provider/model selects.
3. In `profiles-panel-react.test.tsx`: assert edit-form provider/model selects match new class set.
4. Run `pnpm test -- src/renderer/settings-recording-react.test.tsx src/renderer/settings-stt-provider-form-react.test.tsx src/renderer/profiles-panel-react.test.tsx` — all green.

**Step 4 — Typecheck and cleanup**
1. Run `pnpm typecheck` — zero errors.
2. Delete any commented-out legacy code.
3. Update `docs/changelog` or `docs/decisions/` with a note about legacy variant removal.

### Gates

| Gate | Criterion |
|------|-----------|
| Visual | All in-scope selects share `w-full h-8 text-xs`, `rounded-md`, `bg-input/30 hover:bg-input/50`, `focus-visible:ring-2 focus-visible:ring-ring` |
| Label | Settings/AudioInput label spans use `text-muted-foreground`; Profiles edit form labels keep `text-[10px] text-muted-foreground` (already correct per spec §6.4) |
| Non-regression | Selecting provider/model/device fires unchanged callbacks with unchanged values |
| A11y | Keyboard: `Tab` reaches each select, `Enter`/arrows work, `focus-visible` ring appears |
| Cleanup | Zero remaining legacy-style class branches in the three target files |
| Test | `pnpm test -- src/renderer/settings-recording-react.test.tsx src/renderer/settings-stt-provider-form-react.test.tsx src/renderer/profiles-panel-react.test.tsx` — all pass |
| Typecheck | `pnpm typecheck` — zero errors |
| Evidence | Before/after screenshots attached to PR for each state |

---

## Ticket #252 → PR #2

**Issue:** https://github.com/massun-onibakuchi/speech-to-text-app/issues/252
**Branch:** `style/252-picker-menu`
**Depends on:** #255 merged (style baseline confirmed before secondary style ticket)

### Goal

Align the transformation pop-up picker window (BrowserWindow HTML generated by
`buildPickerHtml`) with the app's established design tokens — typography, spacing,
border, ring, and color — while leaving pick-and-run and change-default behavior
completely unchanged.

### Context

The picker window is a standalone `BrowserWindow` loaded as a `data:text/html` URL.
It cannot use Tailwind. Its CSS variables are currently hardcoded hex values that
diverge from the app's OKLCH palette. The fix is CSS-only inside `buildPickerHtml`.

Current vs. target token mapping:

| Token | Current hex | Target (OKLCH-equivalent hex) | Notes |
|-------|------------|-------------------------------|-------|
| `--background` | `#1a1f28` | `#1a1a1f` | `oklch(0.13 0.005 260)` |
| `--card` | `#212833` | `#1e1e25` | `oklch(0.16 0.005 260)` |
| `--border` | `#36404f` | `#363641` | `oklch(0.25 0.008 260)` |
| `--text` | `#f3f4f6` | `#f2f2f2` | `oklch(0.95 0 0)` |
| `--muted` | `#9aa6b2` | `#898990` | `oklch(0.55 0.01 260)` |
| `--accent` | `#2f3b4a` | `#2b2b34` | `oklch(0.22 0.008 260)` |
| `--focus` | `#44d17d` | `#44c97b` | `oklch(0.65 0.2 145)` — primary/ring (verify with CSS Color Level 5 converter before committing) |

Typography adjustments (to match app):
- Title: `font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted)` (matches `text-xs text-muted-foreground` section header style)
- Item name: `font-size: 13px; font-weight: 500` (was 600 — reduce to medium weight)
- Item tag: `font-size: 11px` (unchanged)
- `font-family`: add `"GeistMono", monospace` fallback for item-tag (optional; current chain fine)

Spacing adjustments:
- `.shell` padding: `8px` (was `12px`) — tighter frame
- `.card` `border-radius: 8px` (was `12px`) — matches `--radius: 0.5rem`
- `.item` padding: `8px 12px` (was `10px 14px`) — match `py-2 px-3`
- `.item:focus-visible` `outline-offset: -3px` (was `-2px`) — match ring inset style

No changes to: JS logic, `will-navigate` handler, window dimensions, HTML structure, ARIA attributes.

### Checklist

- [ ] Read `profile-picker-service.ts` `buildPickerHtml` in full.
- [ ] Map every CSS variable to OKLCH-equivalent hex and document the mapping.
- [ ] Verify OKLCH-to-hex conversions against `docs/style-update.md` table.
- [ ] Update CSS variables in `buildPickerHtml` — colors, typography, spacing, radius.
- [ ] Confirm JS logic block (navigation handler, keyboard handler, selection rendering) is byte-for-byte unchanged.
- [ ] Re-read the full updated function for syntax and indentation validity.
- [ ] Update `profile-picker-service.test.ts`: assert `buildPickerHtml` output contains updated token values and new radius/spacing values.
- [ ] Run `pnpm test -- src/main/services/profile-picker-service.test.ts` — all pass.
- [ ] Run `pnpm typecheck` — zero errors.
- [ ] Capture before/after screenshots for: default, hover, focused item, selected item.
- [ ] Update docs/changelog note for style alignment.

### Tasks (step-by-step)

**Step 1 — Baseline and mapping**
1. Read `profile-picker-service.ts` lines 79–173 (`buildPickerHtml` CSS block) in full.
2. Build the OKLCH→hex conversion table (CSS variable by CSS variable).
3. Cross-check each hex value against `docs/style-update.md` section 4.1 table.
4. Note typography and spacing gaps against the spec section (label size, item padding, border-radius).

**Step 2 — CSS-only update**
1. Replace `--background`, `--card`, `--border`, `--text`, `--muted`, `--accent`, `--focus` in the style block.
2. Update `.card` `border-radius` to `8px`.
3. Remove `box-shadow: 0 10px 28px rgba(0,0,0,0.35)` from `.card` — the spec (`style-update.md §9`) bans hardcoded RGBA shadows; the existing `border: 1px solid var(--border)` on `.card` provides visual separation.
4. Update `.shell` padding to `8px`.
5. Update `.item` padding to `8px 12px`.
6. Update `.hint` padding from `0 14px 10px` to `0 12px 8px` to match the tightened frame.
7. Update `.title` to use the muted uppercase label style.
8. Reduce `.item-name` `font-weight` to `500`.
9. Do NOT touch any `<script>` content or HTML structure.
10. Re-read the full `buildPickerHtml` function to verify no accidental JS edits.

**Step 3 — Test updates**
1. In `profile-picker-service.test.ts`: update/add assertions in `buildPickerHtml` tests to check:
   - Remove or replace `expect(html).toContain('--card: #212833;')` → `expect(html).toContain('--card: #1e1e25;')`
   - Update `--background`, `--border`, `--muted`, `--accent`, and `--focus` assertions to the new hex values.
   - Assert `.card` style block contains `border-radius: 8px`
   - Assert `.item` style block contains `padding: 8px 12px`
   - Assert `box-shadow` is absent from `.card` style block
2. Confirm existing behavioral tests (pick result, cancel, keyboard flow) remain passing.
3. Run `pnpm test -- src/main/services/profile-picker-service.test.ts` — all green.

**Step 4 — Typecheck and cleanup**
1. Run `pnpm typecheck` — zero errors.
2. Update `docs/changelog` or `docs/decisions/` with a note about token alignment.

### Gates

| Gate | Criterion |
|------|-----------|
| Visual | Picker window uses `oklch(0.13)` background, `oklch(0.65 0.2 145)` focus ring, `0.5rem` radius |
| Scope | Zero changes to JS navigation handler, pick/change-default behavior, or window dimensions |
| A11y | `focus-visible` ring still visible; ARIA `listbox`/`option` roles unchanged |
| Test | `pnpm test -- src/main/services/profile-picker-service.test.ts` — all pass |
| Typecheck | `pnpm typecheck` — zero errors |
| Evidence | Before/after screenshots of hover, focus, selected states attached to PR |

---

## Cross-Ticket Execution Notes

- Sequence: #255 first → merge → #252 starts (style baseline locked before secondary ticket).
- Isolation rule: neither ticket modifies business logic, IPC contracts, or shortcut capture state.
- If Path B (shadcn Select) is chosen for #255, add a dependency install task and update `package.json` review to the #255 checklist before implementation.
- Integration command after both tickets: `pnpm test && pnpm typecheck`.
- PR template requirement (each PR): issue link, out-of-scope list, before/after evidence, test output proof.
