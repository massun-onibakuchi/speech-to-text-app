# Plan: Profile Form Fixes and Features
<!-- where: docs/plans/ | what: step-by-step tickets for profile form improvements | why: structured roadmap before implementation begins -->

**Research reference:** `docs/research/008-profile-form-bugs-and-features.md`

> **Revision note:** Updated after sub-agent plan review. Changes: guarded "Add profile" inline onClick in T-2, removed redundant `rows` attribute in T-1, added `finally` block for `isGuardActionPending`, added merge-order note, added accessibility requirements for T-2 dialog.

---

## Context

The Profiles settings panel (`src/renderer/profiles-panel-react.tsx`) has two UX bugs and one missing feature. This plan breaks the work into three independently-deployable tickets, sorted by priority.

---

## Ticket Priority and Execution Order

| # | Ticket | Priority | Dependency | Execution |
|---|---|---|---|---|
| T-1 | Resizable prompt textareas | High (correctness) | None | First (trivial, unblock T-2) |
| T-2 | Unsaved-changes guard on profile switch | High (data safety) | T-1 merged first (same file) | After T-1 lands |
| T-3 | EN-JP Translation default preset | Medium (feature) | None | Parallel with T-1/T-2 |

**Merge order note:** T-1 and T-2 both touch `profiles-panel-react.tsx`. Merge T-1 first, then rebase T-2 on top to avoid a merge conflict on the textarea className lines. T-3 is in a different file and can land at any point.

---

## T-1 — Resizable Prompt Textareas

### Goal
Allow users to vertically resize the System Prompt and User Prompt textareas by dragging, so long prompts are not clipped.

### Approach
Replace `resize-none` with `resize-y` on both textareas. Increase `min-h` to `80px` for a better default. Add `max-h-[320px]` to prevent the form from growing unbounded. Remove the now-redundant `rows={3}` attribute — once Tailwind height classes control the initial height, `rows` becomes a second source of truth and should be removed.

No JavaScript needed. This is a pure CSS Tailwind class change.

**Why not auto-expand?** Auto-expanding textareas require JS `onInput` event handling and have edge cases with controlled React inputs (cursor position, layout thrash). Native `resize-y` is simpler, predictable, and accessible.

### Files in Scope
- `src/renderer/profiles-panel-react.tsx`

### Checklist
- [ ] Replace `resize-none` → `resize-y` on system prompt textarea (line ~445)
- [ ] Replace `resize-none` → `resize-y` on user prompt textarea (line ~466)
- [ ] Change `min-h-[60px]` → `min-h-[80px]` on both
- [ ] Add `max-h-[320px]` on both
- [ ] Remove `rows={3}` from both textareas (CSS height takes over; `rows` is redundant)
- [ ] Visually verify the resize handle appears in the Electron dev window
- [ ] Confirm no existing snapshot/test breaks

### Example Code
```tsx
// Before (system prompt, line ~445)
<textarea
  rows={3}
  className="min-h-[60px] resize-none rounded border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
/>

// After
<textarea
  className="min-h-[80px] max-h-[320px] resize-y rounded border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
/>

// Before (user prompt, line ~466)
<textarea
  rows={3}
  className="min-h-[60px] resize-none rounded border border-input bg-background px-2 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
/>

// After
<textarea
  className="min-h-[80px] max-h-[320px] resize-y rounded border border-input bg-background px-2 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
/>
```

### Trade-offs
- `resize-y` only — horizontal resize disabled to keep form layout stable.
- `max-h-[320px]` — prevents save/cancel buttons from being pushed below the viewport.
- Removing `rows={3}` — eliminates ambiguity; `min-h-[80px]` is the single source of truth for initial height.
- The user prompt uses `font-mono` which changes character width, but both textareas will share the same height constraints; the cosmetic difference between them is acceptable.

### Definition of Done
- Both textareas show a vertical resize handle in the Electron window.
- Multi-line prompts are fully visible after dragging.
- No existing tests broken.
- PR diff is ≤ 12 lines changed.

---

## T-2 — Unsaved-Changes Guard on Profile Switch

### Goal
When a user has unsaved edits and clicks another profile card or the "+ Add profile" button, show a three-action dialog (Cancel / Discard / Save) instead of silently discarding the draft.

### Approach

Mirror the existing tab-switch guard in `app-shell-react.tsx` (lines 211–221 and 601–670) inside `ProfilesPanelReact`. The guard lives in the same component that owns `isDirty`, `saveActiveDraft`, and `discardActiveDraft` — no prop changes needed to parent components.

**Two navigation paths require guarding:**
1. `openEdit(presetId)` — clicking an existing profile card's edit icon.
2. The `onClick` of the "+ Add profile" button (currently inline at ~line 749, not a named function).

Both paths are unified via a single `_doProceedOpen(target: string | 'new')` helper, reducing duplicated state-setting.

**State additions:**
```ts
// Single pending target: a presetId string, or the sentinel 'new'
const [pendingOpenTarget, setPendingOpenTarget] = useState<string | 'new' | null>(null)
const [isIntraPanelGuardOpen, setIsIntraPanelGuardOpen] = useState(false)
const [isGuardActionPending, setIsGuardActionPending] = useState(false)
```

**Unified helper — `_doProceedOpen`:**
```ts
const _doProceedOpen = (target: string | 'new') => {
  if (target === 'new') {
    setIsCreatingPresetDraft(true)
    setEditingPresetId(null)
    setEditDraft({ ...DEFAULT_NEW_DRAFT })
    setOriginalDraft({ ...DEFAULT_NEW_DRAFT })
  } else {
    const preset = presets.find((p) => p.id === target)
    if (!preset) return
    setIsCreatingPresetDraft(false)
    setEditingPresetId(target)
    setEditDraft(buildDraft(preset))
    setOriginalDraft(buildDraft(preset))
  }
}
```

**Modified `openEdit`:**
```ts
const openEdit = (presetId: string) => {
  if (isDirty) {
    setPendingOpenTarget(presetId)
    setIsIntraPanelGuardOpen(true)
    return
  }
  _doProceedOpen(presetId)
}
```

**Modified "+ Add profile" onClick:**
```tsx
onClick={() => {
  if (isSaving) return
  if (isDirty) {
    setPendingOpenTarget('new')
    setIsIntraPanelGuardOpen(true)
    return
  }
  _doProceedOpen('new')
}}
```

**Dialog action handlers:**
```ts
const handleGuardCancel = () => {
  setIsIntraPanelGuardOpen(false)
  setPendingOpenTarget(null)
}

const handleGuardDiscard = () => {
  const target = pendingOpenTarget
  discardActiveDraft()
  setIsIntraPanelGuardOpen(false)
  setPendingOpenTarget(null)
  if (target) _doProceedOpen(target)
}

const handleGuardSave = async () => {
  setIsGuardActionPending(true)
  try {
    const didSave = await saveActiveDraft()
    if (didSave) {
      const target = pendingOpenTarget
      setIsIntraPanelGuardOpen(false)
      setPendingOpenTarget(null)
      if (target) _doProceedOpen(target)
    }
    // If save failed: stay in dialog, validation errors visible in form beneath
  } finally {
    setIsGuardActionPending(false)   // ← always release pending state
  }
}
```

**Dialog JSX:**
```tsx
<Dialog
  open={isIntraPanelGuardOpen}
  onOpenChange={(open) => {
    if (!open && !isGuardActionPending) handleGuardCancel()
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Unsaved changes</DialogTitle>
      <DialogDescription>
        You have unsaved changes to this profile. What would you like to do?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={handleGuardCancel} disabled={isGuardActionPending}>
        Cancel
      </Button>
      <Button variant="outline" onClick={handleGuardDiscard} disabled={isGuardActionPending}>
        Discard
      </Button>
      <Button onClick={() => { void handleGuardSave() }} disabled={isGuardActionPending}>
        {isGuardActionPending ? 'Saving…' : 'Save'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Accessibility:** Use Radix `Dialog` (not `AlertDialog`) to match the tab-switch guard pattern in `app-shell-react.tsx`. Initial focus defaults to the first focusable element ("Cancel") via Radix's default `onOpenAutoFocus` — no override needed. This matches the existing pattern.

### Files in Scope
- `src/renderer/profiles-panel-react.tsx` — all changes confined here

### Checklist
- [ ] Confirm `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` are already imported (if not, add imports from `./components/ui/dialog`)
- [ ] Confirm `Button` is already imported (if not, add import)
- [ ] Add `pendingOpenTarget`, `isIntraPanelGuardOpen`, `isGuardActionPending` state variables
- [ ] Extract `_doProceedOpen(target: string | 'new')` helper from existing `openEdit` body
- [ ] Update `openEdit` to guard with dirty check
- [ ] Update the inline "+ Add profile" `onClick` to guard with dirty check
- [ ] Add `handleGuardCancel`, `handleGuardDiscard`, `handleGuardSave` handlers
- [ ] Add the guard dialog JSX in the component's return tree
- [ ] Verify `isGuardActionPending` is reset in `finally` block of `handleGuardSave`
- [ ] Write test: edit profile A → click profile B → expect guard dialog
- [ ] Write test: edit profile A → click profile B → Discard → expect profile B form open, A changes gone
- [ ] Write test: edit profile A → click profile B → Save (success) → expect profile B form open
- [ ] Write test: edit profile A → click "+ Add" → expect guard dialog
- [ ] Write test: edit profile A → click profile B → Cancel → expect profile A form still open with edits intact

### Trade-offs
- **Single `pendingOpenTarget` union vs two booleans:** `string | 'new' | null` removes the separate `pendingOpenIsNew` boolean, reducing state count from four variables to three and making the proceed-helper call site uniform.
- **`_doProceedOpen` helper:** Centralizing the state mutations avoids duplicating the 6-line preset-loading sequence in two places. The helper is private (not exposed via `ProfilesPanelHandle`).
- **Dialog inside ProfilesPanelReact vs lifted to app-shell:** Keeping it inside the panel avoids new callback props and keeps all profile-related state co-located. The tradeoff is a slightly larger component, but it remains under the 600 LOC limit.
- **Save failure path:** If `saveActiveDraft()` returns `false`, the dialog stays open and validation errors become visible in the form beneath the dialog. This is consistent with the tab-switch guard behavior.

### Definition of Done
- Clicking another profile card while editing shows the guard dialog.
- Clicking "+ Add profile" while editing shows the guard dialog.
- Cancel, Discard, and Save all work correctly including the save-failure path.
- `isGuardActionPending` is always released after save, even on failure.
- All five test scenarios pass.
- PR diff touches only `profiles-panel-react.tsx`.

---

## T-3 — EN-JP Translation Default Preset

### Goal
Ship a second built-in profile for EN↔JP bidirectional translation so new users get a practical starting point without manual setup.

### Approach
Add a second entry to `DEFAULT_SETTINGS.transformation.presets` in `src/shared/domain.ts`. This is purely additive and non-breaking.

**Impact on existing users:** Settings are loaded from disk. Existing users will not receive this preset automatically. This is the safe, accepted approach — no migration, no risk of overwriting user data. A future migration pass (out of scope) could inject it if absent.

**Validation check:** The `userPrompt` `'<input_text>{{text}}</input_text>'` satisfies both required validators:
- `hasSafeInputBoundary` — matches `/<input_text>\s*\{\{text\}\}\s*<\/input_text>/`.
- Exactly one `{{text}}` placeholder.

The `shortcut: ''` is valid — `TransformationPresetSchema` has no format constraint on the shortcut field.

### Files in Scope
- `src/shared/domain.ts`

### Checklist
- [ ] Add `en-jp-translation` preset after the `'default'` entry in `DEFAULT_SETTINGS.transformation.presets` (line ~314)
- [ ] Confirm the preset passes `settingsValidationSchema` (run validation tests)
- [ ] Confirm no existing test hardcodes `presets.length === 1`
- [ ] Add a test asserting `DEFAULT_SETTINGS.transformation.presets` contains an entry with `id === 'en-jp-translation'`

### Preset Object
```ts
{
  id: 'en-jp-translation',
  name: 'EN-JP Translation',
  provider: 'google',
  model: 'gemini-2.5-flash',
  systemPrompt: [
    '<role>Translator</role>',
    '<rule>If the input text is Japanese, translate it to English. Otherwise, translate it to Japanese.</rule>',
    '<output>Return only the translated text.</output>'
  ].join('\n'),
  userPrompt: '<input_text>{{text}}</input_text>',
  shortcut: ''
}
```

### Trade-offs
- **No `isBuiltIn` flag:** The type has no read-only concept. Users can freely edit or delete the preset. Adding a flag would be scope creep.
- **No shortcut:** Assigns `''` to avoid conflicting with the Default preset's `Cmd+Opt+L` shortcut. User can assign one manually.
- **Provider choice:** `google / gemini-2.5-flash` matches the default preset and is the most broadly available provider.
- **Existing users not migrated:** Accepted limitation, documented.

### Definition of Done
- `DEFAULT_SETTINGS.transformation.presets` has two entries.
- The EN-JP preset validates successfully against `settingsValidationSchema`.
- New-install settings contain both profiles in the Profiles panel.
- PR diff touches only `src/shared/domain.ts` (≤ 15 lines).

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| T-1 & T-2 merge conflict on same file | Medium | Low | Merge T-1 first; T-2 branch rebases before merging |
| T-2 Dialog imports not present | Low | Low | Confirm imports from `./components/ui/dialog` before coding |
| T-2 `saveActiveDraft` in-flight while guard opens | Low | Medium | Existing `isSavingRef` prevents double-save; guard Save button also disables when `isSaving` |
| T-2 `isGuardActionPending` not reset on failure | Low | Medium | `finally` block in `handleGuardSave` covers this |
| T-3 empty shortcut `''` breaks shortcut display | Low | Low | `shortcut: ''` is a valid string value; shortcut rendering is conditional |
| T-3 existing users miss the new preset | Certain | Low | Accepted; documented as known limitation; future migration out of scope |
| T-1 `resize-y` not rendered in Electron webview | Very Low | Low | Test in actual Electron window; CSS resize is broadly supported |
