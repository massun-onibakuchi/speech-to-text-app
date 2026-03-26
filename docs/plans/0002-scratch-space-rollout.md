---
title: Scratch Space rollout plan
description: Break the scratch-space feature into prioritized, reviewable ticket-sized PRs with implementation gates and risks.
date: 2026-03-26
status: active
review_by: 2026-04-02
tags:
  - planning
  - scratch-space
  - rollout
---

# Scratch Space rollout plan

## Goal

Deliver the scratch-space feature as a sequence of small PRs without starting implementation work until the plan is reviewed. Each ticket below maps to exactly one PR and is sized to preserve testability, rollback safety, and code review clarity.

## Priority order

| Priority | Ticket | PR scope | Depends on |
| --- | --- | --- | --- |
| P0 | Ticket 1 | Contracts + floating window shell + persisted draft store | none |
| P1 | Ticket 2 | Renderer popup UX + keyboard-only interaction model | Ticket 1 |
| P1 | Ticket 3 | Speech input + transform-and-paste execution pipeline | Ticket 1, Ticket 2 |
| P2 | Ticket 4 | Durable docs sync + final cleanup | Ticket 1, Ticket 2, Ticket 3 |

## Ticket 1: Contracts and floating window shell

### Goal

Create the minimal main-process foundation for scratch space:
- a configurable `openScratchSpace` shortcut
- a floating scratch-space window service
- a stable frontmost-target capture policy
- draft persistence outside the Settings schema
- IPC contracts that expose the window and draft lifecycle safely

### Approach

Establish the new feature behind explicit shared contracts first so later tickets do not need to refactor persisted settings or IPC shapes mid-flight. The window should exist before the renderer UI logic lands, because keyboard-trigger/open/close behavior and draft restoration are the critical integration seams.

### Scope files

- `src/shared/domain.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/services/hotkey-service.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/core/app-lifecycle.ts`
- `src/main/services/scratch-space-window-service.ts`
- `src/main/services/scratch-space-draft-service.ts`
- `src/main/services/*test.ts` for new service coverage

### Checklist

- Add `openScratchSpace` to persisted shortcuts with a default keybinding.
- Register the new hotkey in the main process without breaking existing shortcut rebinding behavior.
- Add a dedicated floating scratch-space window service that can show/hide without destroying renderer state.
- Capture the pre-popup frontmost app exactly once per popup session and preserve it while the popup stays open.
- Persist the scratch draft in a separate storage file, not in `settings`.
- Add preload + IPC methods for:
  - get draft
  - set draft
  - hide scratch window
  - notify renderer when the scratch window opens
- Ensure explicit app quit marks both main and scratch windows as quitting.

### Tasks

1. Extend the settings schema with `shortcuts.openScratchSpace`.
2. Extend shared IPC contracts for scratch-space window/draft operations.
3. Implement a `ScratchSpaceDraftService` with corruption-safe recovery.
4. Implement a `ScratchSpaceWindowService` that manages one floating window instance and one stable paste target.
5. Wire the new hotkey to the window service.
6. Add focused unit tests for hotkey registration and draft persistence.

### Gates

- `pnpm typecheck` passes.
- New shortcut is covered by hotkey tests.
- Draft persistence survives reload/corruption in tests.
- The scratch window service cannot overwrite the paste target when reopened while already visible.

### Trade-offs

- Separate draft storage keeps large or transient user text out of the Settings schema, but introduces one more persistence file to maintain.
- Reusing the existing renderer bundle with a query-param window mode is cheaper than a second renderer entry, but it requires careful boot branching in `src/renderer/main.ts`.

### Code sketch

```ts
shortcuts: {
  ...existingShortcuts,
  openScratchSpace: 'Cmd+Opt+D'
}

ipcMain.handle(IPC_CHANNELS.getScratchSpaceDraft, () => draftService.getDraft())
ipcMain.handle(IPC_CHANNELS.hideScratchSpaceWindow, () => scratchWindow.hide())
```

## Ticket 2: Scratch-space renderer UX and keyboard model

### Goal

Build the popup UI as a dedicated renderer mode with a multi-line draft area, keyboard-navigable profile list, `Esc` close behavior, restored draft/default profile behavior, and renderer-side event wiring only.

### Approach

Keep the popup renderer independent from the main settings shell. The UI should be intentionally small and utility-focused: one drafting surface, one profile list, one speech control, and one execute action. Use a native `<select>` for profile choice to guarantee keyboard navigation instead of building a custom combobox in the first pass.

### Scope files

- `src/renderer/main.ts`
- `src/renderer/scratch-space-app.tsx`
- `src/renderer/styles.css` only if new utility styles are genuinely required
- `src/renderer/scratch-space-app.test.tsx`

### Checklist

- Branch renderer boot by window mode.
- Render a dedicated scratch-space UI with:
  - text area
  - profile list
  - speech button
  - transform button
- Restore persisted draft on load/open.
- Reset selected profile to `defaultPresetId` each time the popup opens.
- Support keyboard-only profile navigation.
- Handle `Escape` by saving the latest draft and hiding the window.
- Wire `Cmd+Enter` to dispatch scratch-space execution IPC, but keep execution semantics out of this PR.
- Prevent event-listener leaks across rerenders/unmounts.

### Tasks

1. Add a renderer boot branch for `?window=scratch-space`.
2. Implement `ScratchSpaceApp`.
3. Add draft autosave with a short debounce and a forced flush on `Escape`/blur.
4. Add popup-specific tests for:
  - draft restore
  - default profile selection
  - `Cmd+Enter` IPC dispatch
  - `Escape`

### Gates

- Renderer test proves `Cmd+Enter` dispatches scratch-space execution with the selected profile and current draft.
- Renderer test proves `Escape` persists the draft and hides the window.
- Renderer test proves reopening resets the profile to the default preset.

### Trade-offs

- Native `<select>` is less visually custom than a Radix-driven control, but it materially lowers keyboard/a11y risk for the first shipping pass.
- Debounced saves reduce write volume, but require explicit flush paths on close/blur to avoid dropping the latest edit.

### Code sketch

```tsx
if (windowType === 'scratch-space') {
  startScratchSpaceApp(mountPoint)
} else {
  startRendererApp(mountPoint)
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideScratchSpace()
  if (event.key === 'Enter' && event.metaKey) dispatchScratchExecution()
})
```

## Ticket 3: Speech input and forced transform-paste pipeline

### Goal

Implement the feature’s functional core:
- speech-to-draft transcription inside scratch space
- selected-profile transformation
- paste back to the app that was frontmost before scratch space opened
- draft clearing only after successful execution

Dependency note:
- Ticket 3 assumes Ticket 2 already proves popup-local keyboard behavior and draft flush behavior, so this PR can focus on main-process execution semantics instead of reworking renderer-state basics.

### Approach

Do not reuse the normal capture pipeline end-to-end. Scratch space needs transcript insertion into the draft, not capture history/output side effects. Create a scratch-specific service that reuses the same STT/LLM services and preflight rules, while forcing output to `copyToClipboard=true` and `pasteAtCursor=true` for the final execution path.

### Scope files

- `src/main/services/scratch-space-service.ts`
- `src/main/services/scratch-space-service.test.ts`
- `src/main/infrastructure/frontmost-app-focus-client.ts` only if extra focus helpers are required
- `src/renderer/scratch-space-app.tsx`

### Checklist

- Record speech from the popup and transcribe it into the draft.
- Apply dictionary replacement to scratch-space transcript text, consistent with transcript-stage correction rules.
- Resolve the selected or fallback transformation preset safely.
- Restore focus to the original frontmost app before paste.
- Force scratch-space execution output to paste regardless of normal output toggles.
- Return actionable failure results when accessibility permission is missing or paste automation fails after focus restore.
- Preserve the draft on transformation or paste failure.
- Clear the draft only after a full success path.

### Tasks

1. Implement `transcribeAudio()` in the scratch-space service.
2. Implement `runTransformation()` in the scratch-space service.
3. Capture and preserve the original target app when scratch space first opens.
4. Hide or background the scratch window before paste if needed to avoid pasting back into Dicta.
5. Normalize accessibility and paste-automation failures into actionable user-facing results.
6. Add tests for:
  - transcript correction
  - successful paste path
  - missing accessibility permission
  - paste failure keeping the draft
  - missing target app handling

### Gates

- Service test proves successful execution clears the draft and restores target focus.
- Service test proves missing accessibility permission returns actionable failure output without clearing the draft.
- Service test proves paste failure keeps the draft and reopens/retains the popup.
- Manual verification gate:
  - open scratch space from another app
  - type text
  - `Cmd+Enter`
  - transformed text lands in the original app, not Dicta

### Trade-offs

- A dedicated scratch-space pipeline avoids unwanted history/output side effects, but duplicates a small amount of orchestration code instead of sharing one giant pipeline.
- Hiding or backgrounding the popup before paste reduces the risk of pasting into Dicta, but introduces a slightly more complex failure-recovery path.

### Code sketch

```ts
await focusClient.activateBundleId(targetBundleId)
const output = await outputService.applyOutputWithDetail(transformedText, {
  copyToClipboard: true,
  pasteAtCursor: true
})

if (output.status === 'succeeded') {
  draftService.clearDraft()
}
```

## Ticket 4: Durable docs sync and final cleanup

### Goal

Close the rollout by aligning durable docs and limiting the final PR to documentation and cleanup that should happen only after behavior PRs have landed.

### Approach

Treat this ticket as a docs/cleanup PR only. It should not introduce new product behavior. Any test hardening needed to make behavior safe should land in Tickets 1-3 with the code that changes behavior.

### Scope files

- `specs/spec.md`
- `specs/user-flow.md`
- completed/stale temporary docs that should be removed only after the rollout is complete

### Checklist

- Update the normative spec for:
  - new shortcut
  - scratch-space window semantics
  - forced paste behavior
- Update user-flow docs with a scratch-space narrative flow.
- Delete stale completed plan docs only if the rollout is complete and they no longer serve coordination value.
- Run full verification and review passes.

### Tasks

1. Update `specs/spec.md`.
2. Update `specs/user-flow.md`.
3. Remove completed/stale temporary docs as appropriate.
4. Run:
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm docs:validate`
5. Run sub-agent review, then second-model review, then fix findings.

### Gates

- Full test suite passes.
- Docs validation passes.
- No unresolved review findings remain.
- The final PR description maps shipped behavior back to Tickets 1-3 without scope creep.

### Trade-offs

- Keeping the final PR limited to docs and cleanup preserves one-ticket/one-PR clarity, but it requires discipline to avoid slipping behavior fixes into the closing pass.

### Code sketch

```md
### 4.2.2 Scratch space window
- `Escape` closes and preserves the draft.
- `Cmd+Enter` transforms and pastes to the pre-popup target app.
```

## Risks to watch across all tickets

- Frontmost-app capture can drift if the popup reopens while already visible.
- Scratch-space paste can target Dicta instead of the original app if focus restoration is not explicit.
- Draft persistence can lose the final keystrokes if close/blur paths do not flush pending writes.
- Keyboard-only profile navigation can regress if a custom list replaces the native control too early.
- Shared contract changes (`Settings`, `IpcApi`, preload bridge) can break tests widely if landed together with behavior changes instead of in the first PR.

## Review prompts

Use these in planning review:
- Is each ticket small enough to merge independently in one PR?
- Does each ticket have one dominant risk and one clear verification gate?
- Are contract changes landing before behavior changes?
- Is any ticket mixing durable product behavior with cleanup that should wait for Ticket 4?
