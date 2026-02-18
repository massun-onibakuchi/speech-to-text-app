<!--
Where: specs/h1-spike-run-transformation-on-selection.md
What: Spike report — approaches for reading selected text from the frontmost macOS app.
Why: Phase 3A pre-requisite H1. Determines how runTransformationOnSelection reads
     cursor-selected text before dispatching to the transformation pipeline.
-->

# H1 — Spike: `runTransformationOnSelection` — Reading Selected Text

**Status:** Decision document
**Date:** 2026-02-17
**Phase:** 3A pre-requisite

## 1. Problem Statement

Spec §4.2 L171 requires a `runTransformationOnSelection` shortcut that executes
a transformation against the cursor-selected text in the **frontmost macOS app**
(not inside our Electron window). The app must:

1. Read the user's current text selection from any arbitrary macOS application.
2. Pass that text to the transformation pipeline as `textSource: 'selection'`.
3. Fail with actionable user feedback when no selection text exists.

This spike evaluates approaches, their trade-offs, and recommends a path.

## 2. Context

### Existing infrastructure

| Component | File | Relevance |
|---|---|---|
| `PasteAutomationClient` | `src/main/infrastructure/paste-automation-client.ts` | Already uses `osascript` + System Events to simulate `Cmd+V`. Proves AppleScript/System Events pattern works in our codebase. |
| `PermissionService` | `src/main/services/permission-service.ts` | Already checks Accessibility permission via `systemPreferences.isTrustedAccessibilityClient()`. |
| `ClipboardClient` | `src/main/infrastructure/clipboard-client.ts` | Wraps `electron.clipboard.readText()` / `writeText()`. |
| `TransformationRequestSnapshot` | `src/main/routing/transformation-request-snapshot.ts` | Already supports `textSource: 'clipboard' \| 'selection'` field. |

### Permission model

The app already requires **Accessibility permission** for paste-at-cursor
(`PasteAutomationClient`). Any approach that reuses the same Accessibility
permission avoids asking the user for a second grant.

## 3. Approaches Evaluated

### 3A. Cmd+C Clipboard Hack (AppleScript / System Events)

**How it works:**
1. Save current clipboard content.
2. Simulate `Cmd+C` via `osascript -e 'tell application "System Events" to keystroke "c" using command down'`.
3. Wait briefly for clipboard to update (~50–100 ms polling).
4. Read new clipboard content as selected text.
5. Restore original clipboard content.

**Pros:**
- Works in virtually **all macOS apps** (browsers, editors, Terminal, native apps, Electron apps).
- Same Accessibility permission already granted for paste-at-cursor — **no new permission**.
- Identical pattern to existing `PasteAutomationClient` (symmetry).
- Used by proven tools: PopClip (fallback), Raycast (Quick AI), `@xitanggg/node-selection`.
- No native addon required — pure `child_process.execFile('osascript', ...)`.
- Simple implementation, < 50 LOC.

**Cons:**
- **Clipboard side-effect**: temporarily overwrites clipboard. Must save/restore.
  - Restore is best-effort (cannot perfectly restore rich content types like images, RTF).
  - macOS 16 will introduce clipboard privacy alerts for programmatic clipboard reads — our app must trigger the Cmd+C from user intent (global shortcut), which should be classified as user-initiated.
- **Race condition window**: ~50–100 ms between simulating Cmd+C and reading clipboard.
  - If another app writes to clipboard in that window, we read stale/wrong data.
  - Mitigation: poll with `changeCount` on `NSPasteboard.general` (via Electron's clipboard API) to detect the change quickly.
- **Latency**: ~100–200 ms total (osascript spawn + clipboard settle + restore).
- **Empty selection**: If user has no selection and Cmd+C does nothing, clipboard keeps old content. Must detect "no change" to return actionable error.

### 3B. macOS Accessibility API (`AXUIElement` + `kAXSelectedTextAttribute`)

**How it works:**
1. Get focused UI element via `AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute)`.
2. Query `kAXSelectedTextAttribute` from that element.
3. Returns the selected text string directly (no clipboard involvement).

**Pros:**
- **No clipboard side-effect** — reads selection without touching clipboard.
- Low latency (~5–20 ms for the AX call itself).
- Clean separation — does not interfere with user's clipboard at all.
- Used by PopClip as primary method.

**Cons:**
- **Requires native Node addon** — AXUIElement is a C/Objective-C API. Must use:
  - `node-selection` (npm: `lujjjh/node-selection`) — macOS-only, uses AX API directly, or
  - `node-get-selected-text` (npm: `yetone/node-get-selected-text`) — cross-platform, AX primary + Cmd+C fallback, or
  - Custom native addon via `napi-rs` or `node-addon-api`.
- **Unreliable across apps**: Not all macOS apps expose `kAXSelectedTextAttribute` correctly:
  - **Browsers (Chrome, Firefox)**: May not expose selected text in web content via AX (works for native UI elements like URL bar but not for DOM content).
  - **Terminal**: Inconsistent AX support for text selections.
  - **Electron apps (Slack, VS Code)**: Known off-by-one bugs with AX text ranges.
  - **Some custom views**: Apps using custom drawing (games, canvases) have no AX text.
- **Build complexity**: Native addons require compilation (node-gyp or napi-rs), increase CI complexity, and must match Electron's Node ABI version.
- **No Accessibility prompt API**: Cannot programmatically request permission; can only open System Preferences pane (but we already have this permission).
- **Main thread blocking**: AX calls can block; need `AXUIElementSetMessagingTimeout` to bound latency.

### 3C. Pure AppleScript `selection` Property

**How it works:**
```applescript
tell application "TextEdit" to get selection as string
```

**Pros:**
- Clean, direct API for apps that support it.

**Cons:**
- **Only works for scriptable apps** with `selection` in their AppleScript dictionary.
- Does NOT work for: Chrome, Firefox, Terminal, VS Code, Slack, most modern apps.
- Would need to detect the frontmost app and choose the right AppleScript incantation per-app.
- **Not viable as a general solution.**

### 3D. macOS Services (`NSPasteboard` Services Menu)

**How it works:**
The app registers as a macOS Service provider. Users invoke it via the Services menu
or a keyboard shortcut defined by the system. macOS passes the selected text via
`NSPasteboard` to the service handler.

**Pros:**
- macOS-native approach, no clipboard hack.
- Works in apps that support the Services menu (most Cocoa apps).

**Cons:**
- **Not triggerable from a global shortcut**: Services are invoked from the app's Services menu
  or a system-assigned keyboard shortcut, not from our own global shortcut.
- **Does not work in all apps**: Non-Cocoa apps (Chrome, Electron apps, some Java/Qt apps) may not support Services.
- **UX mismatch**: Would require the user to learn a different invocation method than other shortcuts.
- **Implementation complexity**: Requires registering an `NSServiceProvider` from Electron, which has no built-in support.
- **Not viable for our shortcut-driven UX.**

### 3E. Hybrid: AX API Primary + Cmd+C Fallback

**How it works:**
1. First try `AXUIElement.kAXSelectedTextAttribute`.
2. If that returns null/empty (app doesn't support AX text), fall back to Cmd+C hack.

This is what `yetone/node-get-selected-text` does.

**Pros:**
- Best-of-both-worlds: fast + clean when AX works, universal fallback when it doesn't.
- Used by professional tools like PopClip.

**Cons:**
- Still requires native addon for the AX path.
- Complexity of two code paths + fallback logic.
- Build complexity same as 3B.
- Testing surface doubles.

## 4. Analysis Matrix

| Criterion | 3A: Cmd+C Hack | 3B: AX API | 3C: AppleScript | 3D: Services | 3E: Hybrid |
|---|---|---|---|---|---|
| App coverage | ~99% | ~70% | ~15% | ~60% | ~99% |
| Clipboard side-effect | Yes (save/restore) | None | None | None | Sometimes |
| New dependency | None | Native addon | None | Native addon | Native addon |
| Latency | ~100–200 ms | ~5–20 ms | ~50 ms | N/A | ~5–200 ms |
| Permission required | Accessibility ✓ | Accessibility ✓ | Accessibility ✓ | None | Accessibility ✓ |
| Build complexity | None | High | None | Very high | High |
| Implementation LOC | ~50 | ~100+ addon | ~30 | ~200+ | ~150+ addon |
| Matches existing patterns | Yes (PasteAutomation) | No | Partial | No | No |

## 5. Verdict: Approach 3A — Cmd+C Clipboard Hack

**Recommended approach: 3A (Cmd+C clipboard hack).**

### Rationale

1. **Near-universal coverage** (~99% of macOS apps). The AX-only path (3B) would silently fail in Chrome web content, Firefox, Terminal, and many Electron apps — exactly the apps our users are most likely to select text in.

2. **Zero new dependencies.** Avoids native addon build complexity. Our codebase already uses `osascript` via `PasteAutomationClient.pasteAtCursor()` — the selection reader is the symmetric counterpart.

3. **Same permission.** The app already requires Accessibility for paste-at-cursor. No new permission dialog.

4. **Proven pattern.** Used by Raycast, PopClip (as fallback), `@xitanggg/node-selection`, and countless macOS utilities.

5. **Simple implementation.** Can be built as `SelectionClient` in `src/main/infrastructure/` following `PasteAutomationClient`'s pattern.

### Why not Hybrid (3E)?

While Hybrid offers lower latency when AX works, the incremental benefit does not justify the native addon dependency, doubled test surface, and build complexity. The Cmd+C hack latency (~100–200 ms) is acceptable for a user-triggered shortcut action.

### Future upgrade path

If latency becomes a measurable problem (unlikely for shortcut-triggered actions), we can introduce the AX path later as an optimization **without** changing the public API. `SelectionClient.readSelection()` can internally switch strategies.

## 6. Limitations & Mitigations

| Limitation | Mitigation |
|---|---|
| Clipboard save/restore is lossy for rich content | Accept: transformation works on plain text. User's previous clipboard text is restored. Non-text clipboard items (images) are acknowledged as lost. Document this in user-facing help. |
| Race condition (~50–100 ms window) | Poll `clipboard.readText()` in a tight loop (5 ms intervals, 80 ms timeout) comparing against saved value. If clipboard doesn't change, report "no selection" error. |
| macOS 16 clipboard privacy alerts | Our Cmd+C simulation originates from a user-initiated global shortcut press, which should qualify as user-initiated paste activity. Monitor Apple's `NSPasteboard.accessBehavior` API changes. |
| Empty selection detection | Compare clipboard before/after Cmd+C simulation. If unchanged after timeout, return actionable error: "No text selected. Highlight text in the target app and try again." |
| Apps where Cmd+C is remapped | Rare edge case. Accept as known limitation. |

Implementation note: restore clipboard in a `finally` block so failures in `osascript` do not leak temporary clipboard state. Non-macOS platforms return `null` without invoking AppleScript.

## 7. Proposed Implementation Shape

```
src/main/infrastructure/selection-client.ts
```

```typescript
// Pseudocode — final implementation in Phase 3A.
export class SelectionClient {
  constructor(
    private readonly clipboard: ClipboardClient,
    private readonly execCommand: typeof execFileAsync
  ) {}

  async readSelection(): Promise<string | null> {
    const saved = this.clipboard.readText()

    // Simulate Cmd+C
    await this.execCommand('osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down'
    ])

    // Poll for clipboard change (max ~80 ms)
    const selected = await this.pollForChange(saved, 80)

    // Restore original clipboard
    this.clipboard.writeText(saved)

    return selected // null if clipboard didn't change
  }
}
```

### IPC Integration

No new IPC channel needed. The `SelectionClient` runs entirely in the main process.
The `CommandRouter` (or `ShortcutContextResolver` in Phase 3A) will call
`selectionClient.readSelection()` and create a `TransformationRequestSnapshot`
with `textSource: 'selection'`.

### Permission Check

Reuse existing `PermissionService.hasAccessibilityPermission()` before attempting
selection read. If denied, return actionable error immediately.

## 8. Open Questions for Implementation

1. **Clipboard restore for non-text content**: Should we use `clipboard.read('text/plain')`
   plus `clipboard.readImage()` to do a more complete save/restore? Or accept text-only restore?
   → Recommendation: Start with text-only. Revisit if user feedback indicates it's a problem.

2. **Poll timeout value**: `@xitanggg/node-selection` uses 80 ms default. Is this sufficient?
   → Recommendation: Use 80 ms default, make configurable via constructor param for testing.

3. **Concurrent shortcut presses**: If user presses `runTransformationOnSelection` twice quickly,
   two Cmd+C simulations could interfere. → Mitigation: debounce at HotkeyService level or
   serialize selection reads via a mutex/queue.
