# UI Design Guidelines (Renderer)

Where: `docs/ui-design-guidelines.md`  
What: Canonical design principles, component contracts, and implementation rules for renderer UI.  
Why: Keep all new UI work consistent with the current codebase and prevent style drift.

## 1. Source-of-truth files

Treat these as authoritative when implementing or reviewing UI:

- `src/renderer/styles.css` (tokens, theme mapping, base rules)
- `src/renderer/app-shell-react.tsx` (layout, tab IA, modal/toast patterns)
- `src/renderer/home-react.tsx` (recording controls and waveform)
- `src/renderer/activity-feed-react.tsx` (activity card language)
- `src/renderer/profiles-panel-react.tsx` (profile cards and inline edit patterns)
- `src/renderer/settings-*.tsx` (settings controls and forms)
- `src/renderer/components/ui/*.tsx` (shared Radix primitives)

If this doc conflicts with code, update this doc to match code unless a deliberate redesign decision is recorded first.

## 2. Design principles

## 2.1 Token-first UI

- Build UI with semantic tokens (`bg-background`, `text-foreground`, `border-border`, etc).
- Do not hardcode ad-hoc colors in component class strings.
- Reuse existing semantic statuses: `success`, `warning`, `destructive`, `recording`.

## 2.2 Dark-only desktop app

- The renderer is dark-only.
- `src/renderer/index.html` sets `<html class="dark">`.
- Do not add light-mode branches unless explicitly requested.

## 2.3 Dense operational UI

- Favor compact controls and information density.
- Default sizes:
  - `h-7`: compact action buttons
  - `h-8`: inputs/selects
  - `text-xs` and `text-[10px]` for most UI copy
- Avoid marketing-style oversized typography.

## 2.4 Minimal motion

Allowed:
- tokenized fade/zoom from `tw-animate-css` (dialogs/select popovers)
- tokenized select popover slide/offset transitions (`slide-in-from-*`, side offset translate)
- `animate-pulse` for recording indicators
- `animate-ping` for recording ring feedback
- `animate-spin` for in-progress status icons

Avoid:
- decorative entrance choreography
- translateY hover lifts
- custom stagger animations

## 2.5 Accessibility baseline

- Every icon-only button must have `aria-label`.
- Keyboard focus must be visible (`focus-visible:ring-2 focus-visible:ring-ring`).
- Never rely on color alone for critical states; pair icon + text where relevant.

## 3. Token system and typography

All tokens are defined in `src/renderer/styles.css` and mapped with `@theme inline`.

## 3.1 Core color tokens

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`
- `--success`, `--success-foreground`
- `--warning`, `--warning-foreground`
- `--recording`, `--recording-foreground`
- `--sidebar`

## 3.2 Typography tokens

- `--font-sans`: Inter-first stack
- `--font-mono`: Geist Mono-first stack

Usage conventions:
- `font-mono` for model/provider identifiers, timers, shortcut values, and API-key fields.
- `font-sans` for general UI labels/content.

## 3.3 Global base rules

- `@layer base` applies `border-border outline-ring/50` to all elements.
- `body` applies `bg-background text-foreground font-sans antialiased`.
- `html, body, #app` are `min-height: 100%`.

## 4. Layout architecture

## 4.1 App shell structure

`AppShell` uses:

- root: `flex h-screen flex-col bg-background`
- header: `ShellChromeReact`
- main: `flex flex-1 overflow-hidden`
- footer: `StatusBarReact`
- overlay layers: toast list + unsaved-draft dialog

## 4.2 Left-right split

- Left panel is fixed width: `w-[320px] border-r flex flex-col`.
- Right workspace is tabs-driven and fills remaining width.

## 4.3 Workspace tabs (current IA)

Current tab model is exactly:

- `activity`
- `profiles`
- `shortcuts`
- `dictionary`
- `audio-input`
- `settings`

Use `Tabs/TabsList/TabsTrigger/TabsContent` from shared UI primitives.

## 4.4 Scroll ownership

- No page-level scrolling.
- Each tab panel owns its own overflow behavior.

## 5. Shared primitive contracts

Use existing primitives in `src/renderer/components/ui/`.

## 5.1 Dialog

- Surface: `rounded-lg border border-border bg-popover p-5 text-popover-foreground`
- Overlay: `bg-background/70`
- Width: `max-w-sm`
- Header typography: title `text-sm font-semibold`, description `text-xs text-muted-foreground`
- Footer: right-aligned action row with `gap-2`

## 5.2 Tabs

- App overrides default pill appearance to flat underline rail.
- Triggers should use active underline (`border-b-2`) and foreground changes.

## 5.3 Select

- Trigger: `h-8`, tokenized input surface
- Content: popover tokens + tokenized animation
- Item: `text-xs`, focused item uses `bg-accent`

## 5.4 RadioGroup, Switch, Checkbox

- Use existing Radix wrappers for focus handling and token consistency.
- Do not reimplement native controls with custom divs unless there is a clear gap.

## 6. Feature-area contracts

## 6.1 Header (`ShellChromeReact`)

- Compact top chrome with drag/no-drag regions.
- Contains logo mark and global recording state dot.
- State text is explicit: `Recording` or `Ready`.

## 6.2 Recording panel (`HomeReact`)

States:
- idle
- recording
- processing

Rules:
- Primary button remains circular `size-20`.
- Recording ring animation is background-only, not layout-shifting.
- Processing state is disabled and visually muted.
- Cancel action appears only in recording state and uses destructive hover color.
- Waveform strip remains fixed `h-16` with 32 compact bars.

## 6.3 Activity feed (`ActivityFeedReact`)

- Cards use semantic border tint by tone.
- Status row always pairs icon + text badge.
- Message block uses compact typography (`text-xs`).
- Copy action appears on hover with opacity transition.
- Empty state is muted and non-alarming.

## 6.4 Profiles panel (`ProfilesPanelReact`)

- Card list with inline editing below active card.
- Default badge is compact and tokenized (`primary` tints).
- Action buttons (set default, edit, remove) reveal on hover/focus-within.
- Editor fields use compact spacing and tokenized inputs.
- Save/Cancel remain explicit and separate from autosave semantics.

## 6.5 Unsaved profile draft guard modal (`AppShell`)

Dialog copy:
- title: `Unsaved profile changes`
- description: save or discard before leaving Profiles tab

Action semantics:
- `Stay`: neutral
- `Discard`: destructive (`bg-destructive text-destructive-foreground`)
- `Save and continue`: primary

Behavior:
- Action buttons lock while save/discard action is pending.

## 6.6 Settings tab sections (`AppShell`)

Current `settings` tab includes only:

1. `Output`
2. `Speech-to-Text`
3. `LLM Transformation`

`Audio Input` and `Shortcuts` are separate top-level tabs, not settings subsections.

## 6.7 Output section (`SettingsOutputReact`)

- Uses card-style selectable rows with tokenized active/inactive states.
- Output mode is exclusive via `RadioGroupItem`.
- Destinations are independent `Switch` controls.
- Show warning when both destinations are disabled.

## 6.8 STT provider form (`SettingsSttProviderFormReact`)

- Unified provider -> model -> API key flow.
- Provider/model use shared `Select` primitive.
- API key field behavior:
  - masked saved state with fixed mask text
  - edit-to-replace on focus
  - save on blur only when non-empty draft exists
- Delete control is icon-only trash button with provider-specific `aria-label`.

## 6.9 LLM API key form (`SettingsApiKeysReact`)

- Mirrors STT API-key input/delete interaction language for Google key.
- Uses same delete confirmation modal component.

## 6.10 API key delete confirmation (`ConfirmDeleteApiKeyDialogReact`)

Contract:
- title: `Delete API key?`
- cancel + destructive confirm action row
- destructive button uses `bg-destructive text-destructive-foreground`
- pending lock disables cancel/confirm and blocks close paths
- no close icon

## 6.11 Shortcuts tab (`SettingsShortcutEditorReact`)

- Rows are 2-column label/input layout.
- Inputs are read-only display fields; click/keyboard enters capture mode.
- Capture hint and validation errors use compact helper text.
- Duplicate shortcut prevention is enforced at capture time.

## 6.12 Dictionary tab (`DictionaryPanelReact`)

- Dedicated top-level tab for app-wide user dictionary (`key=value`) entries.
- Add flow requires non-empty key/value, key max length `128`, value max length `256`.
- Key uniqueness is case-insensitive.
- Existing entries are shown in alphabetical order by key.
- Delete action is immediate and confirmation-free (no modal).

## 6.13 Audio Input tab (`SettingsRecordingReact`)

- Uses section header pattern from shell.
- Uses shared `Select` style for method/sample-rate/device/provider/model.
- Keeps compact spacing and helper text conventions.

## 6.14 Status bar (`StatusBarReact`)

- Left: STT provider/model, LLM provider, recording device.
- Right: active profile name + connectivity state.
- Connectivity uses icon + text (`Ready`/`Offline`).

## 7. Destructive action guidelines

Use destructive tokens for actions that cause irreversible loss in the current user context.

Use `bg-destructive text-destructive-foreground` for:
- API key deletion confirmation (`Delete key`)
- Unsaved draft discard confirmation (`Discard`)

Use neutral styles for non-destructive exits:
- close, stay, cancel editing, dismiss

Do not style non-destructive actions red.

## 8. AI implementation playbook

When adding a new UI component:

1. Start from existing primitive wrappers in `src/renderer/components/ui`.
2. Use semantic tokens only.
3. Match compact sizing conventions (`h-7`/`h-8`, `text-xs`/`text-[10px]`).
4. Add explicit focus-visible treatment.
5. Add `aria-label` to icon-only controls.
6. Preserve existing tab/section IA; do not move sections without product request.
7. Add component tests for:
- visible state and copy
- destructive action class contract where relevant
- disabled/pending behavior where relevant

## 9. Anti-patterns (do not introduce)

- New legacy-style global CSS class systems.
- Hardcoded hex/RGB colors instead of tokens.
- Mixed light/dark mode branches.
- Complex entrance animations for core workflows.
- Breaking existing IA by moving shortcuts/audio input back into settings.
- Reintroducing deprecated API-key visibility/test controls.

## 10. Documentation maintenance rules

- Update this doc when any of these change:
  - tab IA
  - token names/semantics
  - destructive action contracts
  - shared primitive styling contracts
- Keep examples short and tied to current file paths.
- If a redesign intentionally departs from this guide, add a decision record in `docs/decision/` before implementation.
