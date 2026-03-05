<!--
Where: docs/plans/issues-363-364-macos-menu-bar-and-default-indicator-plan.md
What: Implementation plan for issues #363 and #364.
Why: Deliver deterministic UI/state fixes with small, reviewable PR slices.
-->

# Plan: Issues #363 and #364

Date: March 5, 2026  
Status: Planning only (no implementation started)

Scope covered:
- #363 Customize macOS menu bar/tray UX
- #364 Default profile badge not updating immediately after shortcut-based default change

Execution rules:
- 1 ticket = 1 PR
- Tickets are sorted by priority and dependency
- No coding starts until this plan is approved

---

## Ticket P0 — PR #1: Emit and transport settings-sync signal for external main-process mutations (#364 foundation)

### Goal
Create a main-to-renderer synchronization channel so renderer can react when settings are changed outside renderer-owned flows (for example hotkey service changing `defaultPresetId`).

### Why P0
- #364 cannot be fixed reliably without a deterministic synchronization path.
- This foundation enables clean handling of future externally-initiated settings changes.

### Approach
- Add a new IPC broadcast event for settings-updated notifications from main process.
- Avoid per-call-site manual emission drift by introducing one main-side helper abstraction for external settings writes (set + emit in one operation).
- Migrate existing non-renderer `settingsService.setSettings(...)` call paths to that helper (including default-change and last-picked updates in hotkey flows).
- Add a test guard for helper usage on known external-write paths so new writes cannot silently skip emission.
- Keep payload minimal (versionless event) and let renderer perform authoritative `getSettings()` pull.

### Scope files
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/hotkey-service.ts`
- tests:
  - `src/main/services/hotkey-service.test.ts`
  - `src/main/test-support/ipc-round-trip.test.ts` (if needed for event contract)

### Checklist
- [ ] New IPC event channel name added to shared contract.
- [ ] Main process can broadcast settings-updated event to renderer windows.
- [ ] External settings writes use the shared helper that guarantees set+emit together.
- [ ] Known non-renderer settings write paths are covered by tests that assert emission.
- [ ] Existing hotkey result behavior remains unchanged.
- [ ] Unit tests cover event emission in change-default flow.

### Tasks
1. Define new IPC event constant and listener signature in shared IPC types.
2. Expose listener registration in preload bridge.
3. Add broadcast helper in main IPC composition root.
4. Introduce helper abstraction for external settings writes (persist + broadcast in one function).
5. Migrate known non-renderer write call paths to helper.
6. Add/adjust tests to lock emission semantics and guard helper usage.

### Gates
- Gate 1: Event emits exactly once per successful non-renderer settings mutation.
- Gate 2: No event emission on canceled picker or failed persistence.
- Gate 3: Existing hotkey tests remain green.
- Gate 4: Helper-based write contract is enforced by tests on known external-write paths.

### Trade-offs
- Option A (selected): event + renderer pull (`getSettings`).
  - Pros: simple, authoritative, low payload drift risk.
  - Cons: extra IPC round-trip.
- Option B (not selected): push full settings payload in event.
  - Pros: one-hop update.
  - Cons: larger coupling and payload contract drift risk.

### Potential risks
- Event storms if future callers emit repeatedly.
- Race with renderer autosave generation.

### Proposed snippet (non-applied)
```ts
// shared/ipc.ts
onSettingsUpdated: 'settings:on-updated'

// main
const broadcastSettingsUpdated = () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.onSettingsUpdated)
  }
}
```

### Feasibility
High.

---

## Ticket P1 — PR #2: Consume settings-sync signal in renderer and update Profiles badge immediately (#364 completion)

### Goal
Ensure Profiles tab `default` indicator updates immediately after shortcut-triggered default-profile changes, without manual refresh/navigation.

### Why P1
- User-visible #364 fix depends on P0 signal.
- Keeps behavior scoped to state-refresh, no style changes.

### Approach
- Subscribe in renderer to settings-updated event.
- On event, fetch latest settings via `getSettings()`, normalize pointers, update in-memory state, and rerender with explicit merge semantics.
- Preserve dirty-draft guard behavior with deterministic field-level policy (below), so in-progress profile edit drafts are not silently destroyed.

External refresh merge policy (required contract):

| Area | On `settings-updated` | Notes |
|---|---|---|
| `state.settings` persisted-backed fields | overwrite from fetched settings | source of truth is main persisted settings |
| profile editor local draft (`ProfilesPanelReact` local state) | preserve local draft state | user in-progress edits must remain until explicit Save/Discard |
| `state.persistedSettings` | overwrite from fetched settings | keep rollback/autosave baseline current |
| pending autosave timer/generation | invalidate before apply | prevents stale autosave snapshot from reapplying old state |
| validation errors | recompute from resulting `state.settings` | avoid stale error display mismatch |

### Scope files
- `src/renderer/ipc-listeners.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/profiles-panel-react.tsx` (only if guard logic needs explicit coexistence handling)
- tests:
  - `src/renderer/renderer-app.test.ts`
  - `src/renderer/app-shell-react.test.tsx` (if interaction assertions are needed)

### Checklist
- [ ] Renderer listens for settings-updated event.
- [ ] Renderer refreshes settings and updates `defaultPresetId` view state immediately.
- [ ] Profile badge reflects updated default without tab switch.
- [ ] No UI style changes introduced.
- [ ] Tests reproduce #364 scenario and verify immediate badge update.
- [ ] Merge policy is implemented and tested (persisted fields refresh, local draft preserved, stale autosave cannot override).

### Tasks
1. Extend IPC listener wiring to include settings-updated callback.
2. Implement refresh handler in renderer orchestrator.
3. On settings-updated event, call `invalidatePendingAutosave()` before applying fetched settings to prevent stale autosave overwrite.
4. Ensure pointer normalization still runs after refreshed settings.
5. Add regression test that simulates shortcut-driven main mutation + event.
6. Add regression test proving external default change is not reverted by an already-scheduled autosave snapshot.
7. Validate no regressions in unsaved-draft modal behavior.
8. Add test for merge semantics when profile draft is dirty during settings-updated event.

### Gates
- Gate 1: Repro path in issue #364 passes in automated test.
- Gate 2: No stale default indicator after event dispatch.
- Gate 3: Existing renderer tests for autosave/draft guards pass.
- Gate 4: External settings refresh cannot be rolled back by stale pending autosave.
- Gate 5: Dirty profile draft remains intact during external settings refresh.

### Trade-offs
- Option A (selected): always pull and apply latest settings on event.
  - Pros: consistency with persisted source of truth.
  - Cons: may overwrite local non-persisted draft fields if not carefully scoped.
- Option B (not selected): patch only `defaultPresetId` in local state.
  - Pros: minimal state churn.
  - Cons: fragile when external mutations include other fields.

### Potential risks
- Draft-state clobbering in Profiles tab.
- Ordering/race with in-flight autosave.

### Proposed snippet (non-applied)
```ts
// renderer-app.tsx
onSettingsUpdated: async () => {
  const latest = await window.speechToTextApi.getSettings()
  state.settings = normalizeTransformationPresetPointers(latest)
  state.persistedSettings = structuredClone(state.settings)
  rerenderShellFromState()
}
```

### Feasibility
Medium-High (depends on careful interaction with draft/autosave).

---

## Ticket P2 — PR #3: Implement macOS tray icon + context menu customization for #363

### Goal
Fix tray/menu UX on macOS: show app icon, remove `Show Window` / `Hide Window`, and add `Settings` entry.

### Why P2
- Directly addresses issue #363 acceptance expectations.
- Independent from #364 once state-sync is solved.

### Approach
- Add proper tray icon asset loading (template PNG strategy for macOS).
- Replace current tray context menu template with:
  - `Settings`
  - separator
  - `Quit`
- `Settings` action should:
  - ensure/show main window
  - navigate renderer to settings tab via existing IPC/command route (or add a focused channel)

### Scope files
- `src/main/core/window-manager.ts`
- `src/main/core/window-manager.test.ts`
- `src/main/ipc/register-handlers.ts` and/or `src/shared/ipc.ts` (if new route command is required)
- `src/renderer/renderer-app.tsx` (if adding open-settings event handling)
- assets (new):
  - `resources/icons/trayTemplate.png`
  - `resources/icons/trayTemplate@2x.png`

### Checklist
- [ ] Tray icon is visible on macOS menu bar.
- [ ] Tray menu no longer contains `Show Window` / `Hide Window`.
- [ ] Tray menu includes `Settings` and `Quit`.
- [ ] Clicking `Settings` opens/focuses app window and navigates to settings tab.
- [ ] Tests updated for menu template contract.

### Tasks
1. Add tray icon assets under `resources/icons`.
2. Load icon in `ensureTray()` using path-backed `nativeImage`.
3. Update menu template and handlers.
4. Wire settings navigation path from main to renderer.
5. Add renderer-readiness mitigation for settings navigation:
- queue/defer navigate-to-settings until renderer is ready, or resend after `did-finish-load`.
6. Add/adjust tests for menu labels and settings click behavior.

### Gates
- Gate 1: macOS manual/e2e verification shows visible tray icon.
- Gate 2: menu contract exactly matches expected entries.
- Gate 3: settings route opens deterministically from tray action.
- Gate 4: tray `Settings` works when app is hidden, minimized, and cold-started.

### Trade-offs
- Option A (selected): minimal menu (`Settings`, `Quit`).
  - Pros: clean UX matching issue request.
  - Cons: removes explicit show/hide controls.
- Option B (not selected): dynamic show/hide + settings + quit.
  - Pros: fuller control surface.
  - Cons: diverges from requested simplification.

### Potential risks
- Wrong icon format/naming for macOS template behavior (dark/light inversion issues).
- Settings navigation event can fail when renderer not ready.

### Proposed snippet (non-applied)
```ts
this.tray.setContextMenu(Menu.buildFromTemplate([
  { label: 'Settings', click: () => this.openSettingsWindow() },
  { type: 'separator' },
  { label: 'Quit', role: 'quit' }
]))
```

### Feasibility
Medium (requires asset + navigation wiring + macOS behavior validation).

---

## Ticket P3 — PR #4: Documentation and contract records for tray/menu and external-settings sync

### Goal
Lock the new behavior with durable docs/decision records so future contributors understand contracts and test intent.

### Why P3
- Stabilization and maintainability after functional changes.
- Functional regression tests are required within P0/P1/P2 PRs and are not deferred to this ticket.

### Approach
- Add/update docs/decision notes to describe new contract boundaries.
- Only add tests here if a specific coverage gap remains after P0/P1/P2.

### Scope files
- `docs/decisions/*` (new decision records)
- `docs/e2e-playwright.md` (if new e2e checks added)

### Checklist
- [ ] Docs capture why/when renderer refreshes external settings changes.
- [ ] Docs capture tray UX contract on macOS.
- [ ] Docs cross-reference tests added in P0/P1/P2.
- [ ] If a gap test is added here, it is explicitly justified and scoped.

### Tasks
1. Add concise decision docs for both contracts.
2. Update e2e guide if new tagged tests are introduced.
3. Add test-reference section in docs pointing to P0/P1/P2 regression coverage.

### Gates
- Gate 1: docs align with implemented behavior and issue acceptance.
- Gate 2: contract boundaries are explicit (event scope, tray menu policy, renderer readiness handling).

### Trade-offs
- Option A (selected): focused unit/integration tests + concise docs.
  - Pros: fast, deterministic coverage.
  - Cons: limited full-system realism vs broad e2e.
- Option B (not selected): rely mostly on e2e coverage.
  - Pros: true user-path validation.
  - Cons: slower and more brittle.

### Potential risks
- Overfitting tests to current implementation details.
- Document drift if contracts evolve without updates.

### Proposed snippet (non-applied)
```ts
expect(menuTemplate.map((item) => item.label ?? item.type)).toEqual([
  'Settings',
  'separator',
  'Quit'
])
```

### Feasibility
High.

---

## Cross-ticket dependency map

1. P0 -> prerequisite for P1
2. P2 is independent of P0/P1 except shared IPC naming conventions; it can run in parallel once tray->renderer settings-navigation contract is chosen.
3. P3 depends on merged behavior from P1 and P2

## Verification commands (planned)

Per PR, run targeted tests first, then broader suite as needed:

1. `pnpm test src/main/core/window-manager.test.ts`
2. `pnpm test src/main/core/app-lifecycle.test.ts`
3. `pnpm test src/main/services/hotkey-service.test.ts`
4. `pnpm test src/renderer/renderer-app.test.ts`
5. `pnpm test src/renderer/app-shell-react.test.tsx`

Optional broader check before merge window:
- `pnpm test`

## Out of scope

- Restyling unrelated renderer UI components.
- Reworking dock menu policy unless explicitly requested.
- Changing transformation business logic beyond default-indicator synchronization.
