<!--
Where: docs/react-r0-coexistence.md
What: React kickoff coexistence and rollback contract for renderer migration.
Why: Keep parity and single-event ownership while React and vanilla coexist in R0.
-->

# React R0 Coexistence Contract

## Ownership Boundary
- React owns only renderer root mounting in R0 (`src/renderer/main.ts` + `src/renderer/react-bootstrap.ts`).
- Vanilla owns all behavior, event wiring, and side effects in R0 (`src/renderer/legacy-renderer.ts`).
- The React host renders a single DOM mount point (`#legacy-renderer-root`) and delegates all runtime behavior to vanilla.
- No renderer-side IPC/event listener registration is duplicated in React.

## Event Ownership Rule
- Single event owner remains vanilla renderer for:
  - recording command dispatch + status updates
  - composite transform status handling
  - hotkey error notifications
  - settings save/autosave actions
  - toast and activity feed side effects

## Parity Checkpoint List (pre-Home migration)
- Shortcut-driven recording command feedback and button busy/disabled behavior.
- Picker trigger path and transform status summary updates.
- Status badge states (`Idle`, `Recording`, `Working`, `Error` mapping).
- Sound hook semantics for start/stop/cancel and transform outcomes.

## Rollback Steps
1. Set `VITE_RENDERER_MODE=vanilla` in renderer environment config.
2. Rebuild renderer (`pnpm run build`).
3. Launch app and verify vanilla path boots directly without React host.

## Notes
- Default mode is `react` for R0 validation.
- Rollback is a one-switch load-path change; no data migration or settings schema changes are required.
