---
title: Scratch-space Cmd+Enter blocking and retry bugs
description: Investigate the scratch-space Cmd+Enter flow for popup blocking, in-flight edit loss, duplicate submit, and retry-path defects.
date: 2026-04-08
status: concluded
tags:
  - research
  - scratch-space
  - electron
  - bugs
---

# Scratch-space Cmd+Enter blocking and retry bugs

## Scope

Files read for this investigation:

- `src/renderer/scratch-space-app.tsx`
- `src/renderer/scratch-space-app.test.tsx`
- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-window-service.test.ts`
- `src/main/infrastructure/frontmost-app-focus-client.ts`
- `src/main/services/output-service.ts`
- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/002-popup-window-handling-and-frontmost-behavior.md`

## Flow Summary

Current `Cmd+Enter` flow:

1. Renderer catches `Cmd+Enter` in `src/renderer/scratch-space-app.tsx:146-149`.
2. Renderer persists the draft, then awaits `runScratchSpaceTransformation()` in `src/renderer/scratch-space-app.tsx:98-103`.
3. IPC forwards that request to `ScratchSpaceService.runTransformation()` in `src/main/ipc/register-handlers.ts:375-381`.
4. Main process waits for `executeTransformation()` to finish in `src/main/services/scratch-space-service.ts:170-183`.
5. Only after that succeeds does main hide the popup in `src/main/services/scratch-space-service.ts:198`.
6. Main then restores focus and pastes in `src/main/services/scratch-space-service.ts:200-206`.

That ordering is the root of the primary bug and also exposes follow-on state bugs.

## Findings

### 1. P0: The scratch-space popup stays visible until the LLM returns, so the always-on-top window blocks the target app during the slowest part of the flow

Evidence:

- The scratch-space window is created as `alwaysOnTop: true` in `src/main/services/scratch-space-window-service.ts:87-96`.
- The renderer starts execution and waits on the IPC promise in `src/renderer/scratch-space-app.tsx:98-103`.
- The main service does not hide the popup until after `executeTransformation()` has already completed successfully in `src/main/services/scratch-space-service.ts:170-198`.
- The current service test only asserts that `hide()` happens sometime on success, not that it happens before the LLM call, in `src/main/services/scratch-space-service.test.ts:93-126`.

Why this is a bug:

- The user-reported behavior follows directly from the current order of operations: the popup remains present for the full LLM round-trip.
- Because the window is always on top, the user cannot reliably resume work in the original app while waiting for a slow provider response.
- If the provider stalls, the popup remains visible indefinitely unless the user manually dismisses it.

### 2. P1: The popup stays editable while the request is in flight, so successful completion can silently discard edits made during the wait

Evidence:

- The renderer marks the request busy with `setIsBusy(true)` but does not hide the popup or disable the draft textarea/profile picker in `src/renderer/scratch-space-app.tsx:95-103` and `src/renderer/scratch-space-app.tsx:180-243`.
- The popup remains visible until the main process gets a successful transformation result in `src/main/services/scratch-space-service.ts:170-198`.
- On success, the renderer unconditionally clears the current draft state in `src/renderer/scratch-space-app.tsx:109-110`.
- The main process also clears the persisted scratch draft after paste succeeds in `src/main/services/scratch-space-service.ts:224-225`.

Why this is a bug:

- A user can keep typing or change profiles while the LLM request is pending because the popup stays open and interactive.
- Those edits are not treated as a new draft version; when the first request succeeds, both the renderer and main process clear scratch-space state as if nothing changed during the wait.
- The result is silent data loss for post-submit edits made while the popup is still on screen.

### 3. P1: Duplicate `Cmd+Enter` or button submits can race before `isBusy` is committed, causing multiple transformations and multiple paste attempts

Evidence:

- `runTransformation()` uses React state as its only guard: `if (!settings || isBusy) return` in `src/renderer/scratch-space-app.tsx:90-93`.
- The same function sets `setIsBusy(true)` only after passing that guard in `src/renderer/scratch-space-app.tsx:95`.
- Both the keyboard path and button path call `runTransformation()` directly in `src/renderer/scratch-space-app.tsx:146-149` and `src/renderer/scratch-space-app.tsx:239-242`.
- There is no synchronous ref, mutex, or request token preventing a second call in the same render frame.

Why this is a bug:

- React state updates are not a synchronous lock.
- Two rapid `Cmd+Enter` keydown events, or a key press plus button click before re-render, can both observe `isBusy === false` and both issue `runScratchSpaceTransformation()` IPC requests.
- That can produce duplicate LLM requests, duplicate focus restores, and duplicate paste automation against the target app.

### 4. P1: Output-stage failure reopens scratch space with the default preset selected, silently changing the user’s chosen retry profile

Evidence:

- On output failure, the main service re-shows scratch space with `captureTarget: false` in `src/main/services/scratch-space-service.ts:207-216`.
- `show()` always sends `scratch-space:open` in `src/main/services/scratch-space-window-service.ts:53-67` and `src/main/services/scratch-space-window-service.ts:149-159`.
- The renderer handles every `onOpenScratchSpace` event by calling `refreshBootstrap()` in `src/renderer/scratch-space-app.tsx:123-125`.
- `refreshBootstrap()` always calls `resetSelectionToDefault()` in `src/renderer/scratch-space-app.tsx:76-82`.
- `resetSelectionToDefault()` overwrites the current selection with the default preset or first preset in `src/renderer/scratch-space-app.tsx:66-74`.
- The renderer test explicitly codifies this reset-on-reopen behavior in `src/renderer/scratch-space-app.test.tsx:206-237`.

Why this is a bug:

- If the user intentionally chose a non-default preset, and transformation succeeded but paste failed, the retry UI comes back with a different preset selected.
- The draft is preserved, but the execution context is not.
- A user can hit `Cmd+Enter` again expecting the same profile and instead run the default profile accidentally.

### 5. P2: If the user dismisses the still-open popup while a request is in flight, output failure will reopen it anyway and override the user’s close action

Evidence:

- `Escape` remains active even while `isBusy` is true; the handler persists the draft and hides the window in `src/renderer/scratch-space-app.tsx:138-142`.
- The popup remains open during the LLM wait because hide does not happen until after transformation success in `src/main/services/scratch-space-service.ts:170-198`.
- On output failure or thrown paste/focus error, the main service unconditionally calls `windowService.show({ captureTarget: false })` in `src/main/services/scratch-space-service.ts:207-216`.
- The service test asserts unconditional re-show on paste failure in `src/main/services/scratch-space-service.test.ts:128-148`.

Why this is a bug:

- Once the user has explicitly dismissed the popup during a long-running request, reopening it on failure ignores that choice.
- This is particularly disruptive because the reopen is triggered after the user already tried to get the blocking window out of the way.

## Test Coverage Gaps

- There is no renderer or service test asserting that the popup hides before the LLM call begins.
- There is no test asserting that post-submit draft edits are either blocked or preserved safely.
- There is no test for double-submit suppression on rapid `Cmd+Enter` or button interaction.
- Existing reopen coverage normalizes the selection-reset behavior instead of distinguishing fresh open from failure recovery.

## Conclusion

The reported blocking behavior is real and is caused by the current execution ordering: scratch space hides only after successful LLM completion. That same ordering creates a broader in-flight state problem: the popup remains interactive long enough to lose user edits, admit duplicate submits, reset retry profile context on output failure, and even reopen after the user explicitly dismissed it.
