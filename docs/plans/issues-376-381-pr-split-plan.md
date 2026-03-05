<!--
Where: docs/plans/issues-376-381-pr-split-plan.md
What: Practical branch/PR slicing plan for issues #376-#381 after implementation.
Why: Enforce one-ticket-per-PR delivery while keeping merge order deterministic.
-->

# PR Split Plan: Issues #376-#381

Date: 2026-03-05
Base branch: `main`
Integration branch: `plan/issues-376-381`

## Merge Order

1. PR-1: #378
2. PR-2: #376
3. PR-3: #377
4. PR-4: #381
5. PR-5: #379
6. PR-6: #380

## PR Branches

- `pr/378-recording-command-contract`
- `pr/376-remove-transformation-orchestrator`
- `pr/377-remove-manual-transform-channel`
- `pr/381-strict-unused-sweep`
- `pr/379-remove-noop-activity-path`
- `pr/380-strict-contract-cleanup`

## Ticket-to-scope checklist

### PR-1 (#378)
- Recording command contract only: keep `toggleRecording`/`cancelRecording`, remove legacy `start/stop` variants.
- Core files: `src/shared/ipc.ts`, `src/renderer/native-recording.ts`, `src/main/orchestrators/recording-orchestrator.ts`
- Tests: recording command/router/renderer/e2e assertions tied to command names.

### PR-2 (#376)
- Remove dead orchestrator files:
  - `src/main/orchestrators/transformation-orchestrator.ts`
  - `src/main/orchestrators/transformation-orchestrator.test.ts`

### PR-3 (#377)
- Remove obsolete manual transform channel and renderer action.
- Core files: `src/preload/index.ts`, `src/main/ipc/register-handlers.ts`, `src/main/core/command-router.ts`, `src/renderer/renderer-app.tsx`, `src/shared/ipc.ts`

### PR-4 (#381)
- Dead symbol cleanup only (strict-unused-driven).
- Core files include `src/main/services/profile-picker-service.ts` and test-only unused-symbol edits.

### PR-5 (#379)
- Remove no-op renderer activity path.
- Core files: `src/renderer/hotkey-error.ts`, `src/renderer/settings-mutations.ts`, `src/renderer/native-recording.ts`, `src/renderer/renderer-app.tsx`

### PR-6 (#380)
- Strict current-schema contract and compatibility cleanup.
- Core files: `src/shared/domain.ts`, `src/main/services/settings-service.ts`, `src/main/services/transformation/prompt-format.ts`, `src/renderer/settings-validation.ts`, `src/renderer/shortcut-capture.ts`, `specs/spec.md`, `e2e/electron-ui.e2e.ts`

## Verification gates per PR

- `pnpm -s vitest run <targeted-tests>`
- `pnpm -s exec tsc --noEmit --noUnusedLocals --noUnusedParameters`
- `rg` symbol-removal gate for the ticket-specific dead symbols.

