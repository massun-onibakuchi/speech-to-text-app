## Comprehensive Design Analysis: Vocalize STT Desktop Application

Source code: resources/artifacts-sample.zip

### 1. Overarching Design Philosophy

The application follows a **tool-first, density-optimized** design philosophy inspired by professional macOS utilities like Raycast and Linear. The core principle is: minimize visual noise while maximizing information density within a compact, fixed-dimension window. Every pixel serves a functional purpose. The interface is designed for **power users who perform speech-to-text dozens of times per day**, so speed-of-comprehension and reduced click-distance are paramount. The entire application lives in a single viewport (`h-screen`) with no page scrolling -- only content regions scroll independently.

---

### 2. Layout Architecture

#### 2.1 Root Structure -- Vertical Flex Column

The outermost container is a **full-viewport vertical flex column** (`flex h-screen flex-col bg-background`) with three horizontal bands:

| Band | Element | Height | Purpose
|-----|-----|-----|-----
| Top | `<header>` | ~40px (auto from `py-2`) | Title bar with app identity + global status indicator
| Middle | Main content `<div>` | `flex-1 overflow-hidden` | The entire working area
| Bottom | `<StatusBar>` | ~28px (auto from `py-1.5`) | Persistent system-info footer


#### 2.2 Main Content -- Horizontal Split

The middle band uses a **horizontal flex row** (`flex flex-1 overflow-hidden`) divided into two panels:

- **Left Panel** (Recording) -- Fixed width `w-[320px]`, a vertical flex column (`flex flex-col`) subdivided into:

- **Recording Area** (`flex-1`): Vertically and horizontally centered (`items-center justify-center`) recording button with surrounding context.
- **Waveform Strip** (`h-16`): Fixed 64px tall audio visualization bar at the bottom.



- **Right Panel** (Content) -- Fills remaining space (`flex flex-1 flex-col`), contains a full-height `<Tabs>` component that stretches via `flex flex-1 flex-col`.


#### 2.3 Why This Layout Works

The fixed left-panel width creates a **predictable motor-memory target** for the recording button. Users always know where to click without looking. The right panel fills remaining space, giving maximum room to textual content (activity feed, profile editing, settings) which benefits from width. The split is conceptually **controls | content**, mirroring the mental model of "act, then observe."

---

### 3. Color System

All colors use the **OKLCH** color space for perceptual uniformity. The palette consists of exactly **5 semantic color families**:

#### 3.1 Core Palette

| Token | OKLCH Value | Visual | Role
|-----|-----|-----|-----
| `--background` | `oklch(0.13 0.005 260)` | Very dark navy-charcoal | Base surface. L=0.13 with a hint of blue (hue 260) prevents the "dead black" feeling while staying extremely dark.
| `--foreground` | `oklch(0.95 0 0)` | Near-white | Primary text. L=0.95 (not 1.0) reduces harshness against the dark bg. Achromatic.
| `--primary` | `oklch(0.65 0.2 145)` | Muted emerald green | All interactive accents: buttons, active states, ring focus, section icons. Hue 145 is green. Chroma 0.2 keeps it saturated but not neon.
| `--destructive` | `oklch(0.55 0.2 25)` | Warm red | Errors, failed statuses, delete actions. Hue 25 = red-orange.
| `--recording` | `oklch(0.65 0.25 25)` | Brighter warm red | Recording-active state exclusively. Higher chroma (0.25) than destructive to create urgency/energy. Same hue family as destructive but brighter L for visibility.


#### 3.2 Neutral Tiers (all near-achromatic with subtle blue hue 260)

| Token | Lightness | Usage
|-----|-----|-----|-----
| `--sidebar` | 0.11 | Deepest surface
| `--background` | 0.13 | Root background
| `--card` | 0.16 | Elevated surfaces (cards, job items)
| `--popover` | 0.18 | Floating surfaces
| `--muted` | 0.20 | Disabled backgrounds, subtle fills
| `--secondary` / `--accent` / `--input` | 0.22 | Interactive backgrounds, input fields
| `--border` | 0.25 | All dividers and outlines
| `--muted-foreground` | 0.55 | Secondary text, labels, timestamps
| `--secondary-foreground` | 0.88 | Brighter secondary text
| `--foreground` | 0.95 | Primary text


This creates a **7-step lightness ladder** from 0.11 to 0.25 for surfaces, enabling subtle but perceptible depth layering without any gradients. Every step increases by ~0.02-0.04 L, staying within the low-luminance range where human perception is most sensitive to differences.

#### 3.3 Semantic Status Colors

| Token | Value | Usage
|-----|-----|-----|-----
| `--success` | Same as `--primary` (green) | Completed jobs, connection status
| `--warning` | `oklch(0.75 0.15 80)` (amber) | Default-profile star, caution states
| `--recording` | `oklch(0.65 0.25 25)` (red) | Active recording pulse, waveform bars, timer text
| `--destructive` | `oklch(0.55 0.2 25)` (darker red) | Failed job borders, delete hover


The intentional overlap of `--success` with `--primary` means the green accent does double duty -- it signals both "interactive" and "healthy/complete." This reduces the total number of hues a user must mentally parse.

---

### 4. Typography System

#### 4.1 Font Families

- **Primary (sans)**: Inter -- chosen for its exceptional readability at small sizes (11-14px), extensive weight range, and tabular-number OpenType feature. Applied via `font-sans` class.
- **Monospace**: Geist Mono -- used for technical data: API key inputs, provider/model identifiers, durations, timestamps. Applied via `font-mono` class on specific elements.


#### 4.2 Type Scale

The application uses an **extremely compact type scale** appropriate for a utility app:

| Size | Tailwind Class | Where Used
|-----|-----|-----|-----
| 9px | `text-[9px]` | Tertiary labels (e.g. "Clipboard" under quick action)
| 10px | `text-[10px]` | Timestamps, status bar metadata, badge text, shortcut labels, profile model names
| 11px | `text-[11px]` | Profile descriptions, helper text
| 12px | `text-xs` (default) | Activity feed body text, settings labels, form labels, tab triggers
| 14px | `text-sm` | Section headings, profile titles, recording state labels
| 18px | `text-lg` | Recording timer (monospace, the single largest text element)


This 6-step scale is intentionally tight. The largest text in the entire app is 18px (the recording timer) -- there are no hero headings. This reflects the tool's identity: **information density over visual drama**.

#### 4.3 Typography Patterns

- **Uppercase tracking**: Section micro-labels ("Quick Actions") use `text-[10px] uppercase tracking-wider font-medium` for visual separation without consuming vertical space.
- **Line clamping**: Transcript and transformed text use `line-clamp-2` to prevent individual job cards from dominating the feed.
- **Leading**: Body text uses `leading-relaxed` for readability in the activity feed cards.
- **Tabular numbers**: The recording timer uses `tabular-nums` (via `font-mono`) so digits don't shift width as they change.


---

### 5. Component Architecture

#### 5.1 Component Tree

```plaintext
Page
 └── AppShell (client component, owns all state)
      ├── Header (inline in AppShell)
      ├── Left Panel
      │    ├── RecordingButton
      │    ├── Quick Actions (inline)
      │    └── Waveform Visualization (inline)
      ├── Right Panel
      │    └── Tabs
      │         ├── ActivityFeed
      │         ├── ProfilesPanel
      │         └── SettingsPanel
      └── StatusBar
```

#### 5.2 RecordingButton

**Three visual states, one button:**

- **Idle**: Green background (`bg-primary`), microphone icon. Helper text "Click to record".
- **Recording**: Red background (`bg-recording`), square/stop icon. Two concentric animated rings: `animate-ping` (outer, fading) and `animate-pulse` (inner, breathing). Displays monospace timer and cancel link.
- **Processing**: Muted background (`bg-muted`), microphone icon, `opacity-60 cursor-not-allowed`. Text "Processing..." with `animate-pulse`.


The button is `size-20` (80px) -- large enough for confident targeting, small enough to not dominate. The pulsing rings extend to `-inset-3` (6px beyond the button edge), creating a visual radius of ~92px during recording that draws peripheral attention without obscuring UI.

#### 5.3 ActivityFeed

Each job is a `rounded-lg border bg-card p-3` card containing:

- **Status row**: Icon (spinning for processing, green check for success, red X for failed) + Badge + profile name + duration + timestamp.
- **Content section** (conditional): Raw transcript as `text-muted-foreground`, transformed text in a `bg-secondary/50 p-2 rounded` inset block.
- **Hover actions**: Copy and Paste buttons per text block, hidden by default (`opacity-0`) and revealed on hover via `group-hover/text:opacity-100`. Uses nested `group/text` for independent hover zones.


Border colors shift semantically: `border-destructive/30` for failed, `border-success/20` for succeeded.

#### 5.4 ProfilesPanel

Dual-mode list items:

- **View mode**: Clickable card with title, badges (Default/Active), provider/model monospace tag, and truncated system prompt. Hover reveals star/edit/delete icon row.
- **Edit mode**: Expands in-place to show Title input, Provider/Model select grid (2-col), System Prompt textarea, User Prompt input with `{{input}}` placeholder syntax, and Save/Cancel buttons. Edit form has a distinctive `border-primary/40` highlight.


Active profile gets `border-primary/40 bg-primary/5` tint. Default profile shows a filled star with `text-warning fill-warning`.

#### 5.5 SettingsPanel

Organized into **6 icon-headed sections** separated by `<Separator>`:

1. **Speech-to-Text** (Mic icon): Provider select, model select (dynamic options based on provider), API key input with show/hide toggle, base URL override.
2. **LLM Transformation** (Cpu icon): Provider (locked to Google with badge "Google only in v1"), model select, API key, base URL.
3. **Audio Input** (Volume2 icon): Device select dropdown.
4. **Output Actions** (Clipboard icon): 4 toggle switches organized into two groups (Transcript Output / Transformed Output), each with Copy-to-clipboard and Paste-at-cursor.
5. **Global Shortcuts** (Keyboard icon): 6 shortcut bindings displayed as label + `<Kbd>` component chips.


All form elements use `h-8 text-xs` (height 32px, 12px font) for density. API key fields use `font-mono` for the input text.

#### 5.6 StatusBar

A thin horizontal bar (`py-1.5`) with two flex-justified groups:

- **Left**: STT provider/model (monospace), LLM provider, audio device name -- all at `text-[10px]`.
- **Right**: Active profile name in `text-primary`, connection indicator (Wifi/WifiOff icon + "Ready"/"Offline" label).


#### 5.7 Waveform Visualization

32 vertical bars (`w-[3px] rounded-full`) centered in a `h-16` strip. During recording, bars get random heights (4-32px) with `bg-recording/80`. When idle, heights follow a sine curve (`Math.sin(i * 0.3) * 6 + 8`) with `bg-muted-foreground/20`, creating a gentle static waveform pattern.

---

### 6. Spacing and Sizing Patterns

#### 6.1 Consistent Spacing Scale

| Pattern | Value | Usage
|-----|-----|-----|-----
| Section gap | `gap-6` (24px) | Between settings sections
| Card gap | `gap-2` (8px) | Between activity feed items, profile items
| Inner card padding | `p-3` (12px) | All cards in activity and profiles
| Settings section padding | `p-4` (16px) | Settings and profiles scroll containers
| Tab content padding | `p-3` (12px) | Activity feed container
| Form element spacing | `space-y-2` (8px) | Between label and input within a field
| Inter-field spacing | `space-y-4` (16px) | Between distinct form fields
| Header/footer padding | `px-4 py-2` / `px-4 py-1.5` | Horizontal bars


#### 6.2 Icon Sizing

Three consistent icon sizes throughout:

| Size | Tailwind | Context
|-----|-----|-----|-----
| 3px / 3.5px | `size-3` / `size-3.5` | Inline icons in labels, status bar, action buttons
| 4px | `size-4` | Section heading icons, status icons in feed
| 6px | `size-6` | App logo container only
| 7px | `size-7` | Recording button icon only (proportional to the 80px button)


---

### 7. Interactive Patterns

#### 7.1 State Transitions

- **Hover**: `hover:bg-accent` for buttons, `hover:bg-primary/90` for primary button, `hover:text-foreground` for icon buttons. All use `transition-colors`.
- **Recording pulse**: CSS `animate-ping` (expanding ring) + `animate-pulse` (breathing glow) for the recording button's surrounding rings.
- **Processing spinner**: `animate-spin` on `Loader2` icon for in-progress jobs.
- **Fade-in actions**: `opacity-0 group-hover:opacity-100 transition-opacity` for per-card action buttons.


#### 7.2 Keyboard and Focus

- Recording button has `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` for keyboard accessibility.
- Profile cards have `tabIndex={0}` and `onKeyDown` handlers accepting Enter/Space for activation.
- Global shortcuts displayed via `<Kbd>` component with visual key caps (e.g., `Ctrl` `Shift` `Space`).


#### 7.3 Progressive Disclosure

- Activity feed cards show copy/paste actions only on hover (hidden by default).
- Profile cards show star/edit/delete controls only on hover.
- Profile edit mode expands in-place, replacing the card view.
- API key fields default to `type="password"` with an eye toggle.


---

### 8. Accessibility Patterns

- **ARIA labels**: All icon-only buttons carry explicit `aria-label` attributes (e.g., "Stop recording", "Copy transcript", "Toggle key visibility", "Set as default").
- **Semantic elements**: `<header>`, `<footer>`, `<main>` (implicit via page structure), `<section>` for settings groups.
- **Focus management**: `focus-visible` ring on the primary action (recording button). Tab-accessible profile cards.
- **Color-not-sole-indicator**: Status is conveyed via icon shape (check, X, spinner, clock) AND color AND text badge, not color alone.
- **Contrast**: Foreground text (L=0.95) on background (L=0.13) yields an approximate contrast ratio of ~15:1, well exceeding WCAG AAA requirements. Muted foreground (L=0.55) on background (L=0.13) yields ~5.5:1, exceeding AA.


---

### 9. Responsive and Overflow Behavior

The application is designed for a **fixed desktop window** (as specified in the normative spec). Key overflow strategies:

- The root container is `h-screen` with `overflow-hidden` on the main content div, preventing any body scrolling.
- Activity feed, profiles list, and settings all use `<ScrollArea>` (Radix-based, custom-styled scrollbar) for independent vertical scrolling.
- Text overflow is handled via `truncate` (single-line ellipsis) for profile names and `line-clamp-2` for transcript previews.
- The left panel's fixed `w-[320px]` ensures the recording button never gets squeezed. The right panel flexes to fill.


---

### 10. How Elements Create Cohesion

The design achieves unity through three deliberate constraints:

1. **One accent color**: Green (`--primary`) appears as the recording button fill, tab underlines, section heading icons, focus rings, active profile border tint, status bar active profile text, and success indicators. This single hue threading creates visual continuity across all panels.
2. **Consistent surface stepping**: Every elevated element (card, popover, header, footer) is exactly one step brighter on the lightness ladder. Cards (0.16) sit on background (0.13). Inputs (0.22) sit on cards (0.16). This creates depth without shadows or gradients.
3. **Micro-typography uniformity**: The 10px/monospace pattern is used identically for timestamps, provider/model tags, durations, and status bar metadata. A user can pattern-match "small monospace = system metadata" across any part of the interface instantly.
