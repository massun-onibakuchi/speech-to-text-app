<!--
Where: docs/plans/prioritized-ticket-breakdown-plan.md
What: Prioritized multi-ticket execution plan with one-ticket/one-PR mapping.
Why: Provide a clear, reviewable implementation roadmap before coding.
-->

# Prioritized Ticket Breakdown Plan

Date: 2026-03-05  
Status: Planning only (do not start coding before plan approval)

## Planning Rules
- 1 ticket maps to 1 PR.
- Tickets are ordered by priority and dependency.
- Each ticket includes goal, checklist, tasks, gates, approach, scope files, trade-offs, and code snippets.

## Priority Order
1. P0 - Ticket T364: Default profile indicator should update immediately after shortcut default change.
2. P1 - Ticket T367: Add confirmation modal before profile deletion.
3. P2 - Ticket T363: Improve macOS tray/menu UX (icon + settings/quit menu policy).

## Ticket T364 (P0) -> PR `fix/364-default-indicator-sync`
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/364

### Goal
Ensure the Profiles tab default badge updates immediately when `defaultPresetId` is changed from main-process shortcut flows.

### Approach
- Introduce a main-to-renderer `settings-updated` signal for externally initiated settings mutations.
- Renderer listens for the signal, pulls authoritative settings via `getSettings()`, normalizes pointers, and rerenders.
- Keep local draft editing safe by preserving unsaved draft state while refreshing persisted settings.
- Rollback plan: keep event wiring and renderer refresh changes isolated so the whole sync behavior can be reverted in one commit if needed.

### Scope files
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/hotkey-service.ts`
- `src/renderer/ipc-listeners.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/renderer-app.test.ts`
- `src/main/services/hotkey-service.test.ts`

### Trade-offs
- Option A (selected): event-notify + renderer `getSettings()` pull.
  - Pros: single source of truth, lower payload drift risk.
  - Cons: one extra IPC roundtrip.
- Option B (rejected): push full settings payload with event.
  - Pros: immediate one-hop update.
  - Cons: larger contract surface and versioning drift risk.

### Code snippet (planned)
```ts
// shared/ipc.ts
export const IPC_CHANNELS = {
  // ...
  onSettingsUpdated: 'settings:on-updated'
} as const
```

```ts
// renderer-app.tsx
onSettingsUpdated: async () => {
  const latest = await window.speechToTextApi.getSettings()
  applyExternalSettingsRefresh(latest)
}
```

### Tasks (chunked)
1. Add `onSettingsUpdated` channel and preload listener contract.
2. Add main broadcast path for successful external settings writes.
3. Migrate shortcut-driven default-preset mutation path to emit update signal.
4. Add renderer listener to refresh settings state and preserve draft semantics.
5. Add regression tests for immediate badge refresh and no stale autosave rollback.
6. Add/update decision note documenting the event contract and state-merge policy.

### Checklist
- [ ] `settings-updated` channel is added to shared IPC contract.
- [ ] Main emits update signal for shortcut-triggered default changes.
- [ ] Renderer listens and refreshes `settings` from `getSettings()`.
- [ ] Profile default badge updates without manual tab switch.
- [ ] Unsaved profile draft remains intact during external refresh.
- [ ] Regression tests cover the issue path.

### Gates
- Gate A: Badge reflects updated default within one render cycle after `settings:on-updated` (no tab switch, no app restart) in automated regression test.
- Gate B: No event emitted on canceled picker or failed write.
- Gate C: Existing hotkey behaviors remain unchanged.
- Gate D: `pnpm vitest run src/main/services/hotkey-service.test.ts src/renderer/renderer-app.test.ts` passes.

### Risk and feasibility
- Ticket granularity: Medium (main + renderer + IPC boundary).
- Feasibility: Medium-High.
- Potential risk: stale autosave/draft interactions causing state rollback; duplicate refresh events from repeated external writes.
- Mitigation: explicit merge-policy tests, event de-duplication guard, and listener lifecycle cleanup test.

---

## Ticket T367 (P1) -> PR `feat/367-profile-delete-confirmation`
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/367

### Goal
Prevent accidental profile deletion by adding a confirmation modal before destructive removal.

### Approach
- Mirror the established API-key delete modal UX contract (alert dialog, cancel autofocus, pending lock).
- Replace direct trash-action deletion with modal-confirm flow.
- Preserve existing delete mutation and fallback-default profile behavior.

### Scope files
- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/confirm-delete-profile-dialog-react.tsx` (new)
- `src/renderer/confirm-delete-profile-dialog-react.test.tsx` (new)
- `src/renderer/profiles-panel-react.test.tsx`
- `docs/decisions/issue-367-profile-delete-confirmation-modal.md`

### Trade-offs
- Option A (selected): dedicated profile delete modal component.
  - Pros: clear semantics, low coupling, easy to test.
  - Cons: one additional component file.
- Option B (rejected): expand API-key modal with generic props.
  - Pros: fewer files.
  - Cons: mixed concerns and harder-to-read prop model.

### Code snippet (planned)
```tsx
const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; name: string } | null>(null)
const [pendingDelete, setPendingDelete] = useState(false)
```

```tsx
<ConfirmDeleteProfileDialogReact
  open={deleteCandidate !== null}
  pending={pendingDelete}
  profileName={deleteCandidate?.name ?? ''}
  onConfirm={confirmDeleteCandidate}
  onOpenChange={handleDeleteDialogOpenChange}
/>
```

### Tasks (chunked)
1. Build profile delete confirm dialog component with pending lock rules.
2. Integrate dialog state into profiles panel and reroute trash action to open dialog.
3. Wire confirm action to existing remove callback with async pending handling.
4. Add component and integration tests (open, cancel, confirm, failure retry).
5. Add/update decision doc capturing reuse-vs-dedicated trade-off.

### Checklist
- [ ] Clicking profile trash icon opens confirmation modal.
- [ ] Deletion does not execute until explicit confirm.
- [ ] Pending state blocks duplicate actions and close paths.
- [ ] Confirm calls `onRemovePreset` with candidate profile id.
- [ ] Cancel path closes modal without deletion.
- [ ] Tests cover success/failure/retry behavior.
- [ ] Keyboard behavior: initial focus lands on Cancel, Escape closes when not pending, Enter confirms.
- [ ] Dialog uses destructive-action semantics (`role=\"alertdialog\"` or equivalent project pattern).

### Gates
- Gate A: `pnpm vitest run src/renderer/confirm-delete-profile-dialog-react.test.tsx src/renderer/profiles-panel-react.test.tsx` passes.
- Gate B: No mutation contract changes in main process required.
- Gate C: Manual smoke covers deleting default/non-default/currently edited profile safely.

### Risk and feasibility
- Ticket granularity: Small.
- Feasibility: High.
- Potential risk: stale delete candidate on rerender or duplicate confirms.
- Mitigation: candidate identity guard + pending lock + regression tests.

---

## Ticket T363 (P2) -> PR `feat/363-macos-tray-menu-contract`
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/363

### Goal
Align macOS tray behavior with requested UX: visible tray icon and simplified menu entries (`Settings`, `Quit`) without `Show Window`/`Hide Window`.

### Approach
- Add macOS tray template icon assets and load them via `nativeImage` in tray setup.
- Replace current tray menu template with deterministic contract.
- Wire `Settings` click to open/focus window and navigate to Settings tab using a single explicit navigation path defined in this ticket (no conditional fallback paths).
- Rollback plan: isolate tray menu contract and navigation wiring so behavior can be reverted in one commit if regressions appear.

### Scope files
- `src/main/core/window-manager.ts`
- `src/main/core/window-manager.test.ts`
- `resources/icons/trayTemplate.png` (new)
- `resources/icons/trayTemplate@2x.png` (new)
- `src/shared/ipc.ts`
- `src/main/ipc/register-handlers.ts`
- `src/renderer/renderer-app.tsx`

### Trade-offs
- Option A (selected): strict minimal tray menu (`Settings`, `Quit`).
  - Pros: matches issue expectation and keeps menu predictable.
  - Cons: removes explicit show/hide controls.
- Option B (rejected): keep dynamic show/hide plus settings.
  - Pros: more controls in tray.
  - Cons: diverges from requested simplification.

### Code snippet (planned)
```ts
this.tray.setContextMenu(Menu.buildFromTemplate([
  { label: 'Settings', click: () => this.openSettingsWindow() },
  { type: 'separator' },
  { label: 'Quit', role: 'quit' }
]))
```

### Tasks (chunked)
1. Add template tray icon assets and wire loading path.
2. Replace tray menu template labels/actions.
3. Ensure `Settings` action focuses window and lands on settings tab.
4. Add readiness handling if renderer is not yet ready when tray action occurs.
5. Add/update tray contract tests.
6. Add/update decision note documenting macOS-only tray contract and non-macOS guard behavior.

### Checklist
- [ ] Tray icon is visible and uses template icon assets on macOS.
- [ ] Menu contains only `Settings`, separator, and `Quit`.
- [ ] `Settings` opens/focuses app and routes to settings tab.
- [ ] Behavior works when app is hidden or cold-started.
- [ ] Tests validate menu template contract.

### Gates
- Gate A: `pnpm vitest run src/main/core/window-manager.test.ts` passes.
- Gate B: macOS manual validation confirms icon visibility and menu contract.
- Gate C: tray `Settings` action works for hidden window and cold-start timing.
- Gate D: Non-macOS platforms keep existing tray behavior unchanged (validated by unit assertions or guarded platform-branch test).

### Risk and feasibility
- Ticket granularity: Medium.
- Feasibility: Medium-High.
- Potential risk: template icon rendering differences and renderer readiness race.
- Mitigation: platform-specific asset checks + deferred settings-navigation handling.

---

## Cross-ticket Risk Summary
- Highest risk: T364 state synchronization edge cases with unsaved draft/autosave.
- Moderate risk: T363 renderer-readiness race from tray action.
- Lowest risk: T367 UI confirmation flow is isolated and testable.

## Feasibility Summary
- T364: Medium-High, with careful state merge tests.
- T367: High, isolated UI implementation.
- T363: Medium-High, requires macOS behavior validation.

## Review Criteria Coverage
- Ticket granularity: explicit small/medium sizing and bounded scope files per ticket.
- Ticket priority: P0/P1/P2 ordering based on user impact and dependency.
- Feasibility: assessed per ticket with execution constraints.
- Potential risk: specific risks and mitigations listed per ticket.
- Proposed approaches: alternatives + selected approach documented for each ticket.
