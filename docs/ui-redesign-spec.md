# UI Redesign Spec (Greenfield, No Backward-Compat UI Constraint)

## Purpose
- Define a concrete, implementable UI/UX redesign for the Electron renderer.
- Replace the current `Home + Settings` split with a task-first workspace.
- Preserve product capabilities, but redesign flows and information architecture.

## Product Goal
- Primary task: run capture/transformation quickly and confidently.
- Secondary task: configure providers/audio/profiles/output without ambiguity about save state.

## UX Principles (selected)
- Visual anchors: persistent readiness/status surfaces.
- Progressive disclosure: move infrequent settings to dedicated screens.
- Cognitive load reduction: one persistence model for non-secret settings.
- Intentional friction: confirmations for destructive actions.
- Trust via feedback: persistent state/history, not toast-only feedback.

## Top-Level Information Architecture
- `Run` (default landing)
- `Profiles`
- `Providers`
- `Audio`
- `Output`
- `Advanced`

## Global Layout (Desktop-first)
- Left rail (navigation)
  - App title
  - Primary sections
  - Global save state indicator
- Main canvas (current screen)
  - Screen header
  - Primary task content
- Right rail (persistent context)
  - Readiness strip/cards
  - Recent activity timeline
  - Current errors / warnings

## Global Interaction Model
- Non-secret settings: explicit save + dirty tracking.
- Secret values (API keys): explicit save per provider card.
- Global sticky save bar appears when dirty:
  - `N unsaved changes`
  - `Review changes`
  - `Discard`
  - `Save all`
- Toasts remain for transient feedback, but every critical result also appears in persistent surfaces (right rail + inline status).

## Screen Specs

## 1) Run Screen (Operational Dashboard)
### Goal
- Execute recording/transform workflows and resolve blockers in place.

### Layout
- Top: `Readiness Strip`
  - `Mic`
  - `STT`
  - `LLM`
  - `Output`
  - Each tile shows state: `Ready`, `Blocked`, `Running`, `Needs attention`
- Main grid (3 panels)
  - `Capture`
  - `Transform`
  - `Session Activity`

### Capture Panel
- Primary controls:
  - `Start`, `Stop`, `Toggle`, `Cancel`
- Status:
  - recording state badge
  - current microphone source
  - pending action label
- Inline blockers:
  - missing STT key
  - permission issue
  - unavailable audio source
- CTA examples:
  - `Open Providers`
  - `Open Audio`

### Transform Panel
- Shows:
  - default profile name
  - auto-run status
  - transform action button
  - last transform summary (persistent)
- Inline blockers:
  - missing Google key
  - invalid profile prompt
- CTA examples:
  - `Open Providers`
  - `Open Profiles`

### Session Activity Panel
- Timeline list of recent events:
  - command dispatched
  - transform success/failure
  - save actions
  - hotkey errors
- Filters (optional later): `All`, `Errors`, `Commands`

## 2) Profiles Screen (Dedicated Studio)
### Goal
- Create, edit, duplicate, and manage transformation profiles without form clutter.

### Layout
- Split pane
  - Left pane: profile list + actions
  - Right pane: profile editor

### Left Pane (Profile List)
- Rows show:
  - profile name
  - default badge
  - model
  - validation state indicator
- Actions:
  - `New profile`
  - `Duplicate`
  - `Set as default`
  - `Delete`

### Right Pane (Profile Editor)
- Fields:
  - Profile name
  - Model
  - System prompt
  - User prompt
- Validation:
  - inline error messages
  - `{{text}}` placeholder check
- Preview module:
  - sample transcript input
  - rendered prompt preview (read-only)

### Destructive Action Rules
- `Delete` requires confirmation if more than one profile exists.
- Block delete when only one profile remains.

## 3) Providers Screen
### Goal
- Make provider setup/test/save understandable and status-driven.

### Layout
- One card per provider (`Groq`, `ElevenLabs`, `Google`)

### Provider Card Content
- Header:
  - provider name
  - connection status chip
  - saved/not-set state
- Body:
  - masked API key input
  - show/hide toggle
  - `Paste & Test`
  - `Save`
  - result/status area (test + save feedback)
- Footer:
  - docs/help link (optional)

### Interaction Rules
- Test never persists key.
- Save persists current input only.
- Bulk save removed in redesign (reduce ambiguity and mixed intents).

## 4) Audio Screen
### Goal
- Centralize microphone selection and capture diagnostics.

### Layout
- `Device Selection` card
  - audio source dropdown
  - refresh sources
  - selected source summary
- `Capture Settings` card
  - recording method
  - sample rate
- `Diagnostics` card
  - source detection message
  - permission hint
  - failure guidance

## 5) Output Screen
### Goal
- Configure output behavior clearly, with plain language and preview.

### Layout
- `What text to output` card
  - `Raw dictation`
  - `Transformed text`
- `Where to send it` card
  - `Copy to clipboard`
  - `Paste at cursor`
- `Behavior summary` card (generated sentence)
  - Example: “After capture, transformed text will be copied and pasted at cursor.”
- `Restore defaults` action (scoped and clearly labeled)

## 6) Advanced Screen
### Goal
- Keep low-frequency expert settings out of main task flows.

### Sections
- Endpoint overrides (STT / LLM)
- Shortcut editor
- Diagnostics / debug info (optional future)

### Rules
- Advanced sections collapsed by default.
- Validation errors auto-expand the relevant section.

## Persistent Right Rail Spec
## A) Readiness Panel
- Mirrors current blocker logic but always visible.
- States per tile:
  - `Ready`
  - `Blocked`
  - `Running`
  - `Needs attention`
- Each blocked tile includes a one-click route CTA.

## B) Activity Timeline
- Reuses current activity feed concept but visible persistently.
- Retain most recent 20 events in UI.
- Error items stay pinned until dismissed.

## C) Error/Warning Stack
- Aggregated active issues:
  - validation errors (if on editable screen)
  - runtime command failure
  - autosave/save failures (if any legacy paths remain during migration)

## Keyboard & Accessibility Contract
- Global:
  - `Cmd/Ctrl+S` => Save all dirty non-secret changes
  - `Esc` => close dialogs / clear inline confirmations
- Run screen:
  - number shortcuts `1-4` map to capture actions (optional, feature-flagged)
- Navigation:
  - left rail arrow-key navigation + Enter activate
- Forms:
  - all invalid fields use `aria-invalid`
  - errors linked via `aria-describedby`
  - screen heading + region labels for each panel
- Motion:
  - `prefers-reduced-motion` disables decorative transitions

## Visual System Direction
- Theme: editorial control-room + instrument panel
- Typography
  - Display serif for screen headers
  - technical sans/mono for labels, statuses, logs
- Color roles
  - neutral surfaces
  - cyan = info/ready
  - amber = busy/in-progress
  - red = blocked/error
  - green = success (sparingly)
- Buttons
  - primary, secondary, utility, danger variants
- Status chips
  - standardized shape and icon slot

## Component Inventory (Implementation-Oriented)
- `WorkspaceShell`
- `LeftNavRail`
- `GlobalSaveBar`
- `RightStatusRail`
- `ReadinessStrip`
- `ReadinessTile`
- `ActivityTimeline`
- `RunCapturePanel`
- `RunTransformPanel`
- `ProfileListPane`
- `ProfileEditorPane`
- `ProviderCard`
- `AudioDeviceCard`
- `OutputSummaryCard`
- `AdvancedAccordion`
- `ConfirmInlineAction` or `ConfirmDialog`

## Data/State Contract Changes (UI-facing)
- Add UI-level dirty tracking by section/screen.
- Expose normalized readiness state from renderer orchestration (instead of inferring in multiple components).
- Expose persistent activity feed to the UI shell (already partially available in state).
- Remove dependence on mixed autosave semantics for redesigned flows.

## Migration Plan (Small PRs)
1. Build `WorkspaceShell` with left/main/right rails (no feature moves yet).
2. Add persistent right rail (`Readiness`, `Activity`) using existing state.
3. Implement `Run` dashboard and route current command actions into it.
4. Implement `Providers` screen and remove API key form from old Settings surface.
5. Implement `Profiles` studio.
6. Implement `Audio` and `Output` screens.
7. Move endpoint overrides + shortcuts into `Advanced`.
8. Remove legacy `Home` / `Settings` screens.

## Test Plan (Minimum)
- Unit tests
  - readiness state mapping
  - dirty-state aggregation
  - profile delete guard
- Component tests
  - provider card test/save flows
  - global save bar visibility and actions
  - run screen blocker CTA routing
- E2E
  - missing Google key -> fix in Providers -> return to Run -> transform enabled
  - edit profile prompt -> save -> run transform

## Open Decisions (to resolve before implementation)
- Keep bulk API key save or remove entirely? (spec recommends remove)
- Keep manual Enter-to-save in forms, or standardize on `Cmd/Ctrl+S` + explicit buttons only?
- Should profile preview call a local formatter only, or simulate full prompt assembly?

