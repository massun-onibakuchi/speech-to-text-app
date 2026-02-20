<!--
Where: docs/react-r0-coexistence.md
What: React kickoff coexistence contract for renderer migration.
Why: Keep parity and single-event ownership while Home is React-owned and Settings remains legacy-owned.
-->

# React R0 Coexistence Contract

## Ownership Boundary
- React owns renderer root mounting and Home UI rendering in R0.
- Legacy renderer still owns Settings rendering and renderer-side side effects/event wiring.
- Home behavior updates are dispatched through shared action functions in `legacy-renderer` to keep one mutation path.
- No renderer-side IPC/event listener registration is duplicated between React and legacy paths.

## Event Ownership Rule
- Single owner per interaction path:
  - React owns Home click handlers and Home status rendering
  - legacy renderer owns command dispatch + side effects for:
    - recording command dispatch
    - settings save/autosave actions
    - toast and activity feed publication
  - composite transform status handling
  - hotkey error notifications

## Parity Checkpoint List (pre-Home migration)
- Shortcut-driven recording command feedback and button busy/disabled behavior.
- Picker trigger path and transform status summary updates.
- Status badge states (`Idle`, `Recording`, `Working`, `Error` mapping).
- Sound hook semantics for start/stop/cancel and transform outcomes.

## Notes
- `src/renderer/main.ts` now mounts through React bootstrap only.
- Backward-compat renderer mode toggles were removed to prevent split ownership and drift.
