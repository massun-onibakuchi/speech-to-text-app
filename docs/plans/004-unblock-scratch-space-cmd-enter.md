<!--
Where: docs/plans/004-unblock-scratch-space-cmd-enter.md
What:  Implementation plan for making scratch space Cmd+Enter non-blocking.
Why:   The window currently stays open until the LLM responds, blocking user actions.
       This plan fixes the root causes found in research/006-scratch-space-blocking-cmd-enter.md
-->

# Plan: Unblock Scratch Space Cmd+Enter

**Target branch:** `main`
**Research doc:** `docs/research/006-scratch-space-blocking-cmd-enter.md`
**Created:** 2026-04-04

---

## Summary

Three bugs combine to make the scratch space window block user actions after Cmd+Enter:

1. **[Primary]** `windowService.hide()` is called after the LLM completes, not before.
2. **[Secondary]** LLM failure path does not re-show the window after the fix is applied.
3. **[UX/Minor]** `isBusy` state is not reset when the window re-opens on error.

The fix is broken into two small tickets, sequenced so each can be reviewed independently.

---

## Tickets

### Ticket 1 — Fix main-process hide ordering (PRIMARY BUG)

**Priority:** P0 — This is the root cause. Must ship first.
**Target PR branch:** `fix/unblock-scratch-space`
**Depends on:** nothing

#### Goal
Move `windowService.hide()` to execute _before_ the LLM call in `ScratchSpaceService.runTransformation()`, so the popup closes immediately when the user triggers a transformation. Add the missing `windowService.show()` call on the LLM failure path so errors are surfaced correctly.

#### Files in scope
- `src/main/services/scratch-space-service.ts` (lines 141–232)
- `src/main/services/scratch-space-service.test.ts`

#### Approach
Minimal surgery: move one line, add `windowService.show()` to all error-return paths that occur after the hide. No new abstractions.

**Important constraint:** The three early-return validation paths (empty text, no preset, no `targetBundleId` — lines 142–168) run _before_ `windowService.hide()`. They must stay as-is: the window remains visible when these fire, giving the user immediate inline feedback. Only the LLM failure path (lines 185–195) changes.

**Before (current):**
```ts
// scratch-space-service.ts:170–198
const transformationResult = await executeTransformation({ ... })
// ← window is still open here (BUG)

if (!transformationResult.ok) {
  return { status: 'error', message: ..., text: null }  // ← no re-show on later fix
}

this.windowService.hide()   // ← only hidden on success, AFTER LLM
```

**After (fixed):**
```ts
// Validation returns (unchanged — window stays open for these fast-path errors):
// - empty text → return error
// - no preset  → return error
// - no targetBundleId → return error

// Hide immediately before LLM so user is unblocked
this.windowService.hide()

const transformationResult = await executeTransformation({ ... })

if (!transformationResult.ok) {
  // Re-show so user can see error and retry
  await this.windowService.show({ captureTarget: false })
  return {
    status: 'error',
    message:
      transformationResult.failureCategory === 'preflight'
        ? transformationResult.failureDetail.startsWith('Unsafe user prompt template:')
          ? `Transformation blocked: ${transformationResult.failureDetail}`
          : transformationResult.failureDetail
        : `Transformation failed: ${transformationResult.failureDetail}`,
    text: null
  }
}

// (existing paste path is unchanged — already re-shows on paste failure)
```

#### Trade-offs
- **Simpler than async IPC refactor:** A fire-and-forget IPC would decouple the error result from the window lifecycle but requires a new IPC event channel and renderer listener. Moving the hide line is a one-line change with the same UX outcome.
- **Double-hide is safe:** If the renderer also calls `hideScratchSpaceWindow()` (Ticket 2), calling `hide()` on an already-hidden window is a no-op in Electron. This is the key safety argument for the combined approach.
- **Window re-open latency:** On LLM error, the user sees a brief hide+show. This is preferable to blocking; the draft is preserved so context is not lost.
- **Sound play order:** The `soundService.play()` call in `register-handlers.ts` fires after the full IPC round-trip. On the error path, the sound plays before the window re-shows. This is not a regression — just worth noting.

#### Checklist
- [ ] Move `this.windowService.hide()` to before `executeTransformation()` call
- [ ] Add `await this.windowService.show({ captureTarget: false })` in the LLM failure branch (lines 185–195)
- [ ] Confirm the three early-return validation paths (empty text, no preset, no targetBundleId) are NOT affected — window must remain visible for these fast errors
- [ ] Update tests in `scratch-space-service.test.ts`:
  - [ ] Assert `windowService.hide()` is called before transformation completes (on success)
  - [ ] Assert `windowService.hide()` is called before the LLM fails
  - [ ] Assert `windowService.show({ captureTarget: false })` is called on LLM failure
  - [ ] Assert validation early-return paths (empty text) do NOT call `windowService.hide()` or `windowService.show()`

#### Definition of Done
- `windowService.hide()` is invoked prior to `executeTransformation()` in every code path
- `windowService.show({ captureTarget: false })` is invoked on every error return that occurs AFTER the hide
- Validation failures (empty text, no preset, no targetBundleId) leave the window visible
- All existing tests pass; new tests cover the scenarios above

---

### Ticket 2 — Renderer: close window immediately + reset isBusy on re-open

**Priority:** P1 — Hardens the UX. Depends on Ticket 1.
**Target PR branch:** `fix/unblock-scratch-space` (same PR or follow-up)
**Depends on:** Ticket 1 (main-process fix must land first; Ticket 2 is additive hardening)

#### Goal
1. Fire-and-forget `hideScratchSpaceWindow()` from the renderer as soon as Cmd+Enter is pressed — this ensures the window disappears even before the main-process IPC round-trip arrives at the LLM call.
2. Reset `isBusy` to `false` when the `onOpenScratchSpace` event fires — prevents a frozen UI when the window re-opens on error.
3. Use `keepDraft: true` in the re-open path to preserve the user's unsaved draft edits (not just what was last persisted to disk).

#### Files in scope
- `src/renderer/scratch-space-app.tsx` (lines 90–134)
- `src/renderer/scratch-space-app.test.tsx` (existing test harness already mocks `hideScratchSpaceWindow`)

#### Approach

**Change A — fire-and-forget hide in `runTransformation()`:**

> **Important constraint:** The renderer fire-and-forget hide only fires AFTER `persistDraftNow` completes and only for the transformation path. The three validation early-returns in the service (empty text, no preset, no targetBundleId) all occur _before_ the main process calls `this.windowService.hide()` (Ticket 1), meaning those errors return while the window is still visible. The renderer fire-and-forget hide has no effect on those paths because it is fired BEFORE the IPC call — the main process will check these conditions first and return without hiding. The window stays open for those fast validation errors. ✓

```ts
const runTransformation = async (): Promise<void> => {
  if (!settings || isBusy) return

  setIsBusy(true)
  setError('')

  try {
    await persistDraftNow(draftRef.current)
    // Close immediately — non-blocking. Main process also hides via the service
    // layer (Ticket 1), so double-hide is a no-op. Doing it here avoids waiting
    // for the full IPC round-trip through validation + LLM before the window closes.
    // NOTE: If the main process returns a fast validation error (empty text, no
    // preset, no targetBundleId), the window will have already been hidden here.
    // Those error messages will be displayed when the window re-opens via the
    // main process's show() call in those early-return paths... wait, actually
    // those early-return paths do NOT call show(). So we must NOT hide here for
    // those cases. See constraint note above — validation errors are rare and
    // users will retry after re-opening via the global shortcut.
    void window.speechToTextApi.hideScratchSpaceWindow()

    const result = await window.speechToTextApi.runScratchSpaceTransformation({
      text: draftRef.current,
      presetId: selectedPresetId
    })
    if (result.status === 'error') {
      setError(result.message)
      // Note: if this error came from a fast validation path (not LLM failure),
      // the window is already hidden. The error message is set but not visible.
      // This is an acceptable trade-off: validation errors are rare (text is
      // checked by the UI render — empty textarea shows disabled button).
      return
    }
    draftRef.current = ''
    setDraft('')
    setError('')
  } finally {
    setIsBusy(false)
  }
}
```

> **Known acceptable gap:** The `targetBundleId` missing error and no-preset error are not shown to the user when Change A is active (window already hidden). These are edge-case errors that happen only if the user opens scratch space in an unusual way. The `draftRef.current` is still persisted, so no work is lost. The user can re-open the window via the global shortcut to retry. This is documented explicitly as a trade-off. If we want to avoid this gap entirely, guard the fire-and-forget hide with a local check: `if (draftRef.current.trim().length > 0) void hideScratchSpaceWindow()`. This avoids hiding on the empty-text case (which is the most common validation failure).

**Recommended guard (cleaner option):**
```ts
// Only pre-emptively hide if we have text to transform; empty-text errors
// should remain visible inline. Other validation errors (no preset, no target)
// are rare and acceptable to miss in exchange for the non-blocking close.
if (draftRef.current.trim().length > 0) {
  void window.speechToTextApi.hideScratchSpaceWindow()
}
```

**Change B — reset `isBusy` and keep draft in `onOpenScratchSpace` handler:**

Race condition analysis: When the window re-opens after an LLM error, two things happen nearly simultaneously:
1. `onOpenScratchSpace` fires → `setIsBusy(false)` + `refreshBootstrap({ keepDraft: true })`
2. The in-flight `runScratchSpaceTransformation` IPC resolves → `setError(result.message)`, `setIsBusy(false)` (via finally)

In both orderings this is benign: `setIsBusy(false)` is idempotent; `setError` fires after `refreshBootstrap` completes (since refreshBootstrap is async) or before it (in which case error is set first, then draft/settings refresh, but error is not cleared by refreshBootstrap). Either way the user sees the error message and an active button.

```ts
const unlistenOpenScratchSpace = window.speechToTextApi.onOpenScratchSpace(() => {
  // Reset busy state in case the window re-opens while a transformation is still
  // in flight (e.g., LLM error path). The in-flight IPC will resolve harmlessly
  // and setIsBusy(false) in the finally block is idempotent.
  setIsBusy(false)
  // keepDraft: true preserves the in-memory draftRef value (unsaved edits since
  // the last 180ms debounce) rather than overwriting from persisted storage.
  void refreshBootstrap({ keepDraft: true })
})
```

#### Trade-offs
- **Why `void hideScratchSpaceWindow()` and not `await`?** Awaiting it adds a round-trip delay before the transformation IPC starts. Fire-and-forget is safe because double-hide is a no-op in Electron.
- **Why `keepDraft: true` on re-open?** Preserves in-memory unsaved edits since the last 180ms debounce, not just what was written to disk. Without this, a user's last keystrokes before Cmd+Enter could be lost on re-open.
- **Why reset `isBusy` on re-open?** The in-flight IPC has not returned when the window re-opens. Without this reset, the button is disabled and Cmd+Enter does nothing until the LLM finishes — a confusing frozen state.
- **Preset selection reset on re-open:** `refreshBootstrap` calls `resetSelectionToDefault()` which resets the preset to the default. Users who selected a non-default preset will need to re-select it to retry. This is a pre-existing behaviour, not a regression of this fix.

#### Checklist
- [ ] Add guarded `void window.speechToTextApi.hideScratchSpaceWindow()` in `runTransformation()` after `persistDraftNow` (guard: `draftRef.current.trim().length > 0`)
- [ ] Add `setIsBusy(false)` in the `onOpenScratchSpace` handler before `refreshBootstrap`
- [ ] Change `onOpenScratchSpace` handler to use `refreshBootstrap({ keepDraft: true })`
- [ ] Add renderer test: assert `hideScratchSpaceWindow` is called once on Cmd+Enter when text is non-empty (test harness mock already exists)
- [ ] Add renderer test: assert `hideScratchSpaceWindow` is NOT called on Cmd+Enter when textarea is empty
- [ ] Manually verify: window closes immediately on Cmd+Enter on macOS
- [ ] Manually verify: error re-opens window with original draft text and active button

#### Definition of Done
- Pressing Cmd+Enter with non-empty text closes the window before any LLM response is received
- If transformation fails, window re-opens with draft preserved and button enabled
- Empty-text Cmd+Enter shows inline error (window stays open)
- All existing tests pass; new renderer tests cover the hide guard

---

## Execution Order

```
Ticket 1 (main-process fix)
    ↓
Ticket 2 (renderer hardening)
    ↓
Manual QA: macOS + verify error-retry flow
    ↓
PR to main
```

Ticket 2 can technically be done in parallel if a different engineer takes it, but it is additive and safe to skip if time is short — Ticket 1 alone fixes the primary blocking issue.

---

## Out of Scope

- Speech-to-text path (`transcribeAudio`) — not affected by this bug
- Global shortcut registration — not changed
- Error message copy / styling — out of scope
- Windows/Linux platform differences — `windowService.hide()` is platform-agnostic
