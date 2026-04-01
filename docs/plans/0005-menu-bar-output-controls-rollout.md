---
title: Menu bar output controls rollout plan
description: Break menu-bar output mode and output destination controls into small PR-sized tickets with explicit ownership, testing, and sync behavior before implementation starts.
date: 2026-04-01
status: completed
review_by: 2026-04-08
tags:
  - planning
  - macos
  - menu-bar
  - output
---

# Menu bar output controls rollout plan

## Goal

Add macOS menu bar controls for:

- toggling output mode between raw dictation and transformed text
- multi-selecting output destinations

without changing the current capture snapshot guarantees, tray behavior expectations, or Settings-window role as the full configuration surface.

This is a planning artifact only. No implementation should start until ticket order, scope, and ownership are accepted.

## Plan summary

The clean rollout is four PRs:

1. tray menu architecture extraction
2. main-process output-settings mutation and menu refresh wiring
3. renderer sync and regression coverage
4. durable docs and final polish

This keeps the early diffs small and avoids coupling menu-template mechanics, persistence mutations, and renderer refresh into one large PR.

## Priority and dependency summary

| Priority | Ticket | One PR? | Depends on | Parallelism |
| --- | --- | --- | --- | --- |
| P0 | Ticket 1: Extract tray menu composition | yes | none | must go first |
| P1 | Ticket 2: Add tray-side output mutations and checked-state rebuilds | yes | Ticket 1 | sequential |
| P1 | Ticket 3: Sync renderer-facing behavior and add integration coverage | yes | Ticket 2 | sequential |
| P2 | Ticket 4: Update durable docs and close rollout gaps | yes | Ticket 1, Ticket 2, Ticket 3 | last |

## Why this split is the cleanest option

This feature touches three concerns that are easy to tangle:

- tray-native menu construction
- persisted settings mutation
- renderer refresh from external changes
- composition-root wiring for tray rebuild and settings-update broadcasts

Separating them keeps each PR reviewable:

- Ticket 1 changes structure, not behavior
- Ticket 2 adds behavior in main process
- Ticket 3 proves cross-surface consistency
- Ticket 4 aligns durable docs after implementation details settle

## Definition of Done for the full rollout

The rollout is complete only when all of the following are true:

- the tray menu exposes output mode as a mutually exclusive choice
- the tray menu exposes output destinations as independent toggles
- tray changes persist through the existing settings store
- tray changes affect future capture jobs only, not already-enqueued snapshots
- renderer Settings reflects tray-side changes without requiring app restart
- tray checkmarks also stay current after renderer-side settings saves
- tray-side changes do not silently clobber unsaved Settings edits without an explicit policy
- tray icon click behavior remains unchanged
- `Settings...` still opens and focuses the main window
- focused tests cover tray structure, persistence, and sync behavior
- durable specs and user-flow docs match shipped behavior
- one sub-agent review and one second-model review have been run, with findings incorporated or explicitly called out

## Ticket 1: Extract tray menu composition into a dedicated main-process module

### Goal

Create a clean ownership boundary for tray-menu construction before adding new output controls.

### Approach

Move menu-template building out of `WindowManager` into a dedicated tray/menu-bar collaborator. Prefer a small stateful tray controller over a pure builder so later tickets have an explicit place to own:

- tray instance updates
- menu rebuild triggers
- settings-driven checked-state refresh

Keep the behavior identical in this PR:

- same icon handling
- same `Settings...`
- same `Quit`
- same no-click-handler behavior

This is the safest first PR because it creates the seam the feature actually needs without changing product behavior yet.

Cleaner option considered:

- edit `WindowManager.ensureTray()` in place and add more menu items later

Why not:

- it mixes window lifecycle with settings/business logic
- later tests would have to mock more unrelated responsibilities
- it makes future tray growth harder to contain

### Files in scope

- `src/main/core/app-lifecycle.ts`
- `src/main/core/app-lifecycle.test.ts`
- `src/main/core/window-manager.ts`
- `src/main/core/window-manager.test.ts`
- new main-process tray module, for example:
  - `src/main/tray/tray-menu-builder.ts`
  - `src/main/tray/tray-controller.ts`
  - or `src/main/menu-bar/menu-bar-controller.ts`

### Checklist

- Extract tray menu-template creation behind a dedicated module.
- Keep current menu behavior identical.
- Preserve the current icon-loading and tooltip behavior.
- Preserve the current `Settings...` event dispatch behavior.
- Preserve the absence of a tray click handler.
- Make the extracted tray builder/controller capable of receiving an initial settings snapshot later, without wiring `SettingsService` in this PR.
- Add or update focused tests around the extracted builder.

### Tasks

1. Introduce a tray menu builder/controller module with a narrow interface.
2. Decide and document the injection path between `AppLifecycle`, `WindowManager`, and the new tray collaborator.
3. Route `WindowManager.ensureTray()` through that collaborator.
4. Keep the top-level menu template identical to current behavior.
5. Adjust tests so tray behavior is asserted through the new seam.
6. Re-read the extracted path to ensure no hidden behavior drift was introduced.

### Definition of Done

- the tray still shows only `Settings...` and `Quit`
- existing tray behavior is preserved exactly
- `WindowManager` no longer owns the full menu template directly
- the new tray seam is ready to accept initial settings-driven checked state in Ticket 2
- tests verify no behavioral regressions

### Trade-offs

- This adds a small extra module before user-visible progress, but it sharply reduces risk in later PRs.
- It may feel like overhead for a small feature, but it keeps a native-menu feature out of the window-lifecycle class.

### Example code sketch

```ts
export interface TrayMenuActions {
  openSettings: () => void
}

export const buildTrayMenuTemplate = (actions: TrayMenuActions): MenuItemConstructorOptions[] => [
  { label: 'Settings...', click: actions.openSettings },
  { type: 'separator' },
  { label: 'Quit', role: 'quit' }
]
```

### Confidence

- 95 for the extraction approach
- 93 for keeping this PR behavior-neutral

## Ticket 2: Add tray-side output mutations and checked-state rebuilds

### Goal

Add menu bar controls for output mode and output destinations, with settings persistence and menu refresh handled in the main process.

### Approach

Implement tray-side output mutations through the persisted settings service, not through renderer IPC. Reuse the existing shared output-selection semantics so the tray and Settings surface cannot drift.

Critical sync rule:

- the tray menu must rebuild after tray-side mutations
- the tray menu must also rebuild after renderer-side `setSettings` saves that change output fields
- the tray menu must be built from current persisted output settings on first construction, not from hardcoded defaults

Without that second rule, tray checkmarks will go stale after a normal Settings save.

Composition-root note:

- `broadcastSettingsUpdated()` currently exists as a private closure in `register-handlers.ts`
- this ticket must either wire the tray controller inside `registerIpcHandlers()` or extract a small reusable broadcaster/update hook
- do not leave that ownership implicit

Proposed menu shape:

- `Settings...`
- `Output Mode`
  - `Raw dictation`
  - `Transformed text`
- `Output Destinations`
  - `Copy to clipboard`
  - `Paste at cursor`
- `Quit`

Cleaner option considered:

- flat top-level checkbox and radio items

Why submenu is cleaner:

- scales better
- keeps the top-level tray concise
- mirrors how native macOS utility menus usually group quick settings

### Files in scope

- new tray/menu-bar module introduced in Ticket 1
- `src/main/services/settings-service.ts`
- `src/main/ipc/register-handlers.ts`
- `src/shared/output-selection.ts`
- `src/shared/domain.ts` only if a tiny helper type is needed
- tray/menu-bar tests

### Checklist

- Add radio items for output mode.
- Add checkbox items for output destinations.
- Build initial tray checked state from persisted settings.
- Persist tray-side changes through `SettingsService`.
- Rebuild the tray menu after each tray-side mutation.
- Rebuild the tray menu after renderer-side output-setting saves.
- Broadcast `onSettingsUpdated` after tray-side mutation.
- Wire tray refresh ownership explicitly in `register-handlers.ts` or an extracted equivalent.
- Document that tray-side output changes intentionally do not re-run `hotkeyService.registerFromSettings()`.
- Reuse the shared destination-synchronization rule already used by Settings.
- Add focused tests for checked-state rendering and persistence.

### Tasks

1. Wire the tray controller where it can access persisted settings and settings-update broadcasts.
2. Build the initial tray menu from current persisted output settings.
3. Add a main-process tray action for setting `selectedTextSource`.
4. Add a main-process tray action for toggling `copyToClipboard`.
5. Add a main-process tray action for toggling `pasteAtCursor`.
6. Reuse shared helper logic so transcript and transformed destination rules remain synchronized.
7. Rebuild the tray menu from current persisted settings after every tray mutation.
8. Hook tray refresh into renderer-side `setSettings` saves for relevant output changes.
9. Broadcast a settings-updated event so open renderer windows refresh after tray mutations.
10. Add tests for radio exclusivity, checkbox toggles, persisted-state reads, initial checked state, and tray refresh after renderer saves.

### Definition of Done

- tray mode selection persists and displays the correct checked radio item
- tray destination toggles persist and display the correct checked checkbox items
- tray changes survive restart via existing settings persistence
- tray changes do not require opening the Settings window
- tray checkmarks are correct on first launch and after Settings-window saves
- tests cover persistence and checked-state refresh from both tray and renderer save paths

### Trade-offs

- Rebuilding the full menu after each change is slightly more work than mutating menu items in place, but it is simpler and more deterministic.
- Reusing the current synchronized destination model preserves consistency, but it defers any future idea of transcript-only vs transformed-only destination divergence.

### Example code sketch

```ts
const nextOutput = buildOutputSettingsFromSelection(
  settings.output,
  newSelection,
  getSelectedOutputDestinations(settings.output)
)

settingsService.setSettings({
  ...settings,
  output: nextOutput
})
```

### Confidence

- 92 for main-process persisted mutation path
- 90 for submenu + radio/checkbox structure
- 78 for pulling `interfaceMode` into this same PR

Low-confidence item:

- do not include `interfaceMode` behavior changes in this PR
- add a follow-up ADR or dedicated future ticket before any runtime meaning is attached to `interfaceMode`

## Ticket 3: Sync renderer behavior and add cross-surface regression coverage

### Goal

Define and implement the renderer-side conflict policy for tray-driven external mutations, then add regression coverage for cross-surface synchronization.

### Approach

Use the existing `onSettingsUpdated` event path and renderer refresh behavior rather than inventing tray-specific renderer messages, but do not treat the current behavior as automatically safe. Today `refreshSettingsFromMainExternalMutation()` replaces in-memory settings and invalidates pending autosave, which creates a real risk of clobbering unsaved Settings edits if a tray change arrives mid-edit.

This ticket should make that policy explicit. Recommended direction:

- merge tray-originated output-field updates into renderer state when the Settings screen is dirty, rather than blindly replacing all local state
- if that merge is too risky, show explicit user-visible conflict handling and document it

Cleaner option considered:

- add new tray-specific IPC notifications

Why not:

- duplicates semantics already covered by settings refresh
- creates extra renderer branches for the same underlying event

### Files in scope

- `src/main/ipc/register-handlers.ts`
- `src/preload/index.ts` only if bridge changes become necessary
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-output-react.tsx`
- renderer tests, especially:
  - `src/renderer/settings-output-react.test.tsx`
  - `src/renderer/renderer-app.test.ts`
  - any relevant shell or settings tests

### Checklist

- Confirm tray-side settings changes trigger renderer refresh.
- Define how tray-side changes interact with unsaved renderer edits.
- Add tests proving the Settings output controls reflect tray-side updates.
- Verify no extra renderer-specific tray event is required.
- Preserve current Settings editing behavior.
- Preserve warning behavior when both destinations are off.

### Tasks

1. Decide and document the dirty-state conflict policy for tray-driven output changes.
2. Verify the existing `onSettingsUpdated` listener remains sufficient after that policy is implemented.
3. Add tests for renderer refresh after a main-process tray mutation.
4. Add or extend tests for the output section after external updates while the Settings screen is clean.
5. Add tests for external updates while the Settings screen has unsaved edits.
6. Confirm there is no stale local state in `SettingsOutputReact` after refresh.
7. Re-read affected renderer code to ensure controlled-state updates remain valid.

### Definition of Done

- an open Settings surface reflects tray-side output changes
- unsaved renderer edits are handled by an explicit, tested conflict policy
- existing Settings edits still persist normally
- destination warning behavior remains unchanged
- tests cover external refresh, not just direct clicks in the component

### Trade-offs

- This PR adds test-heavy work with limited visible functionality, but it is the main protection against tray and Settings diverging over time.
- Leaning on the current refresh path is simpler, but it is only safe if the dirty-state conflict policy is defined and tested.

### Example code sketch

```ts
window.speechToTextApi.onSettingsUpdated(() => {
  void refreshSettingsFromMainExternalMutation()
})
```

### Confidence

- 89 for reusing existing settings-update broadcasts
- 85 for renderer refresh coverage as a separate PR

## Ticket 4: Update durable docs and close rollout gaps

### Goal

Align the normative spec and user-flow docs with the shipped menu-bar behavior, then close any remaining naming or UX gaps.

### Approach

Do this last, after implementation behavior is confirmed. Avoid rewriting durable docs prematurely while the exact menu labels or ownership boundaries are still fluid.

Cleaner option considered:

- update durable docs in the same PR as implementation

Why not for this rollout:

- user explicitly asked for planning first
- exact tray wording and shape may still move during Ticket 2 and Ticket 3 review

### Files in scope

- `specs/spec.md`
- `specs/user-flow.md`
- `docs/research/005-menu-bar-output-controls.md`
- this plan doc if status or follow-up notes need updating

### Checklist

- Update the spec with tray-side output control behavior.
- Update user-flow language for menu bar output changes.
- Record final naming choices if they changed during implementation.
- Confirm docs and tests describe the same behavior.
- Validate controlled-doc frontmatter and integrity scripts.

### Tasks

1. Add or update spec language for tray output mode and destination controls.
2. Add or update user-flow details for tray-side output changes.
3. Update research conclusions if implementation invalidated an assumption.
4. Run doc validation scripts.
5. Close any small naming mismatches found in review.

### Definition of Done

- durable docs match shipped behavior
- no outdated menu wording remains in spec or user-flow docs
- doc validation passes

### Trade-offs

- Waiting until the end avoids churn, but it means the durable docs stay temporarily incomplete during implementation.
- Folding final polish into the docs PR keeps behavior PRs smaller, but it requires discipline to avoid slipping code changes into the documentation closeout.

### Example code sketch

```md
- The macOS tray menu MUST expose output mode as a mutually exclusive selection.
- The macOS tray menu MUST expose output destinations as independent toggles.
```

### Confidence

- 94 for keeping durable doc changes last

## Parallelism and sequencing

Sequential:

- Ticket 1 must land first because later work needs a clean tray-menu seam.
- Ticket 2 must land before Ticket 3 because renderer conflict handling needs real tray-side mutations to assert against.
- Ticket 4 should land last because it depends on the final shipped wording and behavior.

Parallel candidates:

- none recommended for implementation

Reason:

- this feature is small enough that parallel PRs would likely create merge churn in the same tray and settings files

## Risks to watch during implementation

### Backward compatibility

- Persisted settings shape should remain unchanged unless a very small helper type is needed.
- Existing Settings-window editing behavior must keep working.
- Existing tray behavior for `Settings...`, icon click, and `Quit` must not regress.

### Forward compatibility

- Do not entangle this work with unfinished `interfaceMode` runtime behavior.
- Keep tray-menu code extensible enough for future quick settings without forcing all business logic into `WindowManager`.

### Maintainability

- Avoid duplicating output-selection logic between renderer and tray.
- Avoid making tray menu state depend on open renderer windows.
- Avoid a tray implementation that only refreshes on tray mutations and drifts after renderer saves.
- Avoid silently creating a second settings-write path with different side effects; document why tray output writes bypass hotkey re-registration for now.
- Keep tests close to native-menu and persistence behavior, not just snapshots of labels.

## Review focus for future implementation PRs

- Is any PR trying to do tray extraction and business-logic mutation at once?
- Is any PR introducing renderer-only state for tray-owned controls?
- Is any PR changing `interfaceMode` behavior without a separate decision?
- Do tests prove persisted-state sync, not just click handlers?
