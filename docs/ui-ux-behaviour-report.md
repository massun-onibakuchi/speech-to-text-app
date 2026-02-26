# UI/UX Behaviour Report (Current Implementation)

## Scope
- Codebase reviewed: renderer UI implementation and related tests in `src/renderer/`
- Focus: current user-facing behavior, interaction patterns, feedback loops, and UX improvement opportunities
- Skills applied: `ux-design` (behavior + psychology framing), `frontend-design` (visual/system design recommendations)
- Design recommendation mode (updated): greenfield redesign allowed; backward compatibility is not required

## Assumptions (for UX framing)
- Primary user: operator/power user running speech-to-text + transform workflows repeatedly.
- Primary task: trigger recording/transform quickly, then configure provider/audio/transformation settings when blocked or tuning behavior.
- Constraints inferred from code: Electron desktop app, keyboard-heavy usage, minimal-latency interaction expectations.

## Evidence Sources (implementation)
- `src/renderer/renderer-app.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/shell-chrome-react.tsx`
- `src/renderer/home-react.tsx`
- `src/renderer/settings-*.tsx`
- `src/renderer/styles.css`
- `src/renderer/renderer-app.test.ts`
- `src/renderer/home-react.test.tsx`

## Current UI/UX Behaviour (as implemented)

### 1. App structure and navigation
- Two-page shell: `Home` and `Settings` tabs rendered in one React tree (`src/renderer/app-shell-react.tsx:155`, `src/renderer/shell-chrome-react.tsx:31`).
- Page switching hides inactive content with `display: none` (`src/renderer/app-shell-react.tsx:163`, `src/renderer/styles.css:261`).
- Returning to `Home` triggers API-key status refresh retries (3 attempts, 250ms delay) to reduce stale blocked states (`src/renderer/renderer-app.tsx:249`, `src/renderer/renderer-app.tsx:266`).

### 2. Home command behavior (recording + transform)
- Recording controls expose `Start / Stop / Toggle / Cancel` with per-button busy labels (`src/renderer/home-react.tsx:28`, `src/renderer/home-react.tsx:119`).
- Only one command can be pending at a time; other commands disable during pending execution (`src/renderer/home-react.tsx:35`, `src/renderer/renderer-app.tsx:290`).
- Transform action is blocked when Google key is missing; recording is blocked when current STT provider key is missing (`src/renderer/blocked-control.ts:14`, `src/renderer/blocked-control.ts:36`).
- Blocked controls show reason + next step + `Open Settings` deep-link CTA (`src/renderer/home-react.tsx:93`, `src/renderer/home-react.tsx:139`).
- Home status badge supports `Idle / Recording / Busy / Error` and is announced as live status (`src/renderer/home-react.tsx:83`, `src/renderer/home-status.ts:15`).

### 3. Feedback and state communication
- Toast system supports tones (`info/success/error`), auto-dismiss (~6s), manual dismiss, max visible 4 (`src/renderer/renderer-app.tsx:88`, `src/renderer/renderer-app.tsx:124`, `src/renderer/app-shell-react.tsx:326`).
- Toasts use `role="status"` or `role="alert"` and live region (`src/renderer/app-shell-react.tsx:329`, `src/renderer/app-shell-react.tsx:336`).
- Settings save feedback is shown inline via `#settings-save-message` with `aria-live="polite"` (`src/renderer/settings-save-react.tsx:36`).
- API key save/test feedback is split per provider plus aggregate save message (`src/renderer/settings-api-keys-react.tsx:162`, `src/renderer/settings-api-keys-react.tsx:175`).

### 4. Settings editing model (important UX detail)
- Mixed persistence model:
  - Some fields autosave (non-secret settings like provider/model/auto-run/output) via 450ms debounce (`src/renderer/renderer-app.tsx:85`, `src/renderer/renderer-app.tsx:227`, `src/renderer/renderer-app.tsx:240`).
  - Some fields remain draft until explicit `Save Settings` (transformation prompts, shortcuts, endpoint overrides, preset name/model) via `saveSettingsFromState()` (`src/renderer/settings-mutations.ts:370`).
  - API keys are always explicit save actions (single-provider or bulk) (`src/renderer/settings-api-keys-react.tsx:65`, `src/renderer/settings-mutations.ts:78`, `src/renderer/settings-mutations.ts:121`).
- Autosave failure rolls back to last persisted settings and moves user to `Settings` with error toast/message (`src/renderer/renderer-app.tsx:210`).

### 5. Keyboard behavior
- Pressing `Enter` inside input/select fields within `.settings-form` triggers Save; textareas are excluded (`src/renderer/renderer-app.tsx:349`).
- This behavior is explicitly tested (`src/renderer/renderer-app.test.ts:196`).

### 6. Settings information architecture
- Settings page packs many controls into one long form card + a separate shortcuts reference panel (`src/renderer/app-shell-react.tsx:190`, `src/renderer/app-shell-react.tsx:324`).
- Sections present:
  - Provider API keys
  - Recording (audio source/provider/model)
  - Transformation (profiles, prompts, auto-run)
  - Endpoint overrides
  - Shortcut editor (8 editable fields)
  - Output behavior
  - Save actions

### 7. Visual design system (current)
- Strong dark “control room” style with layered gradients, card glassmorphism, serif headings, blue/orange accents (`src/renderer/styles.css:1`, `src/renderer/styles.css:118`, `src/renderer/styles.css:153`).
- Staggered panel entrance animations (`src/renderer/styles.css:467`).
- Responsive layout breaks to single-column on smaller widths (`src/renderer/styles.css:481`, `src/renderer/styles.css:495`).

## What Works Well (Current Strengths)
- Clear blocked-state messaging with next steps and deep-link CTA reduces dead ends (good recovery UX).
- Strong feedback coverage: status badge, inline messages, and toasts are all present.
- Command concurrency guard prevents conflicting actions and accidental double-triggering.
- Settings validation blocks invalid prompt/shortcut saves and shows targeted errors (`src/renderer/settings-mutations.ts:377`).
- Visual theme is intentional and more distinctive than default enterprise UI styling.

## UX Risks / Friction (Observed)

### 1. Mixed autosave vs manual-save behavior is not obvious
- Different sections persist differently, but the UI does not clearly label which controls autosave vs require explicit save.
- This creates uncertainty and re-checking behavior (cognitive load), especially after editing multiple sections.

### 2. Settings page has high density and long serial scan path
- Users must scan a long stacked form with multiple action rows and repeated button styles.
- Shortcut editor alone contains many text fields, increasing decision fatigue and error likelihood.

### 3. Home page hides useful progress/history context
- `lastTransformSummary` is tracked in state (`src/renderer/renderer-app.tsx:74`, `src/renderer/renderer-app.tsx:275`) but not rendered by `HomeReact` (test confirms no `Last transform:` text, `src/renderer/home-react.test.tsx:72`).
- Users get transient toasts but limited persistent “what just happened?” context.

### 4. Some destructive or impactful actions lack intentional friction / clarity
- `Remove Profile` is one click and does not visibly confirm intent (`src/renderer/settings-transformation-react.tsx:99`).
- `Restore Defaults` resets output + shortcuts together, but UI label does not communicate that scope clearly (`src/renderer/settings-output-react.tsx:16`, `src/renderer/settings-output-react.tsx:120`).

### 5. Motion/accessibility polish gaps
- Animations exist, but no `prefers-reduced-motion` fallback is present (`src/renderer/styles.css:467`).
- Page tabs use `aria-pressed` buttons instead of a more conventional tab pattern (`tablist`/`tab`/`tabpanel`), which may reduce SR clarity for section switching (`src/renderer/shell-chrome-react.tsx:31`).
- Error messages are visible, but fields do not expose explicit `aria-invalid` / `aria-describedby` links.

### 6. Visual hierarchy is good overall, but action priority is flat inside Settings
- Most buttons share similar styling weight, so “danger”, “secondary”, and “primary” actions are not visually differentiated.

## Recommended UI/UX Improvements (Prioritized, Greenfield Redesign)

## 1) Replace Home + Settings split with a task-first workspace
- New top-level layout:
  - Left rail: `Run`, `Profiles`, `Providers`, `Audio`, `Output`, `Advanced`
  - Main canvas: active task panel
  - Right rail: live status + recent activity + errors
- Make `Run` the primary landing workspace (not just buttons): show recording, transform, prerequisites, and recent outcomes in one place.
- Rationale (`ux-design`): reduces context switching and banner blindness; creates persistent visual anchors for the primary task.

## 2) Unify persistence model (remove mixed autosave/manual-save ambiguity)
- Pick one model for non-secret settings: `explicit save with dirty tracking` across all editable settings.
- Keep secrets (API keys) as explicit save, but move into a dedicated Providers screen with stronger status cards.
- Add global sticky save bar: `X unsaved changes • Review • Save • Discard`.
- Rationale (`ux-design`): removes cognitive load caused by hidden persistence rules.
- Tradeoff: slightly more clicks, but far less ambiguity and fewer accidental rollbacks.

## 3) Redesign Run screen as an operational dashboard (not a button list)
- Replace the current two cards with a three-zone dashboard:
  - `Capture` (recording controls + recording status + mic source)
  - `Transform` (default profile, run action, auto-run status)
  - `Readiness` (provider keys, permissions, audio availability)
- Surface persistent recent results (`lastTransformSummary` + recent activity list) instead of relying on transient toasts only.
- Add “fix now” CTAs in readiness cards (e.g., `Add Google key`, `Select microphone`).
- Rationale (`ux-design`): goal-gradient + progressive disclosure; users can resolve blockers in place.

## 4) Redesign profile editing into a dedicated “Profiles” studio
- Split profile management from general settings.
- Use a two-pane editor:
  - Left: profile list with default badge, quick duplicate, reorder, delete
  - Right: editor for name/model/prompts, validation, preview of `{{text}}` interpolation
- Add inline destructive confirmation for delete and “duplicate profile” as the primary branching action.
- Rationale (`ux-design`): reduces decision fatigue and prevents accidental destructive actions.
- Rationale (`frontend-design`): creates a memorable, editor-like experience instead of a generic form block.

## 5) Simplify Providers and Audio into status-card flows
- `Providers` screen:
  - one card per provider with connection status, masked key state, test action, save action, and error details
  - support “Paste & test” flow before save
- `Audio` screen:
  - microphone source picker, sample rate, refresh, and diagnostics in one place
  - show current selected device and detection result prominently
- Rationale (`ux-design`): chunking related tasks lowers cognitive load and improves trust.

## 6) Rebuild visual system with stronger hierarchy (full redesign allowed)
- Keep the “control room” concept, but redesign the composition:
  - denser left nav + large content canvas
  - clearer primary actions and status surfaces
  - distinct danger/secondary/utility button variants
- Typography:
  - keep a serif display voice for page titles, pair with a cleaner mono or technical sans for controls/status labels
- Motion:
  - replace generic stagger-on-all-panels with contextual motion (screen transition + status pulse only)
  - include `prefers-reduced-motion` support from the start
- Rationale (`frontend-design`): move from polished card stack to a differentiated desktop operator tool aesthetic.

## Suggested Visual Direction (Greenfield)
- Direction: `editorial control-room + instrument panel`
- Memorable element:
  - a persistent “Readiness Strip” at the top of the workspace showing `Mic`, `STT`, `LLM`, `Output`, each with live state and one-click fix actions.
- Layout character:
  - asymmetric multi-panel desktop layout
  - compact technical labels + high-contrast action zones
  - restrained but intentional amber/cyan accents for busy/ready states
- Interaction character:
  - command-focused keyboard affordances
  - persistent activity timeline (not ephemeral-only feedback)
  - explicit task states: `Ready`, `Blocked`, `Running`, `Needs attention`

## Verification Plan for UX Changes (testable, not just aesthetic)
- Measure task completion time for:
  - “Fix blocked transform due to missing Google key”
  - “Change output behavior and persist correctly”
  - “Edit prompt + save without uncertainty”
- Track user errors:
  - accidental profile removals
  - repeated saves after autosaved fields
  - failed saves due to hidden validation errors
- Add UI tests for:
  - global dirty-state save bar behavior
  - readiness strip state rendering and fix-now CTAs
  - profile studio delete confirmation and duplicate flow
  - reduced-motion behavior class/application

## Notes
- React form control patterns used in current implementation are broadly aligned with controlled component guidance (verified via Context7 React docs).
- This report now assumes a redesign can break backward UI compatibility and restructure screens/flows substantially.
- This task only updates documentation/reporting; no behavior changes were implemented in code.
