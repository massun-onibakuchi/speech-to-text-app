<!--
Where: docs/research/006-scratch-space-blocking-cmd-enter.md
What:  Bug analysis for the scratch space Cmd+Enter blocking issue.
Why:   Documents root causes, code paths, and bugs found so the fix plan is grounded
       in actual code evidence rather than guesses.
-->

# Research: Scratch Space Cmd+Enter Blocking Issue

**Date:** 2026-04-04
**Branch:** fix/unblock-scratch-space

---

## Problem Statement

When the user presses **Cmd+Enter** inside the scratch space window, the popup **stays open until the LLM responds**. This blocks all user operations in the scratch space during the entire LLM round-trip (which can take 2–30 seconds). Expected behaviour: the window closes immediately and the transformation runs in the background.

---

## Code Paths Investigated

| File | Role |
|------|------|
| `src/renderer/scratch-space-app.tsx` | React UI — keydown handler, `runTransformation()` |
| `src/main/services/scratch-space-service.ts` | Main-process orchestrator — LLM call, hide, paste |
| `src/main/services/scratch-space-window-service.ts` | Window lifecycle — `show()` / `hide()` |
| `src/main/ipc/register-handlers.ts` (lines 375–382) | IPC wiring — `runScratchSpaceTransformation` handler |
| `src/shared/ipc.ts` | IPC channel definitions |

---

## Complete Flow (Current, Buggy)

```
Cmd+Enter pressed in textarea
  → renderer: scratch-space-app.tsx:146-148
      event.metaKey && event.key === 'Enter'
      → runTransformation()

  → renderer: scratch-space-app.tsx:90-115 (runTransformation)
      setIsBusy(true)                            ← button disabled, UI "locked"
      await persistDraftNow(...)
      await window.speechToTextApi               ← RENDERER BLOCKED HERE
            .runScratchSpaceTransformation(...)  ← waiting for IPC response

  → IPC → main process: register-handlers.ts:375-382
      ipcMain.handle('runScratchSpaceTransformation', async (_event, payload) => {
        const result = await svc.scratchSpaceService.runTransformation(payload)
        // ↑ entire transformation + paste pipeline runs here — window still visible
        svc.soundService.play(result.status === 'ok' ? ... : ...)
        return result
      })

  → main: scratch-space-service.ts:141-232 (runTransformation)
      1. Validate text (fast)
      2. Resolve preset (fast)
      3. Check targetBundleId (fast)
      4. executeTransformation(...)       ← LLM CALL — can take 2-30 s
         (window is still OPEN here ← BUG)
      5. if LLM ok:
           this.windowService.hide()      ← window hides ONLY after LLM completes
           focusClient.activateBundleId()
           outputService.applyOutput()
      6. Return result to renderer

  → renderer receives IPC result
      setIsBusy(false)
      window is already hidden (on success) or still open (on paste/LLM error)
```

**The window stays open for the entire duration of the LLM call.** The user cannot type, close, or interact with any other part of the scratch space UI while waiting.

---

## Bugs Found

### Bug 1 — `windowService.hide()` is called AFTER the LLM completes (primary)

**File:** `src/main/services/scratch-space-service.ts`
**Line:** 198

```ts
// Line 170-183: LLM runs here (window still open)
const transformationResult = await executeTransformation({ ... })

// Line 185-196: error return — window stays open (correct for current design,
//               but wrong after the fix is applied because hide moved earlier)

// Line 198: hide called only AFTER success
this.windowService.hide()           // ← TOO LATE
```

The window should be hidden **before** `executeTransformation()` is called, not after.

---

### Bug 2 — LLM failure path does not re-show the window (secondary, latent)

**File:** `src/main/services/scratch-space-service.ts`
**Lines:** 185–195

```ts
if (!transformationResult.ok) {
  return {
    status: 'error',
    message: ...,
    text: null
    // ← window.show() is MISSING here
  }
}
```

Currently this bug is masked because the window is never hidden before the LLM call (Bug 1). After Bug 1 is fixed (hide moved earlier), this path will return an error result while the window is hidden — the user will never see the error.

Compare with the **paste failure path** (lines 207–213 and 215–221), which correctly calls `this.windowService.show({ captureTarget: false })` before returning the error:

```ts
if (outputResult.status === 'output_failed_partial') {
  await this.windowService.show({ captureTarget: false })   // ← present here
  return { status: 'error', ... }
}
```

---

### Bug 3 — Renderer `isBusy` guard keeps UI locked while window is hidden (UX, minor)

**File:** `src/renderer/scratch-space-app.tsx`
**Lines:** 91, 242

```ts
if (!settings || isBusy) return   // line 91 — blocks new invocations

<button disabled={isBusy} ...>    // line 242 — button visually disabled
```

After the window is hidden (Bug 1 fix), `isBusy` stays `true` until the IPC promise resolves. This means when the window re-opens on error, the button is disabled and the Cmd+Enter shortcut does nothing until the LLM call completes. Users attempting to cancel or modify text see a frozen UI.

The fix should clear `isBusy` (or rely on window re-open refreshing state) before re-showing the window.

---

## Fix Strategy

### Approach: Move hide before LLM call + add re-show on all error paths

This is the minimal-change, low-risk fix:

**Change 1 — `scratch-space-service.ts`**
Move `this.windowService.hide()` from line 198 (after LLM) to just before `executeTransformation()` (line 170). Add `await this.windowService.show({ captureTarget: false })` in the LLM failure path (lines 185–195).

```ts
// Hide immediately — user is unblocked
this.windowService.hide()

const transformationResult = await executeTransformation({ ... })

if (!transformationResult.ok) {
  // Re-show so user can see error and retry
  await this.windowService.show({ captureTarget: false })
  return { status: 'error', message: ..., text: null }
}

// paste path continues as-is (already re-shows on paste failure)
```

**Change 2 — `scratch-space-app.tsx` (optional hardening)**
Add a fire-and-forget `hideScratchSpaceWindow()` call in `runTransformation()` right after `persistDraftNow`. This ensures the window closes even if the main-process IPC is delayed:

```ts
await persistDraftNow(draftRef.current)
void window.speechToTextApi.hideScratchSpaceWindow()   // non-blocking close
const result = await window.speechToTextApi.runScratchSpaceTransformation(...)
```

This is defensive: the main process will also hide via the service change, but a renderer-side close is faster (avoids a round-trip to the LLM error path before the hide happens when validation fails early).

**Change 3 — `scratch-space-app.tsx` (Bug 3 fix)**
When the window re-opens (via `onOpenScratchSpace`), `refreshBootstrap()` runs and resets state. The `isBusy` flag is NOT reset by `refreshBootstrap()`. We should reset `isBusy` in the `onOpenScratchSpace` handler, or call `setIsBusy(false)` before `windowService.show()` in the main process (not possible from main), or handle it in the renderer's event listener:

```ts
const unlistenOpenScratchSpace = window.speechToTextApi.onOpenScratchSpace(() => {
  setIsBusy(false)   // reset busy state when window reopens
  void refreshBootstrap({ keepDraft: true })   // keepDraft: preserve error context
})
```

---

## Risk Assessment

| Change | Risk | Reason |
|--------|------|--------|
| Move hide before LLM call | Low | Existing re-show-on-error pattern already exists for paste failures |
| Add re-show on LLM failure | Low | Mirrors existing pattern exactly |
| Renderer fire-and-forget hide | Low | Double-hide is a no-op (`hide()` on already-hidden window is safe) |
| Reset isBusy on re-open | Low | `refreshBootstrap()` already re-initialises all other state |

**No backward-compatibility concerns** — this is purely a UX timing fix with no API contract changes.

---

## Tests to Update

- `src/main/services/scratch-space-service.test.ts` — add test asserting `windowService.hide()` is called **before** the transformation, and `windowService.show()` is called on LLM failure
- `src/renderer/scratch-space-app.tsx` — if renderer tests exist (currently none found), add test that `hideScratchSpaceWindow` is called immediately on Cmd+Enter
