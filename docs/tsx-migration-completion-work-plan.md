# TSX Migration Completion Work Plan (React Renderer)

## Scope
- Branch: `claude/enable-tsx-migration-JZtyB`
- Goal: finish the React TSX migration and remove remaining legacy compatibility paths.
- Priority target: `src/renderer/renderer-app.tsx` (primary renderer container after TSX migration).

## Problem Statement
- Most leaf React components/tests are already migrated to `.tsx`.
- The central renderer composition layer was migrated to `src/renderer/renderer-app.tsx`; follow-up work remains to split file size and reduce legacy selector coupling.
- A compatibility shim remains (`src/renderer/legacy-renderer.ts`) even though the codebase already has a single direct entrypoint (`src/renderer/main.ts` -> `startRendererApp`).
- Some behavior still relies on global DOM event wiring instead of React ownership (Enter-to-save keydown listener).

## Desired End State
- React renderer UI tree is JSX/TSX-based end-to-end.
- No backward compatibility shim for renderer boot path.
- Settings submit behavior is owned by React forms/components, not `document` listeners.
- Tests validate user behavior/public contracts, not broad legacy selector parity.
- Cleanup items (coverage globs, TSX style typing) are resolved.

## Approach (Chosen)
### Mechanical-first, then refactor
- First pass: migrate `renderer-app.ts` to `renderer-app.tsx` with behavior-preserving JSX conversion.
- Second pass: remove compatibility shims and move remaining DOM wiring into React ownership.
- Third pass: tighten tests and cleanup technical debt.

### Why this approach
- Reduces regression risk by separating syntax conversion from architectural changes.
- Creates smaller diffs that are easier to review and revert.
- Avoids preserving legacy patterns longer than necessary.

## Guardrails (Best Practice / Anti-Compat)
- Prefer a single renderer boot entrypoint (`startRendererApp`) over aliases.
- Prefer React form submit / component event ownership over global document listeners.
- Keep only explicit public selectors needed for e2e/tests; remove broad legacy selector parity expectations.
- Avoid `as any` in TSX render code when `CSSProperties` or typed helpers are sufficient.
- Split oversized files (>600 LOC) by responsibility after mechanical migration.

## Work Plan (Step-by-Step)

## Phase 0: Baseline and Safety Net
### Tasks
- [x] Confirm branch worktree is clean and on `claude/enable-tsx-migration-JZtyB`.
- [x] Re-run targeted renderer tests to establish baseline.
- [x] Re-run `typecheck` and `build` baseline.
- [ ] Capture current `renderer-app.ts` behavior constraints (pages, toasts, settings save flow, hotkey errors).

### Gate 0 (Must Pass Before Editing)
- [x] `pnpm run typecheck` passes
- [x] `pnpm run build` passes
- [x] Targeted renderer tests pass (at least `renderer-app.test.ts` + migrated `*.test.tsx`)

## Phase 1: Mechanical TSX Migration of `renderer-app`
### Tasks
- [x] Rename `src/renderer/renderer-app.ts` -> `src/renderer/renderer-app.tsx`.
- [x] Convert `AppShell` render tree from `createElement(...)` to JSX.
- [x] Convert initialization failure render block to JSX.
- [x] Replace `createElement(AppShell, ...)` render calls with JSX (`<AppShell ... />`).
- [x] Remove `createElement` import from `react` once no longer needed.
- [x] Keep behavior unchanged in this phase (no event-flow redesign yet).

### Notes
- Do not refactor state shape, autosave logic, or IPC wiring in the same commit.
- Preserve functional behavior and only touch rendering syntax/call sites.

### Gate 1 (Mechanical Migration Complete)
- [x] `rg "createElement\\(" src/renderer/renderer-app.tsx` returns no matches
- [x] `pnpm run typecheck` passes
- [x] `pnpm run build` passes
- [x] `src/renderer/renderer-app.test.ts` passes

## Phase 2: Remove Backward Compatibility Shim
### Tasks
- [x] Delete `src/renderer/legacy-renderer.ts`.
- [x] Verify no imports reference `startLegacyRenderer`.
- [ ] Update docs/comments that still describe preserving compatibility surface.

### Gate 2 (Single Entry Path)
- [x] `rg "legacy-renderer|startLegacyRenderer" src` returns no matches
- [x] `src/renderer/main.ts` remains the only renderer boot path
- [x] `pnpm run typecheck` passes
- [x] `pnpm run build` passes

## Phase 3: Move Enter-to-Save Behavior into React Ownership
### Tasks
- [ ] Identify the settings subtree boundary in `renderer-app.tsx` and choose one owner:
- [ ] Option A (preferred): a single `<form onSubmit={...}>` wrapping settings controls and save action
- [ ] Option B: React `onKeyDown` handler scoped to settings container (if form wrapping is too invasive)
- [x] Remove `document.addEventListener('keydown', ...)` path for settings Enter-save.
- [x] Delete `detachSettingsEnterSaveKeyListener` state and cleanup code.
- [x] Preserve textarea exemption behavior (`Enter` in textarea should not submit).
- [x] Add/adjust tests for Enter-save behavior under the new React-owned path.

### Gate 3 (No Global DOM Keyboard Hook for Settings Save)
- [x] `rg "document.addEventListener\\('keydown'" src/renderer/renderer-app.tsx` returns no matches for settings Enter-save
- [x] `renderer-app` tests cover Enter-save behavior (including textarea non-submit)
- [x] `pnpm run typecheck` passes
- [x] `pnpm run build` passes

## Phase 4: Reduce Legacy Selector Compatibility Coupling
### Tasks
- [ ] Review `src/renderer/renderer-app.test.ts` selector assertions and split into:
- [ ] Public contract selectors (keep)
- [ ] Internal structure/legacy parity selectors (remove or replace with behavioral assertions)
- [x] Replace broad "preserves selector contracts" framing with "renders required UI and workflows".
- [x] Prefer visible text/role/behavior assertions where practical.

### Suggested keep-vs-remove policy
- Keep:
- `data-route-tab` only if used by e2e/automation contract
- `#toast-layer` only if externally targeted
- `#settings-save-message` only if externally targeted or accessibility contract
- Remove:
- Assertions that only freeze internal layout structure without product value

### Gate 4 (Contract Clarified)
- [x] Test names reflect behavior, not legacy parity
- [x] Internal-only selector assertions reduced
- [x] Required e2e/public selectors documented (inline comment or docs note)

## Phase 5: TSX and Config Cleanup
### Tasks
- [x] Replace `as any` style casts in TSX files with `CSSProperties` (or typed helper):
- [x] `src/renderer/home-react.tsx`
- [x] `src/renderer/settings-shortcuts-react.tsx`
- [ ] Confirm `vitest` coverage excludes `.test.tsx` where intended:
- [x] Update `vitest.config.ts` exclude from `**/*.test.ts` to `**/*.test.{ts,tsx}`
- [ ] Re-run coverage command if this branch uses coverage in CI gating.

### Gate 5 (Debt Cleanup Complete)
- [x] `rg "as any}" src/renderer/*.tsx` returns no matches (or only justified exceptions with comments)
- [x] `vitest.config.ts` excludes both `.test.ts` and `.test.tsx`
- [x] `pnpm run typecheck` passes

## Phase 6: Split `renderer-app.tsx` by Responsibility (Post-Migration Refactor)
### Tasks
- [ ] Extract render-only UI shell composition into a smaller module/component (target < 600 LOC per file).
- [ ] Extract IPC listener wiring (`onCompositeTransformStatus`, `onRecordingCommand`, `onHotkeyError`) into a focused module/hook.
- [ ] Extract settings save/autosave orchestration helpers if needed.
- [ ] Keep public API stable: `startRendererApp`, `stopRendererAppForTests`.

### Suggested extraction order (low risk)
1. Extract presentational `AppShell` and toast rendering
2. Extract event wiring
3. Extract autosave/settings mutation helpers

### Gate 6 (Maintainability Target)
- [ ] No renderer file > 600 LOC (or documented exception with follow-up)
- [ ] `renderer-app` public exports unchanged unless intentionally updated
- [x] All targeted renderer tests pass

## Validation Matrix (Run After Each Phase)
- [x] `pnpm run typecheck`
- [x] `pnpm run build`
- [x] `pnpm vitest run src/renderer/renderer-app.test.ts`
- [x] `pnpm vitest run src/renderer/home-react.test.tsx src/renderer/settings-api-keys-react.test.tsx src/renderer/settings-endpoint-overrides-react.test.tsx src/renderer/settings-output-react.test.tsx src/renderer/settings-recording-react.test.tsx src/renderer/settings-save-react.test.tsx src/renderer/settings-shortcut-editor-react.test.tsx src/renderer/settings-shortcuts-react.test.tsx src/renderer/settings-transformation-react.test.tsx src/renderer/shell-chrome-react.test.tsx`

## Risk Register and Mitigations
### Risk: Regressing settings save behavior during Enter-to-save refactor
- Mitigation: add explicit tests for Enter on input vs textarea before deleting global listener.

### Risk: JSX migration introduces subtle prop/wrapper changes
- Mitigation: mechanical-only Phase 1 and pass `renderer-app.test.ts` before any structural refactor.

### Risk: Removing selector compatibility breaks hidden e2e assumptions
- Mitigation: define minimal public selectors and keep only those; remove the rest deliberately.

### Risk: Large-file refactor causes mixed concerns / hard review
- Mitigation: separate extraction commits by concern (render tree, wiring, autosave).

## Definition of Done
- [x] `renderer-app` is `.tsx` and no longer uses `createElement`
- [x] `legacy-renderer.ts` removed
- [x] Settings Enter-save owned by React, not `document` keydown listener
- [x] Selector compatibility reduced to explicit public contracts only
- [x] TSX typing cleanup completed (`CSSProperties`, no unnecessary `any`)
- [x] Coverage config handles `.test.tsx`
- [ ] Renderer app split to maintainable module sizes — **follow-up tracked in Phase 6 above**; extraction plan documented (AppShell props refactor → sub-module split); code comment added to renderer-app.tsx explaining intentional exception

## Suggested Commit Plan (Reviewable Diffs)
1. `refactor(renderer): migrate renderer-app to tsx jsx syntax`
2. `refactor(renderer): remove legacy renderer compatibility shim`
3. `refactor(renderer): move settings enter-save into react form ownership`
4. `test(renderer): reduce legacy selector parity assertions to public contracts`
5. `chore(renderer): clean tsx style typing and vitest tsx coverage globs`
6. `refactor(renderer): split renderer-app by responsibility`
