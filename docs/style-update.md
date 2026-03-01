# UI Style Update Spec

Where: `docs/style-update.md`
What: Canonical UI/UX redesign spec for the desktop app
Why: Enforce a full visual and structural reset based on `resources/artifacts-sample.zip`

## 1. Decision Record (No Backward Compatibility)

- **Decision**: Adopt the style in `resources/artifacts-sample.zip` as the single source of truth for visual design and layout.
- **Impact**: This is a breaking redesign of renderer UI — colors, typography, layout structure, component behavior, and information hierarchy all change.
- **Rule**: Do **not** preserve legacy visual patterns for compatibility. Remove or replace them entirely.
- **Constraint**: Keep business behavior and data flow intact; redesign only the presentation layer and interaction patterns described below.

## 2. Artifact Scope

The redesign spec is derived from these files in the zip:

- `app/globals.css` — token system, CSS methodology
- `components.json` — component library config
- `app/layout.tsx` — root shell and font setup
- `components/stt/app-shell.tsx` — layout frame and shell structure
- `components/stt/recording-button.tsx` — recording control states
- `components/stt/activity-feed.tsx` — job list and status cards
- `components/stt/profiles-panel.tsx` — profile list and inline edit
- `components/stt/settings-panel.tsx` — settings IA and controls
- `components/stt/status-bar.tsx` — footer metadata strip

## 3. CSS Methodology

### 3.1 CSS Framework

- **Tailwind CSS v4** via `@import 'tailwindcss'`
- **Animation library**: `@import 'tw-animate-css'`
- **Dark mode variant**: `@custom-variant dark (&:is(.dark *))`
- **Theme mapping**: Use `@theme inline { ... }` to bind CSS variables to Tailwind utility classes (e.g. `--color-primary: var(--primary)` → `bg-primary`, `text-primary`)
- **Base layer**: Apply `border-border outline-ring/50` globally and `bg-background text-foreground` on body via `@layer base`

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### 3.2 Component Library

- **shadcn/ui** — style variant: `new-york`, `cssVariables: true`
- **Icon library**: `lucide-react` (used exclusively; no other icon sets)
- Utility helper: `cn()` from `@/lib/utils` (clsx + tailwind-merge)

## 4. Design System

### 4.1 Color Tokens (OKLCH)

Use semantic tokens from `globals.css` exactly. Both `:root` and `.dark` are set to the same dark-first palette (the app is dark-only).

| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(0.13 0.005 260)` | App canvas |
| `--foreground` | `oklch(0.95 0 0)` | Primary text |
| `--card` | `oklch(0.16 0.005 260)` | Panels, cards |
| `--card-foreground` | `oklch(0.95 0 0)` | Text on cards |
| `--popover` | `oklch(0.18 0.005 260)` | Floating surfaces |
| `--primary` | `oklch(0.65 0.2 145)` | CTA, active states, links |
| `--primary-foreground` | `oklch(0.13 0.005 260)` | Text on primary |
| `--secondary` | `oklch(0.22 0.008 260)` | Secondary controls, inputs |
| `--secondary-foreground` | `oklch(0.88 0 0)` | Text on secondary |
| `--muted` | `oklch(0.20 0.005 260)` | Quiet surfaces |
| `--muted-foreground` | `oklch(0.55 0.01 260)` | Subdued/metadata text |
| `--accent` | `oklch(0.22 0.008 260)` | Hover backgrounds |
| `--accent-foreground` | `oklch(0.92 0 0)` | Text on accent |
| `--destructive` | `oklch(0.55 0.2 25)` | Error/danger |
| `--destructive-foreground` | `oklch(0.95 0 0)` | Text on destructive |
| `--border` | `oklch(0.25 0.008 260)` | Dividers, outlines |
| `--input` | `oklch(0.22 0.008 260)` | Form input backgrounds |
| `--ring` | `oklch(0.65 0.2 145)` | Focus ring |
| `--success` | `oklch(0.65 0.2 145)` | Success status (same hue as primary) |
| `--success-foreground` | `oklch(0.13 0.005 260)` | Text on success |
| `--warning` | `oklch(0.75 0.15 80)` | Caution messaging |
| `--warning-foreground` | `oklch(0.13 0.005 260)` | Text on warning |
| `--recording` | `oklch(0.65 0.25 25)` | Recording-state emphasis only |
| `--recording-foreground` | `oklch(0.95 0 0)` | Text on recording |
| `--sidebar` | `oklch(0.11 0.005 260)` | Sidebar (darker than background) |

**Opacity modifiers** are used frequently for layered depth without extra tokens:

- `bg-card/50` — translucent card (header, footer)
- `bg-card/30` — very faint card (waveform strip)
- `bg-primary/5` — active card tint
- `bg-primary/10` — icon container background in header
- `bg-secondary/50` — transformed text block background
- `border-success/20`, `border-destructive/30` — semantic border tints on job cards
- `border-primary/40`, `border-primary/50` — active/focused card borders
- `bg-recording/20` + `bg-recording/10` — recording animation rings
- `bg-recording/80` — waveform bar color while recording
- `bg-muted-foreground/20` — waveform bar color at idle

### 4.2 Typography

- **Sans**: `Inter` → `--font-sans`, fallbacks: `'Inter', 'Geist', 'Geist Fallback'`
- **Mono**: `Geist Mono` → `--font-mono`, fallbacks: `'Geist Mono', 'Geist Mono Fallback'`
- Applied on `<body>`: `font-sans antialiased`
- Dark-only: HTML element has `class="dark"` hardcoded

Density-first text scale:

| Class | Usage |
|---|---|
| `text-[10px]` | Metadata, timestamps, durations, badge labels, font-mono IDs |
| `text-[11px]` | Helper copy, system prompt previews |
| `text-xs` | Body, form labels, button text, feed content |
| `text-sm` | Section headings, profile titles, app name |
| `text-lg` | Recording timer (the only large text element) |

Monospace (`font-mono`) is used for: recording timer, API model/provider IDs, duration values, API key input fields.

### 4.3 Spacing and Radius

- Base radius: `0.5rem` (via `--radius`); `rounded-lg` is the standard card radius
- Compact control heights: `h-7` (tight), `h-8` (standard form controls)
- Card padding: `p-3`
- Section gap: `gap-6`
- Form field spacing: `space-y-4` between fields, `space-y-2` between label and input
- Left panel gutter: `px-6 py-8`

## 5. Layout Architecture

### 5.1 Root Shell

```
flex h-screen flex-col bg-background
  └── <header>   border-b bg-card/50         (compact title bar)
  └── <main>     flex flex-1 overflow-hidden  (no page scroll)
  └── <footer>   border-t bg-card/50         (status bar)
```

### 5.2 Main Split

- **Left panel**: `w-[320px]` fixed, `border-r`
  - Top area: `flex flex-1 flex-col items-center justify-center border-b px-6 py-8` (recording button)
  - Bottom: waveform strip `h-16 bg-card/30 flex items-center justify-center gap-[3px] px-6`
- **Right panel**: `flex flex-1 flex-col` — tabbed workspace

### 5.3 Header

```tsx
<header className="flex items-center justify-between border-b px-4 py-2 bg-card/50">
  {/* Logo: size-6 rounded-md bg-primary/10 + AudioWaveform size-3.5 text-primary */}
  {/* App name: text-sm font-semibold tracking-tight */}
  {/* State dot: size-2 rounded-full (bg-recording animate-pulse | bg-success) + text-[10px] label */}
</header>
```

### 5.4 Tab Rail

Flat underline style — no pill shape, no background fill:

```tsx
<TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
  <TabsTrigger
    className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs
      data-[state=active]:border-primary data-[state=active]:bg-transparent
      data-[state=active]:text-foreground data-[state=active]:shadow-none"
  />
```

Tabs: `Activity` (Activity icon), `Profiles` (Zap icon), `Settings` (Settings icon). Icons are `size-3.5 mr-1.5`.

### 5.5 Structural Rules

- No page-level scroll; each tab content area handles its own scroll independently.
- Header and footer always visible.
- Left panel fixed-width to preserve motor memory for the recording gesture.

## 6. Component Behavior Spec

### 6.1 Recording Button

Three states only — `idle`, `recording`, `processing`:

| State | Button | Icon | Label |
|---|---|---|---|
| `idle` | `bg-primary size-20 rounded-full` | `Mic size-7` | no helper text label |
| `recording` | `bg-recording size-20 rounded-full` | `Square size-7 fill-current` | `font-mono text-lg text-recording tabular-nums` timer + Cancel link |
| `processing` | `bg-muted size-20 opacity-60 cursor-not-allowed` | `Mic size-7` | `text-sm text-muted-foreground animate-pulse` "Processing..." |

Recording animation rings (absolutely positioned behind button):
- `absolute inset-0 rounded-full bg-recording/20 animate-ping`
- `absolute -inset-3 rounded-full bg-recording/10 animate-pulse`

Cancel link: `flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors` with `X size-3` icon.

Must keep: circular `size-20` target, `focus-visible:ring-2 focus-visible:ring-ring`, ARIA labels for start/stop/cancel.

### 6.2 Waveform Strip

- `h-16` strip, `bg-card/30`, bars centered with `gap-[3px]`
- 32 bars: `w-[3px] rounded-full transition-all duration-150`
- Idle: `bg-muted-foreground/20`, sine-curve heights (`Math.sin(i * 0.3) * 6 + 8`)
- Recording: `bg-recording/80`, random heights per-frame, per-bar `animationDelay`

### 6.3 Activity Feed

- Scroll area wrapping stacked job cards with `gap-2`
- Card: `rounded-lg border bg-card p-3 transition-colors`
- Semantic border overrides:
  - Succeeded: `border-success/20`
  - Failed (any `*_failed` status): `border-destructive/30`
- Status row: `StatusIcon` (spins on `transcribing`/`transforming`) + `Badge` + optional profile name + duration + timestamp
- Text blocks:
  - Transcript: `text-xs text-muted-foreground leading-relaxed line-clamp-2`
  - Transformed: `rounded bg-secondary/50 p-2`, `text-xs text-foreground leading-relaxed line-clamp-2`
- Copy/paste actions revealed on `group-hover/text`: `opacity-0 group-hover/text:opacity-100 transition-opacity`
- Action buttons: `p-1 rounded bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground`
- Empty state: centered `Loader2 size-8 opacity-20` + two-line muted message

### 6.4 Profiles Panel

- Scrollable list with inline-edit (no navigation away from panel)
- Profile card states:
  - Active: `border-primary/40 bg-primary/5`
  - Default badge: `bg-primary/10 text-primary border-primary/20 text-[10px] h-4`
  - Hover reveals (opacity-0 → group-hover:opacity-100): star, pencil, trash buttons
- Edit form: title `Input h-7`, provider/model in `grid grid-cols-2 gap-2` Selects (`h-7`), system prompt `Textarea min-h-[60px] resize-none rows={3}`, user prompt `Input h-7 font-mono`
- Save/Cancel: `Button size="sm" h-7 text-xs` pair at bottom right
- Add button: `Button variant="ghost" size="sm" h-7 text-xs gap-1` with `Plus size-3`
- Profile footer: `text-[10px] font-mono text-muted-foreground` for `provider/model`

### 6.5 Settings Panel (Order Matters)

Settings sections appear in this exact order, separated by `<Separator />`:

1. **Output** — shown first for highest immediate visibility
2. **Speech-to-Text**
3. **LLM Transformation**
4. **Audio Input**
5. **Global Shortcuts**

Section header pattern: `flex items-center gap-2 mb-4` with `size-4 text-primary` icon + `text-sm font-semibold text-foreground` heading.

**Output section — critical interaction rules:**

- Text source is exclusive selection — custom radio cards, not `<RadioGroup>`:
  - Active: `border-primary/50 bg-primary/5`
  - Inactive: `border-border bg-card hover:bg-accent`
  - Radio dot: `size-4 rounded-full border-2` (border-primary when active) + `size-2 rounded-full bg-primary` fill
- Destination toggles are independent — custom checkbox cards with `<Switch className="scale-90">` on right:
  - Active: `border-primary/50 bg-primary/5`
  - Custom checkbox indicator: `size-4 rounded` with SVG checkmark when active
- Warn with `text-[10px] text-warning` when both destinations are disabled

**API key fields**: `h-8 text-xs font-mono flex-1` with eye-toggle button (`p-1.5 rounded bg-secondary hover:bg-accent`).

**Shortcut list**: `flex items-center justify-between` rows, key segments wrapped in `<Kbd>` components.

### 6.6 Status Bar

```tsx
<footer className="flex items-center justify-between border-t bg-card/50 px-4 py-1.5">
  {/* Left group (gap-4):
       Mic size-3 + font-mono text-[10px]: sttProvider/sttModel
       Cpu size-3 + font-mono text-[10px]: llmProvider
       text-[10px]: audioDevice */}
  {/* Right group (gap-3):
       text-[10px] text-primary: activeProfile
       Wifi/WifiOff size-3 (text-success / text-destructive) + text-[10px]: "Ready"/"Offline" */}
</footer>
```

## 7. Motion and Interaction Language

- **Recording only**: `animate-ping` on outer ring, `animate-pulse` on inner ring
- **In-progress status icons**: `animate-spin`
- **Processing label**: `animate-pulse`
- **Header state dot**: `animate-pulse` when recording
- **Hover reveals**: `opacity-0 → opacity-100` via `transition-opacity`
- **Color/background transitions**: `transition-colors` on all interactive elements
- **Duration**: `duration-150` to `duration-200`

Do **not** use: entrance animations, `translateY` hover lifts, stagger delays, `[data-stagger]`, backdrop blur, or heavy transforms.

## 8. Accessibility and UX Rules

- Never rely on color alone for status — always pair icon + text.
- All icon-only buttons must have explicit `aria-label`.
- Interactive cards (profile cards): `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.
- Visible focus treatment on all keyboard-navigable elements (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`).
- Copy: concise and action-oriented — tool UI vocabulary, not marketing.

## 9. Legacy Patterns to Remove

The current `src/renderer/styles.css` uses entirely different conventions. All of the following must be removed and not referenced:

| Legacy | Replace with |
|---|---|
| Custom classes (`.shell`, `.card`, `.hero`, `.chip`, `.nav-tab`, `.toast-item`, etc.) | Tailwind utilities via `cn()` |
| Token names: `--bg`, `--ink`, `--muted`, `--accent`, `--accent-2`, `--good`, `--bad` | New OKLCH token set |
| Radial/linear gradient `body` background | `bg-background` via token |
| `box-shadow` with hardcoded RGBA | Token-based borders only |
| `--card-radius: 18px` (large radius) | `--radius: 0.5rem` / `rounded-lg` |
| Serif headings (`Iowan Old Style`, `Palatino Linotype`) | `Inter` for all UI text |
| Pill tabs (`.nav-tab { border-radius: 999px }`) | Flat underline tab rail |
| Hover lift: `transform: translateY(-1px)` | `transition-colors` only |
| `[data-stagger]` entrance animation | No entrance animations |
| Responsive breakpoints / `@media` queries | Fixed desktop shell, no breakpoints |
| `body { font-family: "Avenir Next", "Gill Sans", ... }` | `Inter` via `--font-sans` |
| `.settings-group h3 { color: var(--accent-2) }` | `text-sm font-semibold text-foreground` |
| `.button-grid`, `.toggle-row`, `.text-row` layout classes | Flexbox/grid utilities inline |

## 10. Implementation Checklist

- [ ] Replace `src/renderer/styles.css` with Tailwind v4 + new OKLCH token system
- [ ] Add `@theme inline` block mapping all CSS variables to Tailwind color utilities
- [ ] Add `tw-animate-css` import and `@custom-variant dark` declaration
- [ ] Set up `Inter` and `Geist Mono` fonts; apply `font-sans antialiased` on body
- [ ] Hardcode `class="dark"` on `<html>` (dark-only app)
- [ ] Enforce `flex h-screen flex-col` root shell with fixed header/footer
- [ ] Implement fixed `w-[320px]` left panel with recording button + waveform strip
- [ ] Implement right panel with flat underline tab rail (Activity / Profiles / Settings)
- [ ] Move settings IA to output-first section ordering
- [ ] Standardize all control heights to `h-7`/`h-8`; card padding to `p-3`
- [ ] Replace all legacy color tokens with new OKLCH set
- [ ] Remove all gradient backgrounds, box-shadows, and entrance animations
- [ ] Validate independent scroll in each tab content area
- [ ] Verify focus/ARIA behavior on all icon-only controls and interactive cards

## 11. Explicit Non-Goals

- No incremental visual migration — full replace only.
- No mixed legacy/new style coexistence.
- No backward-compatible styling exceptions unless required for functional correctness.
- No responsive/breakpoint styles — this is a fixed-layout desktop app.
