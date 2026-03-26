---
title: Fix Keybind Misfire – Remove Legacy Compat, Harden Shortcut Pipeline
date: 2026-03-26
status: revised-after-review
research: docs/research/001-keybind-misfire-opt-space.md
---

# Fix Keybind Misfire – Remove Legacy Compat, Harden Shortcut Pipeline

## Context

When the user sets Opt+Space for toggle-recording, pressing Opt+C or Opt+V also fires the
callback.  Research (`docs/research/001-keybind-misfire-opt-space.md`) identified:

- **Root cause**: Settings written by pre-`20d8636` code stored Option-produced Unicode
  characters as shortcut keys (e.g., `"Opt+Ç"`, `"Opt+√"`, `"Opt+\u00A0"`).  Neither
  `SettingsSchema` nor `toElectronAccelerator` rejects them, so they reach
  `globalShortcut.register` as character-based accelerators (`"Alt+Ç"`, `"Alt+√"`) that
  macOS resolves to physical keycodes kVK_ANSI_C and kVK_ANSI_V → fires on Opt+C / Opt+V.
- **Secondary path**: `"Opt+\u00A0"` has its key stripped by `.trim()`, producing the
  modifier-only accelerator `"Alt"` that fires for every Option+key combination.
- `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` in `shortcut-capture.ts` was a partial attempt
  at compatibility — it is used only for duplicate detection (renderer) and was never wired
  into the main-process conversion function.

**Directive**: Remove all backward-compatibility code.  Harden the schema and conversion
layer so malformed shortcuts are detected and rejected before they cause OS-level damage.

---

## Dependency Graph

```
T-001  ──►  T-004 (legacy removal safe only after schema rejects bad input)
T-001  ──►  T-002 (schema fix is the primary gate; modifier-only guard is defence-in-depth)
T-003  (independent — captures-side bugs; no deps)
T-005  (after T-001, T-002, T-003, T-004)
```

---

## Ticket Summary (Priority Order)

| ID    | Title                                              | Priority | Depends On |
|-------|----------------------------------------------------|----------|------------|
| T-001 | Harden shortcut schema + graceful reset at startup | P0       | —          |
| T-002 | Fix `toElectronAccelerator` modifier-only guard    | P1       | T-001      |
| T-003 | Fix U+00A0 shortcut capture and activation UX      | P1       | —          |
| T-004 | Remove `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`      | P2       | T-001      |
| T-005 | Regression tests across all fixed paths            | P2       | T-001–T-004|

---

## T-001 — Harden Shortcut Schema + Graceful Reset at Startup

**Priority**: P0
**PR scope**: `src/shared/domain.ts`, `src/main/services/settings-service.ts`

### Goal

Prevent any malformed shortcut string (legacy Unicode symbols, modifier-only combos,
empty strings, raw U+00A0) from persisting in validated `Settings` or reaching
`toElectronAccelerator`.  A settings file written by an old app version that contains
`"Opt+Ç"` must not crash the app — invalid shortcut fields are silently reset to their
corresponding `DEFAULT_SETTINGS` values.

### Approach

#### 1. Add `isValidShortcutCombo` to `src/shared/domain.ts`

A shared predicate that lives next to the schema.  It enforces the canonical shortcut
format: one or more known modifier segments followed by exactly one ASCII letter, digit, or
named special key.  Unicode non-ASCII characters in the key position are explicitly
rejected.

```typescript
// src/shared/domain.ts  (new export, near the top of the file)

const SHORTCUT_MODIFIER_SEGMENTS = new Set([
  'cmd', 'command', 'meta',
  'ctrl', 'control',
  'opt', 'option', 'alt',
  'shift'
])

const SHORTCUT_NAMED_KEY_SEGMENTS = new Set([
  'space', 'enter', 'tab', 'escape', 'backspace', 'delete',
  'home', 'end', 'pageup', 'pagedown', 'insert',
  'up', 'down', 'left', 'right',
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12'
])

/**
 * Returns true iff `combo` is a well-formed shortcut:
 *   - at least one known modifier segment
 *   - exactly one non-modifier segment that is ASCII letter, digit, or named key
 *   - no Unicode non-ASCII characters in the key position
 */
export const isValidShortcutCombo = (combo: string): boolean => {
  const segments = combo
    .split('+')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)

  const modifiers = segments.filter((s) => SHORTCUT_MODIFIER_SEGMENTS.has(s))
  const keys = segments.filter((s) => !SHORTCUT_MODIFIER_SEGMENTS.has(s))

  if (modifiers.length === 0 || keys.length !== 1) return false

  const key = keys[0]
  return /^[a-z0-9]$/.test(key) || SHORTCUT_NAMED_KEY_SEGMENTS.has(key)
}
```

**Why only ASCII + named keys?** The macOS keyboard layout lookup resolves Unicode characters
(e.g., `'Ç'`) to physical keycodes — registering `"Alt+Ç"` fires on Opt+C.  Restricting
to ASCII plus a closed set of named keys eliminates this class of misfire entirely.

#### 2. Apply the check in `SettingsSchema` using `v.fallback`

`v.fallback` (available in valibot 1.2.0) returns the fallback value when the inner schema
rejects the input.  This replaces a custom repair function with a declarative per-field
default, keeping repair logic co-located with the schema.

```typescript
// src/shared/domain.ts — SettingsSchema.shortcuts
// Helper alias for brevity (defined once above the schema):
const shortcutField = (defaultValue: string) =>
  v.fallback(
    v.pipe(v.string(), v.check(isValidShortcutCombo, 'Invalid shortcut format')),
    defaultValue
  )

shortcuts: v.strictObject({
  toggleRecording:         shortcutField(DEFAULT_SHORTCUTS.toggleRecording),
  cancelRecording:         shortcutField(DEFAULT_SHORTCUTS.cancelRecording),
  runTransform:            shortcutField(DEFAULT_SHORTCUTS.runTransform),
  runTransformOnSelection: shortcutField(DEFAULT_SHORTCUTS.runTransformOnSelection),
  pickTransformation:      shortcutField(DEFAULT_SHORTCUTS.pickTransformation),
  changeTransformationDefault: shortcutField(DEFAULT_SHORTCUTS.changeTransformationDefault)
}),
```

Where `DEFAULT_SHORTCUTS` is extracted from `DEFAULT_SETTINGS.shortcuts` (or inlined as
literal strings — whichever avoids a forward-reference issue with `DEFAULT_SETTINGS`).

**`TransformationPresetSchema.shortcut` — use `v.optional` not `v.fallback`**

Preset shortcuts are user-configured and legitimately empty (empty string = "no shortcut
assigned for this preset").  Three test fixtures confirm this: `shortcut: ''` appears in
`profile-picker-service.test.ts` and `profiles-panel-react.test.tsx`.  Tightening to
`isValidShortcutCombo` must not break this use-case.

Decision: keep `TransformationPresetSchema.shortcut` as `v.string()` for now.  The
preset-level shortcut has a different lifecycle than the global shortcuts (it is optional,
user-removable, and only reaches `toElectronAccelerator` via the `runTransform` preset
path which already feeds through `registerFromSettings`).  Hardening preset shortcuts is
a separate ticket if needed.

```typescript
// TransformationPresetSchema.shortcut — unchanged
shortcut: v.string()
```

#### 3. Graceful reset in `SettingsService` constructor

With `v.fallback` in the schema, `SettingsSchema.shortcuts.*` will silently replace any
invalid shortcut with its default during `v.parse`.  The constructor therefore does **not**
need a bespoke repair function.  The existing `v.parse(SettingsSchema, ...)` call already
handles the repair transparently:

```typescript
// settings-service.ts constructor — no change needed to the parse call
const parsedSettings = v.parse(SettingsSchema, this.store.get('settings'))
// ↑ now silently resets invalid shortcuts to defaults via v.fallback
const validationErrors = validateSettings(parsedSettings)
if (validationErrors.length > 0) {
  throw new Error(`Invalid settings: ...`)
}
```

This is strictly simpler than the bespoke `repairSettings` helper.  The trade-off is that
`v.fallback` silences parse errors for shortcut fields — invalid combos are corrected
without any log output.  A log warning is desirable but out of scope for this ticket (add
as a follow-up).

**Ghost registration note**: On first launch after upgrade, the main process starts fresh
with no prior `globalShortcut.register` calls.  Legacy `"Opt+Ç"` is repaired to the
default before `registerFromSettings` runs, so there is never an opportunity to register
a character-based accelerator.  No ghost registration cleanup is needed.

### Scope

| File | Change |
|------|--------|
| `src/shared/domain.ts` | Add `isValidShortcutCombo`, `SHORTCUT_MODIFIER_SEGMENTS`, `SHORTCUT_NAMED_KEY_SEGMENTS`; add `shortcutField` helper; tighten `SettingsSchema.shortcuts.*` with `v.fallback` |
| `src/main/services/settings-service.ts` | No changes needed (repair is handled by `v.fallback` in schema) |

### Checklist

- [ ] `isValidShortcutCombo` exported from `domain.ts`
- [ ] All 6 `shortcuts.*` fields in `SettingsSchema` use `v.fallback(v.pipe(v.string(), v.check(isValidShortcutCombo, ...)), defaultValue)`
- [ ] `TransformationPresetSchema.shortcut` is left as `v.string()` (empty string remains valid for presets)
- [ ] `v.parse(SettingsSchema, { ...defaults, shortcuts: { toggleRecording: 'Opt+Ç', ...rest } })` → succeeds, `toggleRecording` reset to default value
- [ ] App starts normally with a clean `settings.json` (all defaults pass `isValidShortcutCombo`)
- [ ] `setSettings` still throws for invalid shortcuts (not relaxed — `validateSettings` path unchanged)
- [ ] Existing tests in `profile-picker-service.test.ts` and `profiles-panel-react.test.tsx` continue to pass (shortcut `''` still valid for presets)

### Gate

> `isValidShortcutCombo("Opt+Ç")` → `false`
> `isValidShortcutCombo("Opt+Space")` → `true`
> `v.parse(SettingsSchema, { ...validSettings, shortcuts: { toggleRecording: 'Opt+Ç', ...otherValidShortcuts } })` → parses without throwing, `shortcuts.toggleRecording` equals the default value

---

## T-002 — Fix `toElectronAccelerator` Modifier-Only Guard

**Priority**: P1
**PR scope**: `src/main/services/hotkey-service.ts`

### Goal

Return `null` when `toElectronAccelerator` would produce a modifier-only accelerator (e.g.,
`"Alt"`, `"Alt+Shift"`).  This is defence-in-depth: T-001 should prevent bad combos from
reaching this function, but `toElectronAccelerator` must not silently produce dangerous
accelerators for any input.

### Approach

After building the `mapped` array, check that at least one element is not a known
Electron modifier string.  If the array is entirely modifiers, return `null`.

```typescript
// src/main/services/hotkey-service.ts — toElectronAccelerator

const ELECTRON_MODIFIER_VALUES = new Set(['CommandOrControl', 'Control', 'Alt', 'Shift'])

const toElectronAccelerator = (combo: string): string | null => {
  const parts = combo
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) return null

  const mapped = parts.map((part, index) => {
    const normalized = part.toLowerCase()
    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') return 'CommandOrControl'
    if (normalized === 'ctrl' || normalized === 'control') return 'Control'
    if (normalized === 'opt' || normalized === 'option' || normalized === 'alt') return 'Alt'
    if (normalized === 'shift') return 'Shift'
    if (index === parts.length - 1) {
      if (normalized.length === 1) return normalized.toUpperCase()
      return normalized[0].toUpperCase() + normalized.slice(1)
    }
    return null
  })

  if (mapped.some((part) => part === null)) return null

  // Guard: a modifier-only accelerator (e.g. "Alt", "Alt+Shift") fires for
  // every key press while the modifier is held — reject it.
  const hasNonModifier = mapped.some((p) => p !== null && !ELECTRON_MODIFIER_VALUES.has(p as string))
  if (!hasNonModifier) return null

  return mapped.join('+')
}
```

**Trade-off**: The new constant `ELECTRON_MODIFIER_VALUES` must stay in sync with the
modifier-mapping branches above.  Keeping it co-located (same file, same function) makes
the coupling explicit.

### Scope

| File | Change |
|------|--------|
| `src/main/services/hotkey-service.ts` | Add `ELECTRON_MODIFIER_VALUES`; add modifier-only guard before `return mapped.join('+')` |

### Checklist

- [ ] `toElectronAccelerator("Opt+\u00A0")` → `null` (trim removes key, only modifier remains)
- [ ] `toElectronAccelerator("Alt")` → `null`
- [ ] `toElectronAccelerator("Alt+Shift")` → `null`
- [ ] `toElectronAccelerator("Opt+Space")` → `"Alt+Space"` (still works)
- [ ] `toElectronAccelerator("Cmd+Opt+T")` → `"CommandOrControl+Alt+T"` (still works)

### Gate

> No `globalShortcut.register` call reaches Electron with a modifier-only accelerator string.

---

## T-003 — Fix U+00A0 Shortcut Capture and Activation UX

**Priority**: P1
**PR scope**: `src/renderer/shortcut-capture.ts`, `src/renderer/settings-shortcut-editor-react.tsx`
**Note**: T-003 can land independently.  Full end-to-end pipeline validation (renderer → save → accelerator → Electron) requires T-001 to be present so the schema accepts the stored `"Opt+Space"` via `setSettings`.

### Goal

Fix two independent renderer-side bugs that manifest when the user presses Opt+Space:

1. **Capture bug** (Bug 1): When `event.code` is absent, `normalizeMainKey('\u00A0')` returns
   `'\u00A0'` instead of `"Space"`, so the stored combo becomes `"Opt+\u00A0"`.
2. **Activation bug** (Bug 3): Pressing Space on an idle shortcut field activates capture
   mode, but pressing Opt+Space does not because `event.key === ' '` misses `'\u00A0'`.

### Approach

#### Fix 1 — Add U+00A0 to `NON_MODIFIER_KEY_LABELS`

```typescript
// src/renderer/shortcut-capture.ts
const NON_MODIFIER_KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  '\u00A0': 'Space',   // ← add: macOS Option+Space produces non-breaking space
  Spacebar: 'Space',
  // ... rest unchanged
}
```

This ensures the fallback path (`normalizeMainKey`) maps both regular and non-breaking
space to the label `"Space"`, matching what `normalizeMainKeyFromCode` returns for
`code="Space"`.

#### Fix 2 — Accept U+00A0 as space-to-activate in `handleCaptureKeydown`

```typescript
// src/renderer/settings-shortcut-editor-react.tsx  line ~192
const isSpaceKey = event.key === ' ' || event.key === '\u00A0'
if (capturingKey === null && (event.key === 'Enter' || isSpaceKey)) {
  event.preventDefault()
  event.stopPropagation()
  beginCapture(key)
}
```

**Trade-off**: The activation check has only two branches (Enter, Space) so extracting a
helper is not warranted — an inline `isSpaceKey` constant at the call site is clear enough.

### Scope

| File | Change |
|------|--------|
| `src/renderer/shortcut-capture.ts` | Add `'\u00A0': 'Space'` to `NON_MODIFIER_KEY_LABELS` |
| `src/renderer/settings-shortcut-editor-react.tsx` | Expand space-activate condition to include `'\u00A0'` |

### Checklist

- [ ] `normalizeMainKey('\u00A0')` → `"Space"`
- [ ] `formatShortcutFromKeyboardEvent({ altKey: true, code: undefined, key: '\u00A0', ... })` → `{ combo: "Opt+Space", error: null }`
- [ ] `formatShortcutFromKeyboardEvent({ altKey: true, code: "Space", key: '\u00A0', ... })` → `{ combo: "Opt+Space", error: null }` (existing happy path, must not regress)
- [ ] Pressing Opt+Space on an idle shortcut field activates capture mode (manual test)

### Gate

> Both `normalizeMainKey('\u00A0')` and `normalizeMainKeyFromCode("Space")` return `"Space"`.
> Combo produced from either path is identical: `"Opt+Space"`.

---

## T-004 — Remove `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`

**Priority**: P2
**Depends on**: T-001
**PR scope**: `src/renderer/shortcut-capture.ts`, `src/renderer/settings-validation.ts`

### Goal

Delete `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` and all code that references it.  After
T-001, the schema rejects symbol-form shortcuts at the persistence layer, so the duplicate-
detection canonicalization no longer needs to map old symbols back to base keys.

### Approach

#### 1. Delete the map from `shortcut-capture.ts`

Remove the entire `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` constant (lines 30–67).

#### 2. Simplify `canonicalizeShortcutForDuplicateCheck`

Remove the `.map((segment) => LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT[segment] ?? segment)`
step from the `nonModifiers` pipeline.  The function becomes:

```typescript
export const canonicalizeShortcutForDuplicateCheck = (shortcut: string): string => {
  const segments = shortcut
    .split('+')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0)

  const toCanonicalSegment = (segment: string): string => {
    if (segment === 'command' || segment === 'meta') return 'cmd'
    if (segment === 'control') return 'ctrl'
    if (segment === 'option' || segment === 'alt') return 'opt'
    return segment
  }

  const canonicalSegments = segments.map(toCanonicalSegment)
  const modifiers = canonicalSegments
    .filter((s): s is (typeof CANONICAL_MODIFIER_ORDER)[number] =>
      CANONICAL_MODIFIER_ORDER.includes(s as (typeof CANONICAL_MODIFIER_ORDER)[number]))
    .sort((a, b) => CANONICAL_MODIFIER_ORDER.indexOf(a) - CANONICAL_MODIFIER_ORDER.indexOf(b))
  const nonModifiers = canonicalSegments
    .filter((s) => !CANONICAL_MODIFIER_ORDER.includes(s as (typeof CANONICAL_MODIFIER_ORDER)[number]))

  return [...modifiers, ...nonModifiers].join('+')
}
```

**Trade-off**: If a user has a settings file with `"Opt+Ç"` and has NOT yet triggered the
T-001 repair (i.e., the file is read by a renderer-only code path before main-process
validation), duplicate detection would treat `"Opt+Ç"` and `"Opt+C"` as different.  This
is acceptable: T-001 ensures the main process never stores `"Opt+Ç"`, and after T-001
lands, the legacy map is purely dead code.

#### 3. Update file header comment

Update the comment on `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`'s former location to note
it was removed (or simply have no comment since the constant is gone).

### Scope

| File | Change |
|------|--------|
| `src/renderer/shortcut-capture.ts` | Delete `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`; remove the `.map(s => LEGACY... ?? s)` step from `canonicalizeShortcutForDuplicateCheck` |

> Note: `src/renderer/settings-validation.ts` is **not modified** — it uses
> `canonicalizeShortcutForDuplicateCheck` via import and continues to work correctly
> after the symbol-map step is removed.

### Checklist

- [ ] `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` constant is gone
- [ ] `canonicalizeShortcutForDuplicateCheck` contains no symbol-mapping step
- [ ] No other file imports or references `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`
- [ ] `canonicalizeShortcutForDuplicateCheck("Opt+C")` and `canonicalizeShortcutForDuplicateCheck("Opt+c")` → `"opt+c"` (still works)
- [ ] TypeScript build passes (`tsc --noEmit`)

### Gate

> `grep -r "LEGACY_OPTION_SYMBOL" src/` → zero results.

---

## T-005 — Regression Tests

**Priority**: P2
**Depends on**: T-001, T-002, T-003, T-004
**PR scope**: `src/main/services/hotkey-service.test.ts`, `src/renderer/shortcut-capture.test.ts`, `src/shared/domain.test.ts`, `src/main/services/settings-service.test.ts`

### Goal

Add targeted regression tests that encode every bug fixed in T-001–T-004.  Tests must fail
against the unfixed code and pass after each fix.

### Test Cases

#### `hotkey-service.test.ts` — `toElectronAccelerator`

```typescript
describe('toElectronAccelerator — bug-fix regression', () => {
  // T-002: modifier-only guard
  it('returns null for modifier-only combo after trim strips key (U+00A0)', () => {
    expect(toElectronAccelerator('Opt+\u00A0')).toBeNull()
  })
  it('returns null for bare modifier', () => {
    expect(toElectronAccelerator('Alt')).toBeNull()
  })
  it('returns null for multi-modifier no-key combo', () => {
    expect(toElectronAccelerator('Cmd+Opt')).toBeNull()
  })

  // Happy-path regression: must still work after fix
  it('converts Opt+Space correctly', () => {
    expect(toElectronAccelerator('Opt+Space')).toBe('Alt+Space')
  })
})
```

#### `shortcut-capture.test.ts` — `formatShortcutFromKeyboardEvent`

```typescript
describe('formatShortcutFromKeyboardEvent — Opt+Space regression', () => {
  // T-003: code-present path (must not regress)
  it('captures Opt+Space when code is present', () => {
    expect(formatShortcutFromKeyboardEvent({
      key: '\u00A0', code: 'Space',
      metaKey: false, ctrlKey: false, altKey: true, shiftKey: false
    })).toEqual({ combo: 'Opt+Space', error: null })
  })

  // T-003: Bug 1 fix — fallback path
  it('captures Opt+Space when code is absent (U+00A0 fallback)', () => {
    expect(formatShortcutFromKeyboardEvent({
      key: '\u00A0', code: undefined,
      metaKey: false, ctrlKey: false, altKey: true, shiftKey: false
    })).toEqual({ combo: 'Opt+Space', error: null })
  })
})
```

#### `domain.test.ts` — `isValidShortcutCombo`

```typescript
describe('isValidShortcutCombo', () => {
  it('accepts well-formed combos', () => {
    expect(isValidShortcutCombo('Cmd+Opt+T')).toBe(true)
    expect(isValidShortcutCombo('Opt+Space')).toBe(true)
    expect(isValidShortcutCombo('Ctrl+Shift+1')).toBe(true)
  })
  it('rejects legacy Unicode symbol keys', () => {
    expect(isValidShortcutCombo('Opt+Ç')).toBe(false)   // root cause
    expect(isValidShortcutCombo('Opt+√')).toBe(false)   // root cause
    expect(isValidShortcutCombo('Opt+\u00A0')).toBe(false) // non-breaking space
  })
  it('rejects modifier-only combos', () => {
    expect(isValidShortcutCombo('Opt')).toBe(false)
    expect(isValidShortcutCombo('Cmd+Opt')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isValidShortcutCombo('')).toBe(false)
  })
})
```

#### `settings-service.test.ts` — startup repair and save guard

```typescript
describe('SettingsService — legacy shortcut repair on load', () => {
  it('resets invalid shortcut to default without throwing', () => {
    const store = makeFakeStore({
      settings: {
        ...DEFAULT_SETTINGS,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, toggleRecording: 'Opt+Ç' }
      }
    })
    // v.fallback in schema silently resets; constructor must not throw
    const service = new SettingsService(store)
    expect(service.getSettings().shortcuts.toggleRecording)
      .toBe(DEFAULT_SETTINGS.shortcuts.toggleRecording)
  })

  it('preserves valid shortcuts unchanged', () => {
    const store = makeFakeStore({ settings: DEFAULT_SETTINGS })
    const service = new SettingsService(store)
    expect(service.getSettings().shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts)
  })
})

describe('SettingsService.setSettings — shortcut save guard', () => {
  it('throws when saving an invalid shortcut (save-time guard is not relaxed)', () => {
    const store = makeFakeStore({ settings: DEFAULT_SETTINGS })
    const service = new SettingsService(store)
    expect(() =>
      service.setSettings({
        ...DEFAULT_SETTINGS,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, toggleRecording: 'Opt+Ç' }
      })
    ).toThrow()
  })
})
```

### Checklist

- [ ] All new tests pass after their respective fix tickets
- [ ] No existing tests are deleted or weakened
- [ ] `vitest run` exits 0

### Gate

> `vitest run --reporter=verbose` shows green for every new `describe` block added by this ticket.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `isValidShortcutCombo` too strict — rejects valid user-configured combos | Low | Medium | Test all `DEFAULT_SETTINGS.shortcuts` values against the predicate; add any missing named-key entries to `SHORTCUT_NAMED_KEY_SEGMENTS` |
| `v.fallback` silently swallows shortcut errors with no user feedback | Medium | Low | Acceptable trade-off vs crashing; a follow-up ticket can add a log warning when fallback fires |
| `TransformationPresetSchema.shortcut` empty-string usage — not tightened | Low | Low | Intentionally left as `v.string()` to preserve the "no preset shortcut" use-case; see T-001 scope |
| T-004 removal of legacy map changes duplicate-detection canonicalization | Low | Low | After T-001, the schema resets symbol-form shortcuts; renderer sees only valid combos before duplicate check |
| Ghost registrations from legacy settings | None | None | On first launch after upgrade, `v.fallback` repairs shortcuts before `registerFromSettings` runs — no character-based accelerator is ever registered; no cleanup needed |
| `setSettings` guard unintentionally relaxed by `v.fallback` | None | High | `setSettings` uses `validateSettings` (cross-field checks), not the schema directly; `v.fallback` does not affect the `validateSettings` path; verified by the negative-path test in T-005 |
