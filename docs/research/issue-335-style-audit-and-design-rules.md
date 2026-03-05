<!--
Where: docs/research/issue-335-style-audit-and-design-rules.md
What: Style-system audit and concrete design rules for issue #335 (API-key delete with confirmation).
Why: Ensure upcoming implementation matches the current renderer design language and avoids ad-hoc UI.
-->

# Issue #335 Style Audit and Design Rules

Date: 2026-03-04  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/335

## 1. Scope

This document captures:
- the current visual/interaction language actually implemented in renderer code;
- binding style rules for adding API-key delete actions;
- a detailed design for the confirmation window required by issue #335 (component does not exist yet).

## 2. Current Style System (Code-Grounded)

### 2.1 Tokens and palette
Source: `src/renderer/styles.css`
- Dark-only OKLCH token system (`:root, .dark` share one palette).
- Semantic tokens already available for delete UX:
  - `destructive` / `destructive-foreground`
  - `border`, `card`, `popover`, `muted-foreground`, `ring`
- Baseline radius and density:
  - `--radius: 0.5rem`
  - control heights generally `h-7`/`h-8`

### 2.2 Typography and spacing
- Dense product UI scale, mostly `text-xs`, `text-[11px]`, `text-[10px]`.
- `font-mono` reserved for technical identifiers and masked secrets.
- Compact spacing patterns in settings forms:
  - `space-y-3` or `space-y-4` sections
  - label + input rows using small vertical gaps

### 2.3 Component and interaction conventions
Source files:
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/app-shell-react.tsx`

Conventions used throughout:
- icon-only destructive actions use muted default + destructive hover (example: profile trash icon);
- all icon-only buttons require explicit `aria-label`;
- no motion-heavy overlays; transitions are mostly `transition-colors`;
- status text is explicit and concise (`Saved.`, `Failed: ...`, `Not set`);
- feedback channels are layered:
  - inline text (`apiKeySaveStatus`, `settingsSaveMessage`)
  - toast feedback for event outcomes.

## 3. New Style Rules for Issue #335

### 3.1 Trash action placement and shape
- Place a trash icon button in the same horizontal row as each API key input.
- Keep input as the dominant element (`flex-1`), with a fixed-size icon button to the right.
- Button size: `h-8 w-8` to align with existing API key input height.
- Visual style:
  - resting: `bg-secondary text-muted-foreground border border-border`
  - hover: `bg-accent text-destructive`
  - focus: `focus-visible:ring-2 focus-visible:ring-ring`
  - disabled: `opacity-50 cursor-not-allowed`

### 3.2 Destructive semantics
- Icon-only; no persistent text label in-row.
- Mandatory accessible label per provider context:
  - `aria-label="Delete Groq API key"`
  - `aria-label="Delete ElevenLabs API key"`
  - `aria-label="Delete Google API key"`
- Never overload blur-save with deletion through empty strings in UI logic.

### 3.3 Feedback semantics after delete
- On success:
  - status transitions to `Not set` in form label;
  - inline provider save status should confirm deletion (short and deterministic);
  - success toast confirms action.
- On failure:
  - inline provider status includes actionable failure text;
  - error toast mirrors outcome.

## 4. Confirmation Window Design (Detailed)

## 4.1 Why this must be a dedicated component
There is currently no shared confirmation dialog primitive in `src/renderer/components/ui/`.  
Issue #335 requires explicit confirmation before destructive key removal; this should be implemented as a reusable component, not an ad-hoc inline block.

## 4.2 Component model
Proposed component: `ConfirmDestructiveActionDialogReact` (name can be finalized during implementation).

Responsibilities:
- render modal/portal surface;
- trap focus while open;
- restore focus to trigger on close;
- expose semantic callbacks for `onConfirm` and `onCancel`;
- remain presentation-focused (no API side effects inside component).

Non-responsibilities:
- provider deletion logic;
- API status refresh logic;
- toast emission.

## 4.3 Visual design spec

### Surface hierarchy
- Backdrop:
  - full-screen overlay with dimmed neutral tone (no blur requirement);
  - click on backdrop maps to cancel (unless operation is in-flight).
- Dialog card:
  - `rounded-lg border border-border bg-popover text-popover-foreground`;
  - width constrained for concise scanning (`max-w-sm` style footprint);
  - padding follows existing dense pattern (`p-4`/`p-5`).

### Header region
- Title:
  - short destructive intent text, e.g. `Delete API key?`
  - style: `text-sm font-semibold`.
- Supporting copy:
  - one concise sentence with provider interpolation, e.g.
    `This will delete the saved Groq API key from this app.`
  - style: `text-xs text-muted-foreground`.

### Body detail block
- Optional caution line (still concise):
  - mention that related actions may be blocked until a key is saved again.
- No long prose, no multi-paragraph warning.

### Action row
- Right-aligned two-button layout:
  - secondary `Cancel` (non-destructive)
  - destructive `Delete key` (primary destructive action)
- Button sizing aligned with settings density (`h-7`/`h-8`, `text-xs`).
- Destructive button uses `bg-destructive text-destructive-foreground` with hover darken.

### Motion
- Keep minimal: fade/zoom from existing tokenized motion if a Radix primitive is used.
- Do not introduce custom entrance choreography.

## 4.4 Interaction contract

### Open
- Triggered only by trash button click.
- Dialog receives contextual provider metadata:
  - `providerId` (`groq|elevenlabs|google`)
  - `providerLabel` (`Groq|ElevenLabs|Google`)

### Cancel paths
- ESC key
- Cancel button
- Backdrop click
- No close icon in this dialog design.

All cancel paths must:
- close dialog;
- not change API key state;
- return focus to originating trash button.

### Confirm path
- Confirm button enters pending state immediately.
- Pending state behavior:
  - disable both dialog actions and close mechanisms;
  - show deterministic busy label (`Deleting...`) on confirm button.
- On success:
  - close dialog;
  - trigger delete mutation callback;
  - surface status + toast from mutation layer.
- On failure:
  - keep dialog open (recommended policy);
  - re-enable confirm/cancel controls;
  - show error text via existing feedback channels (not duplicated ad-hoc inside dialog unless needed).

## 4.5 Accessibility contract
- Dialog root must expose proper role/semantics (`role="alertdialog"` preferred for destructive confirmation).
- Provide `aria-labelledby` and `aria-describedby`.
- Initial focus should land on safest default:
  - `Cancel` button (recommended for destructive confirmations).
- Keyboard support:
  - Tab cycles inside modal;
  - Shift+Tab reverse cycles;
  - Enter triggers focused action;
  - Escape cancels when not pending.
- Screen reader copy should include provider label and action consequence.

## 4.6 Content and copy rules
- Copy must be direct and short.
- Avoid irreversible language unless truly irreversible.
- Recommended canonical copy:
  - Title: `Delete API key?`
  - Body: `This deletes the saved {Provider} API key from this app.`
  - Note: `Recording and transformations that require this key will be blocked until you save a new key.`
  - Confirm CTA: `Delete key`
  - Cancel CTA: `Cancel`

## 4.7 Error and race handling rules
- If user changes selected STT provider while dialog is open, delete target remains bound to provider captured at open-time.
- If key already missing at confirm-time, treat as idempotent success or emit clear benign message (decision required in implementation phase).
- If delete call fails, do not silently close without feedback.

## 5. Integration Boundaries

### STT unified form
`SettingsSttProviderFormReact` shows only currently selected provider key.
- Delete trigger must act on that provider only.
- Provider switch resets local drafts already; delete flow must not leak draft text across providers.

### Google form
`SettingsApiKeysReact` handles Google only.
- Dialog behavior and copy should match STT form patterns for consistency.

## 6. Summary of Non-Negotiable Rules
- No empty-string save as a user-facing delete action.
- Destructive action always requires explicit confirmation.
- Icon-only delete button with explicit aria-label.
- Dialog follows existing density, token palette, and focus-ring behavior.
- Success and error outcomes must update inline status and toast channels consistently.
