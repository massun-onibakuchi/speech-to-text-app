# UI Redesign Spec — Precision Audio Interface (Greenfield)

**Status:** Proposed
**Date:** 2026-02-26
**Authors:** Design + Engineering
**Scope:** Full renderer redesign — no backward-compatibility UI constraints
**Related files:** `src/renderer/styles.css`, `src/renderer/home-react.tsx`, `src/renderer/shell-chrome-react.tsx`, `src/renderer/app-shell-react.tsx`

---

## 1. Design Direction

### Concept: Precision Audio Interface

The app is a voice-first productivity tool. The design should feel like high-quality hardware — a mixing desk or studio monitor — not a generic SaaS dashboard. Every visual decision should reinforce the primary interaction: **capturing your voice and transforming it into precise text**.

**Four words that should describe the experience:**
`Focused · Tactile · Responsive · Trustworthy`

### Anti-patterns to eliminate

| Current pattern | Why it fails | Replacement |
|---|---|---|
| Four equal recording buttons | Decision fatigue at the most critical moment | Single adaptive orb button |
| Hero card + separate nav card | Wastes vertical space, two redundant containers | Unified compact header bar |
| Long flat settings scroll | Cognitive overload; all sections fight for attention | Collapsible accordion sections |
| Top-right toasts | Banner blindness; errors go unnoticed | Bottom-center, slide-up, accent stripe |
| Generic orange accent | Indistinct; common AI app color | Jewel-tone amber + teal pair |
| Status as small pill, same size as other elements | Visual hierarchy collapse | Status as dominant element when recording |

---

## 2. Design Tokens

### 2.1 Color System

All tokens defined as CSS custom properties on `:root`.

#### Surfaces (3-level elevation model)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#060d1a` | App background |
| `--bg-elev` | `#0b1626` | Elevated surface (cards) |
| `--bg-raised` | `#111f33` | Raised surface (modals, popovers) |
| `--bg-input` | `rgb(4 10 22 / 55%)` | Form inputs |

#### Ink (text hierarchy)

| Token | Value | Usage |
|---|---|---|
| `--ink` | `#deeeff` | Primary text |
| `--ink-2` | `#7f98b8` | Secondary / muted text |
| `--ink-3` | `#384f6a` | Tertiary / dividers |

#### Brand

Two-color brand identity: **amber gold** as primary action, **teal** as feedback/secondary.

| Token | Value | Rationale |
|---|---|---|
| `--amber` | `#e8a23a` | Primary CTA, buttons. Jewel-tone gold vs. generic orange |
| `--amber-dim` | `rgb(232 162 58 / 16%)` | Button fill, chip backgrounds |
| `--amber-glow` | `rgb(232 162 58 / 30%)` | Button box-shadow |
| `--teal` | `#0dcfbf` | Focus rings, nav active, section labels, shortcut badges |
| `--teal-dim` | `rgb(13 207 191 / 12%)` | Busy-state button fill |
| `--teal-glow` | `rgb(13 207 191 / 28%)` | Focus glow |

#### Semantic

| Token | Value | Usage |
|---|---|---|
| `--good` | `#22d9a0` | Recording active, success toasts, completion dots |
| `--good-dim` | `rgb(34 217 160 / 18%)` | Orb idle fill, waveform background |
| `--good-glow` | `rgb(34 217 160 / 35%)` | Orb active shadow |
| `--bad` | `#f06060` | Errors, stop-orb state, cancel button |
| `--bad-dim` | `rgb(240 96 96 / 18%)` | Error backgrounds |

#### Future: Light theme tokens

Greenfield requirement — app should ship with a light theme as an alternate token set. Light mode mirror:

```css
[data-theme="light"] {
  --bg: #f4f7fb;
  --bg-elev: #ffffff;
  --bg-raised: #eef2f8;
  --bg-input: rgb(240 245 255 / 80%);
  --ink: #0f1d30;
  --ink-2: #4a6080;
  --ink-3: #a0b4cc;
  --border: rgb(180 200 220 / 60%);
  --border-hi: rgb(140 165 195 / 80%);
  /* brand colors remain the same — they read well on both backgrounds */
}
```

### 2.2 Spacing — 8px Grid

All spacing values are multiples of 4px, with 8px as the base unit. No `0.7rem` or `1.25rem` ad-hoc values in new code.

| Token | Value | Usage |
|---|---|---|
| `--sp1` | `4px` | Tight gaps (icon–label) |
| `--sp2` | `8px` | Chip/badge padding, list gaps |
| `--sp3` | `12px` | Default internal padding |
| `--sp4` | `16px` | Card padding, section gaps |
| `--sp5` | `20px` | Comfortable card padding |
| `--sp6` | `24px` | Large section spacing |
| `--sp8` | `32px` | Between major sections |
| `--sp10` | `40px` | Page vertical rhythm |
| `--sp12` | `48px` | Hero-level spacing |

### 2.3 Typography

Three typeface roles, all system-based (no network font loading required for offline Electron):

| Role | Stack | Usage |
|---|---|---|
| **Serif** | `"Iowan Old Style", "Palatino Linotype", Georgia, serif` | App name, page hero titles |
| **Sans** | `-apple-system, BlinkMacSystemFont, "Avenir Next", "Segoe UI", system-ui, sans-serif` | All UI body text |
| **Mono** | `"SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace` | Shortcut keys, status badges, section labels, version strings |

Type scale:

| Class / Element | Size | Weight | Role |
|---|---|---|---|
| `h1` / `.app-header-title` | `clamp(1.1rem, 2vw, 1.35rem)` | 700 | App name in header |
| `h2` | `1.0rem` | 700 | Card section titles |
| `h3` / `.section-label` | `0.65rem` + `letter-spacing: 0.14em` + uppercase | 700, mono | Section category labels |
| Body | `0.88rem` | 400 | Form fields, descriptions |
| `.status-dot` | `0.67rem` + mono | 700 | Recording state badge |
| `.shortcut-combo` | `0.70rem` + mono | 400 | Key bindings |
| `.chip` | `0.70rem` | 400 | Status chips |

### 2.4 Radius Scale

| Token | Value | Usage |
|---|---|---|
| `--r-sm` | `8px` | Shortcut combo badges, small chips |
| `--r-md` | `12px` | Buttons, inputs, form rows |
| `--r-lg` | `18px` | Cards (`--card-radius`) |
| `--r-xl` | `28px` | Modal overlays (future) |
| `--r-full` | `999px` | Pills, nav tabs, status dots |

### 2.5 Shadow

| Token | Value | Usage |
|---|---|---|
| `--shadow` | `0 20px 60px rgb(2 4 16 / 55%)` | Cards |
| `--shadow-sm` | `0 4px 16px rgb(2 4 16 / 35%)` | App header, small surfaces |
| `--shadow-amber` | `0 12px 40px var(--amber-glow)` | Primary button hover |
| `--shadow-teal` | `0 12px 40px var(--teal-glow)` | Focus state glow |
| `--shadow-good` | `0 12px 40px var(--good-glow)` | Recording orb hover |

---

## 3. Layout Architecture

### 3.1 App Chrome

Replace the legacy two-card header (hero card + nav card) with a single `.app-header` bar.

```
┌─────────────────────────────────────────────────────────────────┐
│  Speech-to-Text  v1  │  groq / whisper-large-v3  │  Auto-run   │  Home  Settings  │
└─────────────────────────────────────────────────────────────────┘
                                                  ↑ teal top border accent
```

- Brand (serif title + mono version) left-anchored
- Status chips (provider, auto-run state) fill the center — hidden at `<760px`
- Navigation tabs right-anchored, pill-shaped
- Single `border-top` teal accent line (low-key brand signal)
- `backdrop-filter: blur(8px)` — glass layer sits above background glow

### 3.2 Home Page

Two-column grid at `>1020px`, stacks to 1 column below. Column sizing: `1fr 1fr`.

```
┌─────────────────────┐  ┌─────────────────────┐
│   Recording Card    │  │   Transform Card    │
│                     │  │                     │
│  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒     │  │  Run AI transform   │
│   ●  waveform  ●    │  │  on clipboard text  │
│     [ ● START ]     │  │                     │
│    Start  Stop      │  │  [ Transform        │
│         [Cancel]    │  │    Clipboard ]      │
│                     │  │                     │
└─────────────────────┘  └─────────────────────┘
```

**Greenfield addition (not yet implemented):**

A third card below the two primary cards — **Activity Feed** — showing the last 5 transcription/transform results with timestamps, status, and preview text. This satisfies the peak-end rule: users see what the app produced before they close it.

```
┌──────────────────────────────────────────────────────────┐
│  Recent Activity                          [Clear all]    │
│  ── 14:32  Transcribed  "Call John about the meeting…"   │
│  ── 14:28  Transformed  "Rewrite as bullet points…"      │
│  ── 14:20  Transcribed  "The quarterly report needs…"    │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Settings Page

Two-column grid: `2fr 1fr`. Left column: accordion card. Right column: shortcuts reference panel.

Settings sections (in priority order for first-run setup):

1. **API Keys** — required to use any feature; completion dot turns green when ≥1 key saved
2. **Recording & Transcription** — device, method, provider, model
3. **Transformation** — presets, prompts, auto-run, endpoint overrides
4. **Keyboard Shortcuts** — editable bindings; completion dot always green (defaults exist)
5. **Output & Save** — text source, destinations, save button

Greenfield addition: **Setup Progress Ring** — a small SVG arc in the Settings heading that fills as sections are completed (`n/5`). Leverages goal-gradient effect — users accelerate when near done.

```
┌─────────────────────────────────┐
│  Settings   ⊙ 2 / 5 configured  │
│  ▼ API Keys            ● done   │
│  ▼ Recording           ● done   │
│  ▸ Transformation      ○ —      │
│  ▸ Keyboard Shortcuts  ○ —      │
│  ▸ Output & Save       ● done   │
└─────────────────────────────────┘
```

---

## 4. Component Specifications

### 4.1 Recording Orb

The single most important element in the app. Design rationale: users' primary mental model is "press to record, press to stop" — this is exactly what a circular toggle represents in hardware (tape deck, studio mic).

**States:**

| State | Background | Border | Glow | Icon | Label |
|---|---|---|---|---|---|
| Idle | `good-dim` 20% | `good` 28% | `good-dim` shadow | `●` | START |
| Recording | `bad-dim` 20% | `bad` 35% | `bad-dim` shadow | `■` | STOP |
| Busy | `teal-dim` | `teal` 35% | `teal-dim` shadow | `⟳` | — |
| Blocked | — | `ink-3` | none | `●` | disabled |

**Pulse ring:** A second layer (`record-orb-ring`) outside the button, `inset: -12px`, animates `scale(1) → scale(1.08)` at 2s infinite while recording. Communicates ongoing audio capture without requiring user attention.

**Waveform:** 12 vertical bars above the orb. Each bar has `--bar-i: 0–11` driving staggered `animation-delay`. Idle: `height: 4px`, `opacity: 0.25`. Active: animated `height: 4px → 30px` alternating.

> **Greenfield enhancement:** Connect waveform amplitude to real `AudioContext.createAnalyser()` data instead of CSS animation. This requires the `native-recording.ts` module to expose a readable stream or IPC message with raw amplitude values. The waveform then reflects actual microphone input, making it a functional level meter not just a decorative animation.

**Secondary actions:** Start / Stop / Cancel rendered as `.btn-ghost` / `.btn-cancel` in a flex row below the orb. Cancel is conditionally rendered — visible only while `isRecording === true`. This eliminates the 4-button decision problem while preserving explicit command access for power users.

### 4.2 Transform Card

Secondary to recording but equal in layout column weight. Keep visual weight lower by:
- No orb — just a standard full-width button
- Smaller `h2` label (same size, but no large graphical element draws the eye here first)
- Soft divider (`border-top: 1px solid --border`) between the two home cards at `<1020px`

**Greenfield enhancement:** Show last transform result summary beneath the button:

```
[ Transform Clipboard ]
────────────────────────
Last: "Meeting notes → 5 bullet points"   14:32 · 1.2s
```

This creates a **labor illusion** effect — showing that work happened builds confidence in the transformation quality.

### 4.3 Settings Accordion

**Trigger (section header):**
- Full-width `<button>` that resets default button styling
- Left: 7px completion dot (gray → green via `transition`)
- Center: section title
- Right: `▾` chevron rotates 180° on open via `transform: rotate(180deg)`
- Hover: subtle `background` lightening only — no border or shadow changes

**Body (section content):**
- `border-top: 1px solid --border` separates header from content
- `background: rgb(6 12 26 / 55%)` — slightly darker than the card, creates depth
- Padding: `--sp4` all sides

**Animation (not yet implemented — greenfield target):**
Replace the conditional render (`{isOpen && ...}`) with a CSS `grid-template-rows: 0fr → 1fr` transition for smooth open/close. Requires an inner wrapper `<div style="overflow: hidden">`.

```css
/* Target animation */
.settings-section-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 260ms ease;
}
.settings-section-body[data-open="true"] {
  grid-template-rows: 1fr;
}
.settings-section-body > div { overflow: hidden; }
```

### 4.4 Toast System

**Position:** Bottom-center. Fixed, `left: 50%; transform: translateX(-50%)`. `flex-direction: column-reverse` so newest toast appears on top.

**Entry animation:** `toast-rise` — `translateY(14px) scale(0.96) → translateY(0) scale(1)` over 220ms with spring easing.

**Left accent stripe:** `border-left: 3px solid` in the tone color (green / red / teal). No full background tint — keeps the toast readable on any background.

**Greenfield enhancement — dismiss progress bar:**

```
[✓  Saved settings successfully            ✕]
[░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ] ← 6s countdown bar
```

A `width: 100% → 0%` transition on a 3px bottom bar communicates time-until-dismiss. Reduces the cognitive cost of "did I read that in time?".

### 4.5 Navigation Tabs

Pill-shaped buttons (`border-radius: --r-full`) in a flex row within the app header.

| State | Style |
|---|---|
| Default | Transparent background, `--ink-2` text, `--border` border |
| Hover | `rgb(255 255 255 / 5%)` background, `--border-hi` border, `--ink` text |
| Active | `--teal-dim` background, `rgb(13 207 191 / 45%)` border, `--teal` text |

No underline, no bold weight change on active — the background+border+color change is sufficient signal.

### 4.6 Status Dot

Mono uppercase pill displayed next to recording card `h2`. States:

| State | Color | Animation |
|---|---|---|
| Idle | `--ink-3` | None |
| Recording | `--good` | `dot-blink` 1.1s infinite on `::before` |
| Busy | `--amber` | None |
| Error | `--bad` | None |

The `::before` circle uses `currentColor` so it always matches the text — no separate token needed.

---

## 5. Interaction Patterns

### 5.1 Stagger Entrance

All main panels use `[data-stagger]` with `--delay` CSS custom property:

| Element | Delay |
|---|---|
| App header | 40ms |
| Recording card | 100ms |
| Transform card | 160ms |
| Settings card | 220ms |

Animation: `translateY(8px) opacity(0) → translateY(0) opacity(1)` over 540ms with `cubic-bezier(0.2, 0.65, 0.2, 1)`.

### 5.2 Button Physics

All buttons use `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring physics) for the orb and `ease` for standard buttons. This creates distinct tactile identity:
- Orb: bouncy, physical → matches "pressing a hardware button"
- Standard buttons: smooth, digital → matches form-filling expectations

### 5.3 Keyboard Navigation

All interactive elements are fully keyboard accessible:
- `Tab` / `Shift+Tab` for focus traversal
- `Space` / `Enter` to activate buttons
- `focus-visible` outline: `2px solid --teal` with `2px offset` — consistent everywhere
- Accordion headers: `aria-expanded`, `aria-controls` attributes set correctly

### 5.4 Focus States (greenfield requirement)

Do not suppress `:focus` — only suppress `:focus:not(:focus-visible)` for pointer interactions. Current implementation correctly uses `:focus-visible` everywhere.

---

## 6. Greenfield Features (Not Yet Implemented)

These are design targets for future iterations, in priority order:

### P0 — High impact, relatively contained

| Feature | Rationale | Technical approach |
|---|---|---|
| **Real waveform amplitude** | Functional feedback, not just decorative | `AudioContext.createAnalyser()` → IPC amplitude messages → waveform bar heights |
| **Toast countdown bar** | Reduces "did I miss it" anxiety | `width` CSS transition on `::after` pseudo-element |
| **Smooth accordion animation** | Polished open/close | `grid-template-rows: 0fr → 1fr` CSS transition |
| **Last transform result display** | Labor illusion, confirms work happened | Passed as `lastTransformSummary` prop (already exists in state) |

### P1 — High impact, larger scope

| Feature | Rationale | Technical approach |
|---|---|---|
| **Command palette (⌘K)** | Power user shortcut to any action | New `CommandPalette` overlay component, global keydown listener |
| **Activity feed card** | Peak-end rule, history visibility | New `ActivityFeedReact` component, last N items from IPC events |
| **Setup progress ring** | Goal-gradient effect for first-run | SVG arc, computed from `apiKeysDone + recordingDone + ...` |
| **Full-screen recording mode** | Immersive focus during recording | CSS class toggle on `<body>`, hides nav and non-recording UI |

### P2 — Quality of life

| Feature | Rationale | Technical approach |
|---|---|---|
| **Light theme** | Accessibility, user preference | `[data-theme="light"]` token overrides in CSS |
| **Compact mode** | Small window / secondary screen use | `@media (max-height: 500px)` breakpoint |
| **Preset quick-switch chips** | One-tap preset change without entering settings | Chip row on home page, triggers `onSelectDefaultPreset` |
| **Onboarding overlay** | First-run users don't know what to configure | Step-by-step overlay using existing accordion sections |

---

## 7. Accessibility Requirements

Minimum bar for all new components:

- **WCAG 2.1 AA contrast** on all text/background pairs
- **`aria-live` regions** for: recording status, toast layer, save status
- **`aria-expanded`/`aria-controls`** on all accordion headers
- **`aria-label`** on icon-only buttons (orb button uses `aria-label="Start recording (toggle)"`)
- **`role="status"`** on recording status dot; `role="alert"` on error toasts
- **No `outline: none`** — always `focus-visible` outlines
- **Reduced motion support:**

```css
@media (prefers-reduced-motion: reduce) {
  .waveform--active span,
  .record-orb-ring--recording,
  [data-stagger],
  .toast-item {
    animation: none;
    transition-duration: 0ms;
  }
  [data-stagger] { opacity: 1; transform: none; }
}
```

---

## 8. Implementation Phases

### Phase A — Completed in this PR

- [x] New CSS design token system (`styles.css` rewrite)
- [x] Compact unified app header (`shell-chrome-react.tsx`)
- [x] Recording orb + waveform bars + adaptive secondary actions (`home-react.tsx`)
- [x] Settings accordion with completion dots (`app-shell-react.tsx`)
- [x] Bottom-center toast with slide-up animation
- [x] Three-tier button system (default / ghost / cancel)
- [x] Monospace labels for technical elements

### Phase B — Next iteration

- [ ] Real waveform amplitude via AudioContext IPC
- [ ] Toast countdown bar
- [ ] Smooth accordion CSS animation (`grid-template-rows`)
- [ ] Last transform result displayed on home card
- [ ] `prefers-reduced-motion` CSS block

### Phase C — Future

- [ ] Command palette (⌘K)
- [ ] Activity feed card
- [ ] Setup progress ring
- [ ] Light theme token set
- [ ] Full-screen recording mode

---

## 9. Decision Log

### Why amber + teal instead of the original orange + cyan?

The original `#f2a65a` (orange) and `#7dd3fc` (light blue) are common in AI app templates. They read as "default Tailwind palette" to experienced developers. The replacement pair:

- `--amber #e8a23a` — more saturated, jewel-toned, reads as deliberate
- `--teal #0dcfbf` — cooler and more distinctive than `#7dd3fc`; also provides better contrast on dark backgrounds at small sizes (status dots, shortcut combos)

Both pairs pass WCAG AA at their use sizes.

### Why hide the original `.hero` and `.top-nav` in CSS rather than deleting them?

The `.hero` and `.top-nav` class names are used in `shell-chrome-react.tsx` which is being replaced. Setting `display: none` in CSS lets the old markup co-exist during the transition without breaking anything. Once `shell-chrome-react.tsx` is fully migrated, these classes can be removed from both the CSS and the TSX.

→ **Done:** `shell-chrome-react.tsx` has been fully migrated to `.app-header`. The `.hero` / `.top-nav` CSS rules are safe to delete in a cleanup PR.

### Why is the orb button `toggleRecording` and not `startRecording`?

`toggleRecording` is the most resilient mapping for a single button: if the app state is somehow desynced (recording started from a different trigger), pressing toggle will always move to the opposite state. `startRecording` called while already recording is a no-op or error. The secondary row provides explicit `start` / `stop` for power users who want deterministic commands.

### Why put Cancel in a conditional render vs. always showing it disabled?

A disabled Cancel button while idle creates noise in the button row and adds a target users will accidentally tap. Hiding it entirely when idle reduces the visual weight of the secondary row to just Start + Stop — a cleaner affordance. The Cancel action is still reachable via keyboard shortcut at any time.
