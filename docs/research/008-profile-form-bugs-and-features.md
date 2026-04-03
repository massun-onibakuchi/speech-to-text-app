# Research: Profile Form Bugs and Planned Features
<!-- where: docs/research/ | what: deep-dive analysis of profile form UX issues and planned features | why: ground the implementation plan in exact code mechanics before any changes are made -->

## Overview

This document captures a detailed analysis of three user-facing issues and one new feature for the **Profiles settings panel** (`src/renderer/profiles-panel-react.tsx`). It covers the mechanics of the current implementation, the root cause of each bug, and the approach for each feature.

---

## 1. Textarea Resizability Bug

### Problem
Both the System Prompt and User Prompt textarea fields are explicitly non-resizable. When a prompt spans multiple lines, the content is clipped to the fixed `rows={3}` / `min-h-[60px]` height.

### Code Location
`src/renderer/profiles-panel-react.tsx`, lines 436–466 (`ProfileEditForm` function component).

```tsx
// System prompt — line 445
className="min-h-[60px] resize-none rounded border ..."

// User prompt — line 466
className="min-h-[60px] resize-none rounded border ... font-mono ..."
```

### Root Cause
`resize-none` is a Tailwind utility that maps to `resize: none` in CSS. This prevents the browser's native drag-to-resize textarea handle from appearing. The fix is to replace `resize-none` with `resize-y` (vertical only) or `resize` (both axes) and optionally set a `max-h` to prevent runaway growth.

### Trade-offs
| Option | Pros | Cons |
|---|---|---|
| `resize-y` | Vertical resize only; feels natural for text | User must manually drag every session |
| `resize` | Full control | Can accidentally widen the form |
| Auto-expand (JS `onInput`) | No drag required; textarea grows automatically | More JS complexity; may push other form elements |

**Recommendation:** `resize-y` with `min-h-[80px]` and `max-h-[320px]`. This is the minimal change with no JS complexity.

---

## 2. Unsaved Changes Lost When Switching Profiles

### Problem
When a user opens profile A for editing, makes changes, then clicks profile B's card (or the "+ New" button), `openEdit()` is called immediately, silently discarding the in-progress draft for A without any confirmation.

### Code Location
`src/renderer/profiles-panel-react.tsx`, line 573:

```ts
const openEdit = (presetId: string) => {
  const preset = presets.find((p) => p.id === presetId)
  if (!preset) return
  setIsCreatingPresetDraft(false)
  setEditingPresetId(presetId)       // ← switches to new preset
  setEditDraft(buildDraft(preset))   // ← silently overwrites draft
  setOriginalDraft(buildDraft(preset))
}
```

The `isDirty` flag (`areDraftsEqual(editDraft, originalDraft)`) correctly detects unsaved changes but **is only consumed by the tab-navigation guard** in `app-shell-react.tsx` (line 211). There is no equivalent guard when switching between profile cards *within* the same panel.

### Triggers
The silent discard occurs in three scenarios:
1. Clicking another profile card's **edit (pencil) icon**.
2. Clicking the **"+ New profile"** button while editing an existing profile.
3. Clicking an existing profile card's **"Set as default"** button (it does not open an edit form, but is placed near cards and could be confused).

### Required Behavior
When `isDirty === true` and the user triggers `openEdit` or `startCreate`:
- Block the navigation.
- Show a modal with three actions:
  - **Cancel** — close the modal, stay in the current edit form.
  - **Discard** — call `discardActiveDraft()`, then proceed with the new navigation.
  - **Save** — call `saveActiveDraft()`, then proceed if save succeeded.

### Existing Pattern to Reuse
`app-shell-react.tsx` already implements this exact three-action dialog (lines 601–670) for the tab-switching case. The same Radix `Dialog` primitive and the same `saveActiveDraft` / `discardActiveDraft` imperative handle methods are already available within `ProfilesPanelReact`. The intra-panel guard should mirror this pattern.

### State Machine
```
User clicks new card
  → isDirty?
      NO  → openEdit(newId) immediately
      YES → show "unsaved changes" dialog
              → Cancel   : close dialog, stay
              → Discard  : discardActiveDraft() → openEdit(newId)
              → Save     : await saveActiveDraft()
                             → success: openEdit(newId)
                             → failure: stay (validation errors shown)
```

### Files in Scope
- `src/renderer/profiles-panel-react.tsx` — add dialog state + pending navigation state + guard in `openEdit` / `handleNewProfile`
- `src/renderer/app-shell-react.tsx` — **no change needed** (the existing tab guard already covers leaving the Profiles tab)

---

## 3. Unsaved Changes Lost When Switching Tabs

### Current Status
The tab-switching guard **already exists** in `app-shell-react.tsx` (lines 211–221). When `activeTab === 'profiles'` and `isDirty === true`, switching to any other tab suspends navigation and shows the three-action dialog.

### Residual Gap
The tab guard is wired correctly. However, it fires only for **outbound navigation from the Profiles tab**. If the user is editing profile A, the intra-panel bug (issue #2) could leave a stale draft state even before the tab guard fires. Fixing issue #2 first eliminates this dependency.

### Files in Scope
- No changes needed here beyond confirming issue #2 fix propagates `isDirty` correctly.

---

## 4. New Feature: EN-JP Translation Default Profile

### Requirement
Add a new built-in preset (not user-created) with the following content:

| Field | Value |
|---|---|
| `id` | `'en-jp-translation'` |
| `name` | `'EN-JP Translation'` |
| `provider` | `'google'` |
| `model` | `'gemini-2.5-flash'` |
| `systemPrompt` | See below |
| `userPrompt` | `'<input_text>{{text}}</input_text>'` |
| `shortcut` | `''` (no shortcut; user-assignable) |

**System Prompt:**
```xml
<role>Translator</role>
<rule>If the input text is Japanese, translate it to English. Otherwise, translate it to Japanese.</rule>
<output>Return only the translated text.</output>
```

**User Prompt:**
```xml
<input_text>{{text}}</input_text>
```

### Where to Add It
`src/shared/domain.ts`, in `DEFAULT_SETTINGS.transformation.presets` array (currently line 314).

The new preset is added as a second entry. Its `shortcut` is set to `''` since only the first preset (`'default'`) has the `'Cmd+Opt+L'` shortcut.

### Considerations

**Is this a "built-in" preset or a user preset?**
Currently the system has no concept of "read-only" or "built-in" presets — the `TransformationPreset` type does not have an `isBuiltIn` flag. Adding a second entry to `DEFAULT_SETTINGS.presets` means it appears only for **new installs** (fresh settings). Existing users who already have settings on disk will not see it automatically. This is the safe, non-destructive approach.

**Migration path for existing users (optional / future):**
A migration function could be added in settings loading to inject the preset if it doesn't exist. This is out of scope for this ticket but noted here.

**Validation:**
The `userPrompt` must contain exactly one `{{text}}` placeholder wrapped in `<input_text>` boundaries. The proposed user prompt `<input_text>{{text}}</input_text>` satisfies this constraint. The system prompt does not have the same requirement.

### Files in Scope
- `src/shared/domain.ts` — add preset entry to `DEFAULT_SETTINGS.transformation.presets`

---

## Summary of Root Causes

| # | Issue | Root Cause | Fix Complexity |
|---|---|---|---|
| 1 | Textarea not resizable | `resize-none` Tailwind class hardcoded | Trivial (CSS class swap) |
| 2 | Draft lost on profile switch | `openEdit()` has no dirty check | Medium (add dialog + pending state) |
| 3 | Draft lost on tab switch | Already fixed upstream | None needed |
| 4 | EN-JP profile missing | Not in DEFAULT_SETTINGS | Trivial (add preset object) |

---

## Key Files Reference

| File | Role |
|---|---|
| `src/renderer/profiles-panel-react.tsx` | Main panel: card list, edit form, form state |
| `src/renderer/app-shell-react.tsx` | Tab shell: existing tab-switch dirty guard |
| `src/shared/domain.ts` | Data types, DEFAULT_SETTINGS, validation |
| `src/renderer/settings-mutations.ts` | Async save/create/delete operations |
| `src/renderer/settings-validation.ts` | Prompt content validation rules |
| `src/renderer/confirm-delete-profile-dialog-react.tsx` | Reference for Radix Dialog usage pattern |
