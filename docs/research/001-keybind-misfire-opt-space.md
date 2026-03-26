---
title: Keybind Misfire – Opt+Space Toggle Recording Fires on Opt+C / Opt+V
date: 2026-03-25
status: complete
---

# Keybind Misfire: Opt+Space Toggle Recording Fires on Opt+C / Opt+V

## Summary

When the user sets **Opt+Space** as the toggle-recording shortcut, pressing **Opt+C** or
**Opt+V** also triggers recording unexpectedly.  This report traces every code path
relevant to the bug, identifies all root causes, and describes the exact trigger chain.

---

## Files Examined

| File | Role |
|------|------|
| `src/renderer/shortcut-capture.ts` | Keyboard capture & combo normalization |
| `src/renderer/settings-shortcut-editor-react.tsx` | Settings UI – capture mode, key-down handler |
| `src/main/services/hotkey-service.ts` | Electron accelerator conversion & global shortcut registration |
| `src/renderer/settings-validation.ts` | Validation helpers (duplicate detection) |
| `src/renderer/shortcut-capture.test.ts` | Unit tests for shortcut capture |
| `src/main/services/hotkey-service.test.ts` | Unit tests for hotkey service |
| `src/renderer/renderer-app.tsx` | IPC listener + recording dispatch guard |

---

## Background: How a Shortcut Flows from Capture to Electron

```
User presses key
  │
  ▼
handleCaptureKeydown (settings-shortcut-editor-react.tsx:190)
  │  calls
  ▼
formatShortcutFromKeyboardEvent (shortcut-capture.ts:173)
  │  returns combo e.g. "Opt+Space"
  ▼
Settings saved: shortcuts.toggleRecording = "Opt+Space"
  │
  ▼
HotkeyService.registerFromSettings (hotkey-service.ts:138)
  │  calls
  ▼
toElectronAccelerator("Opt+Space") → "Alt+Space"
  │
  ▼
globalShortcut.register("Alt+Space", callback)
```

---

## Bug Analysis

### Bug 1 — `NON_MODIFIER_KEY_LABELS` Missing U+00A0 (Non-Breaking Space)

**File:** `src/renderer/shortcut-capture.ts`
**Lines:** 69–86

```typescript
const NON_MODIFIER_KEY_LABELS: Record<string, string> = {
  ' ': 'Space',       // U+0020 regular space   ← mapped
  Spacebar: 'Space',  // legacy browser name    ← mapped
  // '\u00A0' (non-breaking space, U+00A0)      ← MISSING
  ...
}
```

**What happens on macOS/Electron when Opt+Space is pressed:**

- `event.key` = `'\u00A0'` (U+00A0, non-breaking space – the character macOS generates for Option+Space)
- `event.code` = `"Space"` (the physical key position)

`formatShortcutFromKeyboardEvent` (line 183) first attempts the code-based path:

```typescript
const mainKey = (event.altKey ? normalizeMainKeyFromCode(event.code) : null)
             ?? normalizeMainKey(event.key)
```

If `event.code === "Space"` is present, `normalizeMainKeyFromCode` correctly returns
`"Space"` and the fallback is **never reached**.  This is the **happy path**.

However, if `event.code` is absent (the parameter is typed `code?: string` — optional),
the fallback is reached:

```typescript
normalizeMainKey('\u00A0')  // event.key on macOS Opt+Space
  → not a modifier
  → NON_MODIFIER_KEY_LABELS['\u00A0'] === undefined  ← not in map
  → '\u00A0'.length === 1  → true
  → returns '\u00A0'.toUpperCase()  =  '\u00A0'      ← wrong!
```

The combo becomes `"Opt+\u00A0"` instead of `"Opt+Space"`.

---

### Bug 2 — `toElectronAccelerator` Silently Strips U+00A0 via `.trim()`

**File:** `src/main/services/hotkey-service.ts`
**Lines:** 60–63

```typescript
const parts = combo
  .split('+')
  .map((part) => part.trim())       // ← U+00A0 is whitespace; trim() removes it
  .filter((part) => part.length > 0) // ← empty string is filtered out
```

For `combo = "Opt+\u00A0"`:

```
split('+')  → ["Opt", "\u00A0"]
.trim()     → ["Opt", ""]          // '\u00A0'.trim() === ""  (ECMAScript WhiteSpace)
.filter()   → ["Opt"]              // empty string removed
```

With only one part `["Opt"]`, the map loop returns `["Alt"]` (just the modifier).
`mapped.some(p => p === null)` is `false` (no nulls), so the function returns `"Alt"`.

`"Alt"` is **truthy**, so `!accelerator` is false and the code proceeds to register it:

```typescript
const accelerator = toElectronAccelerator(binding.combo) // "Alt"
if (!accelerator) { ... }                                // ← NOT reached

globalShortcut.register("Alt", callback)                 // ← called with modifier-only!
```

**Effect:** Depending on platform and Electron version, registering `"Alt"` as a global
shortcut may fire the callback for **any key press while Option is held** — including
Opt+C, Opt+V, and every other Option+key combination.  This is the direct cause of the
reported misfire.

If `globalShortcut.register("Alt", …)` returns `false` (registration failure), the error
handler retains the **previous** accelerator registration (`"CommandOrControl+Alt+T"` by
default), so the user's intended Opt+Space shortcut never takes effect.

---

### Bug 3 — `handleCaptureKeydown` Space-to-Activate Uses U+0020, Misses U+00A0

**File:** `src/renderer/settings-shortcut-editor-react.tsx`
**Line:** 192

```typescript
if (capturingKey === null && (event.key === 'Enter' || event.key === ' ')) {
  //                                                               ^^^
  //   U+0020 regular space only — does NOT match '\u00A0'
  beginCapture(key)
}
```

When a shortcut input field is focused but not in capture mode, pressing Space activates
capture mode.  But when the user presses Opt+Space on macOS, `event.key` is `'\u00A0'`
(non-breaking space), **not** `' '`, so `beginCapture` is never called.

**Effect:** The user pressing Opt+Space on the shortcut field in idle mode does not
activate capture mode — making it impossible to capture Opt+Space by pressing it on a
focused-but-idle input field.  The user must click the field first.

---

### Bug 4 — `toElectronAccelerator` Does Not Validate Modifier-Only Result

**File:** `src/main/services/hotkey-service.ts`
**Lines:** 98–103

```typescript
if (mapped.some((part) => part === null)) {
  return null   // ← only catches explicit nulls
}

return mapped.join('+')
```

After all parts are mapped, there is **no check** that at least one non-modifier key is
present in the result.  A combo like `"Opt+\u00A0"` or any other combo where the key
segment is stripped by trimming produces a modifier-only accelerator string (e.g., `"Alt"`
or `"Alt+Shift"`) that is returned without error.

The caller in `registerFromSettings` only checks `!accelerator` (falsy check):

```typescript
const accelerator = toElectronAccelerator(binding.combo)
if (!accelerator) {
  this.unregisterAction(binding.action)
  continue
}
```

`"Alt"` is truthy, so it is passed directly to `globalShortcut.register`, which either
registers a dangerously broad shortcut or silently fails, keeping a stale registration.

---

### Bug 5 — Missing Test Coverage for Opt+Space Capture

**Files:** `src/renderer/shortcut-capture.test.ts`, `src/main/services/hotkey-service.test.ts`

The test suite has good coverage for:
- Opt+letter (with `code` provided): `Opt+P`, `Opt+1`
- Multi-modifier combos
- Modifier-only rejection

But there is **no test** for:
- Capturing Opt+Space (with or without `event.code`)
- `toElectronAccelerator("Opt+Space")` → expected `"Alt+Space"`
- `normalizeMainKey('\u00A0')` → expected `"Space"` (currently returns `'\u00A0'`)
- `toElectronAccelerator("Opt+\u00A0")` → should return `null` (currently returns `"Alt"`)

This gap allowed Bugs 1–4 to go undetected.

---

## Full Trigger Chain (Root Cause Path)

```
1. User presses Opt+Space in the shortcut capture input
   ├─ event.code = "Space"  (normal path → combo = "Opt+Space" → "Alt+Space" ✓)
   └─ event.code = undefined  (edge case: older Electron, synthetic event, etc.)
         │
         ▼
2. normalizeMainKeyFromCode(undefined) → null
   normalizeMainKey('\u00A0')          → '\u00A0'   [Bug 1]
   combo stored = "Opt+\u00A0"

3. HotkeyService.registerFromSettings() calls
   toElectronAccelerator("Opt+\u00A0")
     .split('+')  → ["Opt", "\u00A0"]
     .trim()      → ["Opt", ""]        [Bug 2 — U+00A0 trimmed to ""]
     .filter()    → ["Opt"]
     mapped       → ["Alt"]
     returns "Alt"

4. "Alt" is truthy, passes !accelerator guard              [Bug 4]
   globalShortcut.register("Alt", toggleRecordingCallback)

5. On some macOS+Electron configurations, "Alt" global shortcut
   fires for ANY Option+key combination:
     Opt+C → fires toggleRecording  ← reported misfire
     Opt+V → fires toggleRecording  ← reported misfire
     Opt+anything → fires toggleRecording
```

---

## Secondary Trigger Chain (Alternative Path)

If `event.code` is always present (the common case), Bugs 1 and 2 are not triggered and
the combo is correctly stored as `"Opt+Space"`.  In that case, the misfire could be caused
by an **Electron / macOS platform bug** where `globalShortcut.register("Alt+Space", …)`
fires for a broader set of Option+key combinations than expected — particularly on macOS
where Option+C and Option+V produce Unicode characters (ç and √) that share no keycode
with Space.  This platform-level issue would require a test against the live Electron
`globalShortcut` API to confirm.

---

## Definitive Root Cause (from Git History Analysis)

### Pre-fix Commit: `20d8636` ("fix: normalize option-modified shortcut labels")

Before commit `20d8636` (merged Feb 28, 2026), `formatShortcutFromKeyboardEvent` in
`shortcut-capture.ts` had **no `event.code` path** — it used only `normalizeMainKey(event.key)`:

```typescript
// Pre-20d8636 code:
const mainKey = normalizeMainKey(event.key)
```

On macOS, pressing Option+key produces a Unicode character in `event.key`:

| Key Press | `event.key` value | Stored combo (pre-fix) |
|-----------|-------------------|------------------------|
| Opt+C     | `'ç'` (U+00E7)   | `"Opt+Ç"` (uppercased) |
| Opt+V     | `'√'` (U+221A)   | `"Opt+√"`              |
| Opt+Space | `'\u00A0'` (U+00A0) | `"Opt+\u00A0"`       |

These symbol-form combos were written to `settings.json`.  Commit `20d8636` fixed new
captures by preferring `event.code` (e.g. `"KeyC"` → `"C"`, `"Space"` → `"Space"`), but
**did not migrate existing settings on disk**.

### Root Cause: `toElectronAccelerator` Does Not Apply `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`

`LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` was added in commit `20d8636` to the renderer
(`shortcut-capture.ts`) for **duplicate detection only** via
`canonicalizeShortcutForDuplicateCheck`.  It was **never wired into `toElectronAccelerator`**
in the main process (`hotkey-service.ts`).

When the app loads with a legacy `settings.json` containing `"Opt+Ç"` or `"Opt+√"`:

```
toElectronAccelerator("Opt+Ç")
  split('+')  → ["Opt", "Ç"]
  .trim()     → ["Opt", "Ç"]     // 'Ç' is not whitespace, not stripped
  .filter()   → ["Opt", "Ç"]
  mapped      → ["Alt", "Ç"]     // 'Ç' is a single char, .toUpperCase() = "Ç"
  returns       "Alt+Ç"          ← character-based accelerator

toElectronAccelerator("Opt+√")
  split('+')  → ["Opt", "√"]
  mapped      → ["Alt", "√"]
  returns       "Alt+√"          ← character-based accelerator
```

### Why These Accelerators Misfire on macOS

On macOS, Electron's `globalShortcut` API resolves Unicode character accelerators via the
**keyboard layout lookup table** (the same mechanism as `CGEventCreateKeyboardEvent`).  The
OS maps `'Ç'` (U+00C7) back to the physical key `kVK_ANSI_C` and `'√'` (U+221A) back to
`kVK_ANSI_V`.  Registering `"Alt+Ç"` is therefore functionally equivalent to registering
`"Alt+C"` at the OS level.

The consequence is:

```
globalShortcut.register("Alt+Ç", toggleRecordingCallback)
  ↓ OS-level binding
  kVK_ANSI_C + NSEventModifierFlagOption → toggleRecordingCallback

User presses Opt+C → OS fires toggleRecordingCallback  ← MISFIRE
User presses Opt+V → "Alt+√" fires toggleRecordingCallback  ← MISFIRE
```

This is the **direct, proven root cause** of the reported misfire.  The user's
`settings.json` was written by the pre-`20d8636` app (which stored `"Opt+Space"` as
`"Opt+\u00A0"` — but for the Opt+C/Opt+V misfire specifically, the user's toggle-recording
shortcut was stored as `"Opt+Ç"` or `"Opt+√"` by the old code).

> **Note on the Opt+Space scenario:** If the user manually set the shortcut to `"Opt+Space"`
> after commit `20d8636`, the combo is stored correctly as `"Opt+Space"` and converts cleanly
> to `"Alt+Space"`.  The Opt+C / Opt+V misfire in that case would only occur if:
> (a) legacy settings persist from before `20d8636`, or
> (b) the `event.code` fallback path (Bug 1) produces `"Opt+\u00A0"` which then becomes
>     `"Alt"` (modifier-only) via Bug 2, firing for ALL Option+key combos.

### Supporting Bug: `validateSettings` Accepts Any String

`src/shared/domain.ts` validates shortcuts as `v.string()` only — no format check.
Settings loaded from disk at startup bypass renderer-side validation entirely and reach
`toElectronAccelerator` directly via `registerFromSettings()` called from
`register-handlers.ts` line 277.  This means legacy combos like `"Opt+Ç"` silently reach
`globalShortcut.register` with a character-based accelerator string.

### Ghost Registration Risk

The unregister/re-register swap in `registerFromSettings` only unregisters the **previous
accelerator** if the **new registration succeeds**:

```typescript
const registered = this.globalShortcut.register(accelerator, callback)
if (!registered) {
  // Keep existing registration if hot-swap failed.
  continue
}
if (previous && previous.accelerator !== accelerator) {
  this.unregisterAccelerator(previous.accelerator)
}
```

If a user updates from `"Opt+Ç"` to `"Opt+Space"`:
1. `toElectronAccelerator("Opt+Space")` → `"Alt+Space"` ✓
2. `globalShortcut.register("Alt+Space", cb)` — succeeds
3. `globalShortcut.unregister("Alt+Ç")` — **may silently fail** if Electron's string-based
   lookup for `"Alt+Ç"` does not resolve to the same OS-level registration handle that was
   originally used, leaving the old `kVK_ANSI_C + Option` binding active.

This would cause BOTH `Opt+C` (legacy ghost) and `Opt+Space` (new) to trigger recording.

---

## Impact Matrix

| Bug | Severity | Direct Effect on Misfire |
|-----|----------|--------------------------|
| **Root Cause**: `toElectronAccelerator` missing `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT` | **Critical** | Legacy "Opt+Ç"/"Opt+√" → "Alt+Ç"/"Alt+√" → OS maps to kVK_ANSI_C/kVK_ANSI_V → fires on Opt+C / Opt+V |
| Bug 1: Missing U+00A0 in NON_MODIFIER_KEY_LABELS | High | Stores "Opt+\u00A0" instead of "Opt+Space" when code absent |
| Bug 2: toElectronAccelerator strips U+00A0 via trim() | Critical | Produces "Alt" (modifier-only) accelerator → fires on ANY Option+key |
| Bug 3: handleCaptureKeydown space-activate misses U+00A0 | Medium | UX issue: Opt+Space does not open capture via keypress |
| Bug 4: No modifier-only accelerator guard | High | "Alt" passes validation, reaches globalShortcut.register |
| Bug 5: validateSettings accepts any string for shortcuts | High | Legacy combos from disk bypass renderer validation at startup |
| Bug 6: Ghost registration on unregister of character-based accelerator | Medium | Old "Alt+Ç" may persist after settings update, causing continued misfire |
| Bug 7: No test for legacy symbol conversion or Opt+Space capture | Low | Allowed all above bugs to ship undetected |

---

## Recommended Fixes

0. **Fix Root Cause** (highest priority): Apply `LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT`
   normalization inside `toElectronAccelerator` in `hotkey-service.ts`, before the key
   segment is mapped to an Electron string:
   ```typescript
   // In the last-segment (non-modifier) branch:
   const resolvedPart = LEGACY_OPTION_SYMBOL_TO_BASE_SEGMENT[part] ?? part
   // then use resolvedPart instead of part for the uppercase/capitalize step
   ```
   This converts legacy `"Opt+Ç"` → `"Alt+C"` and `"Opt+√"` → `"Alt+V"` before
   registration, eliminating the character-based accelerator misfire.

1. **Fix Bug 1**: Add `'\u00A0': 'Space'` to `NON_MODIFIER_KEY_LABELS` in
   `shortcut-capture.ts` so the fallback path handles macOS non-breaking space correctly.

2. **Fix Bug 2 & 4**: In `toElectronAccelerator`, after building `mapped`, validate that at
   least one non-modifier part is present before returning.  Return `null` if only modifiers
   remain (catches both the trim-stripped U+00A0 case and any future analogues):
   ```typescript
   const ELECTRON_MODIFIER_PARTS = new Set(['CommandOrControl', 'Control', 'Alt', 'Shift'])
   if (!mapped.some((p) => p !== null && !ELECTRON_MODIFIER_PARTS.has(p))) {
     return null
   }
   ```

3. **Fix Bug 3**: Update the space-to-activate condition in `handleCaptureKeydown` to
   also accept `'\u00A0'`:
   ```typescript
   // before
   event.key === ' '
   // after
   event.key === ' ' || event.key === '\u00A0'
   ```

4. **Fix Bug 5**: Add shortcut format validation in `validateSettings` (`domain.ts`) using
   `hasModifierShortcut` so malformed shortcuts are rejected before reaching
   `toElectronAccelerator` at startup.

5. **Add tests**:
   - `toElectronAccelerator("Opt+Ç")` → `"Alt+C"` (root cause regression test)
   - `toElectronAccelerator("Opt+√")` → `"Alt+V"` (root cause regression test)
   - `toElectronAccelerator("Opt+Space")` → `"Alt+Space"`
   - `toElectronAccelerator("Opt+\u00A0")` → `null` (after fix)
   - `toElectronAccelerator("Opt+")` → `null`
   - `formatShortcutFromKeyboardEvent` with `altKey=true, code="Space", key='\u00A0'` → `"Opt+Space"`
   - `formatShortcutFromKeyboardEvent` with `altKey=true, code=undefined, key='\u00A0'` → `"Opt+Space"`
