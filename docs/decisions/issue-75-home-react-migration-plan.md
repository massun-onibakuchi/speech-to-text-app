<!--
Where: docs/decisions/issue-75-home-react-migration-plan.md
What: Decision record and execution plan for Issue #75 Home migration to React with behavior parity.
Why: Make migration sequencing explicit, preserve contracts, and reduce regression risk during React adoption.
-->

# Issue #75 Decision Record: Home React Migration with Parity

## Context
- Ticket: `#75` ([R0] React phase 1: migrate Home page with behavior parity).
- Dependency `#74` is complete and merged.
- Current renderer architecture:
  - React owns mount bootstrap only.
  - Legacy renderer owns Home behavior, event listeners, command dispatch, and side effects.

## Decision Summary
- Migrate Home to React in strict slices while preserving existing selector and behavior contracts.
- Keep one event owner per path throughout migration.
- Do not migrate Settings behavior in this ticket.
- Use a React-only renderer mount path to avoid compatibility split paths.

## Why this design
- Limits blast radius to Home-only migration scope.
- Preserves e2e contract stability and avoids hidden behavior drift.
- Allows per-slice verification before moving to next behavior surface.

## Scope and Non-scope
### In scope
- Home shell/layout in React.
- Recording controls behavior in React.
- Transform action card behavior in React.
- Home status badge/toast/error rendering in React.
- Disabled-state explanations and Home affordances in React.

### Out of scope
- Settings behavior refactor.
- New feature additions.
- Selector contract redesign unless unavoidable and paired with e2e migration.
- Settings deep-link targets are regression checkpoints only in this ticket; no Settings logic migration is included.

## Slice Plan
1. Home shell and static sections.
2. Recording controls behavior.
3. Transform action behavior.
4. Status badge/toast/error states.
5. Disabled-state explanations and affordances.

Each slice must pass targeted tests and manual parity checks before advancing.

## Guardrails
1. Preserve selector contracts used by `e2e/electron-ui.e2e.ts` unless migrated in same PR.
2. Avoid dual event ownership (no duplicate IPC/listener registration across legacy + React seams).
3. Keep command feedback semantics unchanged (`activity`, `toast`, status badge values).
4. Preserve sound semantics (`recording_started/stopped/cancelled` + transform outcomes).
5. Keep a single renderer mount path to avoid compatibility drift.

## Parity Checkpoints
- Recording command busy/disabled states and labels.
- Transform blocked messages and existing Settings deep-link behavior (from Home only).
- Command status mapping (`Idle`, `Recording`, `Working`, `Error`).
- Toast content and tone mapping for success/error/info.
- Home action-to-sound mapping and focus gating behavior.

## Test and Verification Plan
- Unit/renderer tests for newly introduced Home React components/hooks.
- Existing renderer utility tests stay green.
- `pnpm run typecheck`.
- `pnpm run test`.
- `pnpm run test:e2e`.
- Optional manual sanity pass:
  - Start/stop/cancel flows.
  - Run composite transform.
  - Disabled-state messaging and Home-to-Settings navigation.

## Risks and Mitigations
- Risk: behavior drift in command side effects.
  - Mitigation: extract parity-oriented hooks and add focused tests per slice.
- Risk: listener duplication during coexistence.
  - Mitigation: explicit ownership boundary audit per slice.
- Risk: selector drift breaks e2e.
  - Mitigation: preserve attributes or migrate tests in same commit.

## Claude Review Note
- Attempted to run `$claude` review in this session but Claude CLI returned usage limit:
  - `You've hit your limit · resets 7pm (UTC)`.
- Proceeded with autonomous fallback planning and local guardrail-based execution.
