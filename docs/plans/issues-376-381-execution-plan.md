<!--
Where: docs/plans/issues-376-381-execution-plan.md
What: Prioritized execution plan for issues #376-#381.
Why: Remove legacy/dead code with zero backward-compat maintenance while preserving current runtime behavior.
-->

# Execution Plan: Issues #376-#381 (Legacy/Dead Code Removal)

Date: 2026-03-05  
Status: Planning only (no implementation started)

Issues:
- #376 https://github.com/massun-onibakuchi/speech-to-text-app/issues/376
- #377 https://github.com/massun-onibakuchi/speech-to-text-app/issues/377
- #378 https://github.com/massun-onibakuchi/speech-to-text-app/issues/378
- #379 https://github.com/massun-onibakuchi/speech-to-text-app/issues/379
- #380 https://github.com/massun-onibakuchi/speech-to-text-app/issues/380
- #381 https://github.com/massun-onibakuchi/speech-to-text-app/issues/381

## Execution Constraints

- 1 ticket = 1 PR.
- Tickets are sorted by priority and dependency.
- Remove legacy/dead code completely; do not add backward-compat paths.
- Preserve current user-visible runtime behavior (unless issue explicitly changes contract).
- Keep each PR small, reversible, and test-backed.
- Each ticket must include at least one updated/added automated test and one docs update (or explicit N/A justification in PR notes).

## Preflight Workflow Gates

- [ ] Worktree created via `wt switch --base main --create <branch> --yes` before implementation.
- [ ] Planning approved before coding.
- [ ] For each ticket PR: run two-stage review (sub-agent review first, Claude review second; if Claude unavailable, record failure reason and run fallback second review).

## Priority and Sequencing

| Priority | Ticket | Issue | PR | Depends On | Feasibility | Primary Risk |
|---|---|---|---|---|---|---|
| P0 | T378 — Remove legacy `start/stop` recording commands | #378 | PR-1 | None | Medium-High | Contract drift across main/renderer/tests |
| P1 | T376 — Remove dead `TransformationOrchestrator` | #376 | PR-2 | None | High | Hidden runtime references missed |
| P2 | T377 — Remove unreachable manual transform action + obsolete IPC channel | #377 | PR-3 | PR-2, PR-1 | Medium | Incomplete IPC contract cleanup |
| P3 | T381 — Strict-unused dead-symbol sweep | #381 | PR-4 | PR-3 | High | Duplicating/removing symbols already handled |
| P4 | T379 — Resolve no-op activity logging path by deletion | #379 | PR-5 | PR-3 (soft) | Medium-High | Accidentally removing real feedback paths |
| P5 | T380 — Remove compatibility-only normalization/tests/docs drift | #380 | PR-6 | PR-1, PR-3, PR-5 | Medium | Over-pruning strict-schema boundaries |

Priority rationale:
- #378 is the biggest contract simplification touching shared command types and command routing, so it should land first.
- #376 and #377 remove dead orchestration/API surfaces and reduce overlap before broader cleanup.
- #381 follows #377 to avoid duplicate edits around `runCompositeTransformAction`.
- #379 is mostly isolated but touches shared renderer files; sequence it after PR-3 to reduce rebase churn.
- #380 is broadest and highest drift risk, best done last after dead-path removals settle.

---

## Ticket T378 (P0): Issue #378 -> PR-1

### Goal
Remove legacy recording command variants (`startRecording`, `stopRecording`) and keep only supported command set (`toggleRecording`, `cancelRecording`) across shared contracts, runtime handling, and tests.

### Approach
- Contract-first refactor: narrow command union type in shared IPC definitions.
- Delete dead branches in renderer/native recording command handling and main orchestration paths that special-case `start/stop`.
- Update tests to assert only current producer behavior and supported command variants.

### Scope Files
- `src/shared/ipc.ts`
- `src/renderer/native-recording.ts`
- `src/main/orchestrators/recording-orchestrator.ts`
- `src/main/core/command-router.ts` (if variant checks exist)
- `src/main/ipc/recording-command-dispatcher.test.ts` (dispatch contract updates)
- `src/renderer/home-status.test.ts` (legacy action-id fixtures)
- Tests:
  - `src/renderer/native-recording.test.ts`
  - `src/main/core/command-router.test.ts`
  - `src/main/orchestrators/recording-orchestrator.test.ts`
  - `src/renderer/renderer-app.test.ts`
  - `e2e/electron-ui.e2e.ts`

### Trade-offs
- Selected: hard-delete unsupported variants now.
  - Pros: strict, simple contract; fewer branches.
  - Cons: no tolerance for stale callers.
- Rejected: keep hidden adapter for `start/stop`.
  - Pros: temporary compatibility.
  - Cons: violates no-backward-compat requirement and keeps dead complexity.

### Proposed Snippets (non-applied)
```ts
// shared/ipc.ts
export type RecordingCommandType = 'toggleRecording' | 'cancelRecording'
```

```ts
// renderer/native-recording.ts
if (command.type === 'toggleRecording') {
  return isRecording ? stop() : start()
}
if (command.type === 'cancelRecording') {
  return cancel()
}
```

### Tasks
- [ ] Generate impacted file list with `rg "startRecording|stopRecording" src e2e` and classify files into:
  - direct contract/runtime removal (this ticket),
  - unrelated compatibility tests (can remain only if they no longer reference removed commands).
- [ ] Remove `startRecording`/`stopRecording` from shared command type.
- [ ] Remove corresponding dead branches in renderer command handling.
- [ ] Remove any main-path `start/stop` conditional logic tied only to legacy variants.
- [ ] Update all unit/e2e tests expecting legacy variants.
- [ ] Update docs/spec sections that list removed recording commands.
- [ ] Re-run typecheck and targeted suites for command routing.

### Checklist
- [ ] Only `toggleRecording` and `cancelRecording` exist in recording command contract.
- [ ] No code path branches on removed legacy command names.
- [ ] Producers (UI/hotkey) remain unchanged.
- [ ] Test suite expectations match new strict command set.
- [ ] At least one automated regression test is added/updated in PR-1.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] `pnpm run typecheck` passes.
- [ ] Command-router, recording-orchestrator, and native-recording tests pass.
- [ ] E2E command-path smoke stays green.
- [ ] Search gate: `rg "startRecording|stopRecording" src e2e` returns zero intentional references.

### Risk
- Potential risk: Hidden command emitters outside known producers.
- Mitigation: exhaustive `rg` and compile-time union narrowing errors as hard stop.

---

## Ticket T376 (P1): Issue #376 -> PR-2

### Goal
Delete dead `TransformationOrchestrator` runtime concept and stale test suite while keeping queue-based transform path unchanged.

### Approach
- Remove orphaned orchestrator file and test file.
- Verify runtime transform path remains `register-handlers -> command-router -> transform-pipeline/queue`.
- Keep no compatibility shim for removed class.

### Scope Files
- Remove:
  - `src/main/orchestrators/transformation-orchestrator.ts`
  - `src/main/orchestrators/transformation-orchestrator.test.ts`
- Verify-only references:
  - `src/main/ipc/register-handlers.ts`
  - `src/main/core/command-router.ts`
  - `src/main/orchestrators/transform-pipeline.ts`

### Trade-offs
- Selected: delete entire orphan class and stale tests.
  - Pros: removes duplicate orchestration concept.
  - Cons: loses historical test artifacts (intended).
- Rejected: keep class but mark deprecated.
  - Pros: less diff.
  - Cons: still dead surface and maintenance drag.

### Proposed Snippets (non-applied)
```ts
// delete file: transformation-orchestrator.ts
// no replacement: active runtime path already uses TransformQueue pipeline.
```

### Tasks
- [ ] Remove dead orchestrator implementation file.
- [ ] Remove dead orchestrator test suite.
- [ ] Update exports/imports/index references if any.
- [ ] Verify transform runtime path tests still represent current architecture.
- [ ] Add/update docs note listing queue path as single supported transform orchestration model.

### Checklist
- [ ] No runtime code imports `TransformationOrchestrator`.
- [ ] No test suite depends on removed pre-queue orchestration model.
- [ ] Queue pipeline behavior remains unchanged.
- [ ] At least one automated regression test is added/updated in PR-2.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] `rg "TransformationOrchestrator" src` returns zero intentional matches.
- [ ] `transform-pipeline` and `command-router` tests pass.
- [ ] No changes required in production transform behavior.

### Risk
- Potential risk: indirect barrel export/import breakage.
- Mitigation: compile and run focused main-process tests.

---

## Ticket T377 (P2): Issue #377 -> PR-3

### Goal
Remove unreachable renderer manual transform action and obsolete IPC channel (`runCompositeTransformFromClipboard`) after explicit requirement confirmation that no product flow depends on it.

### Approach
- Delete unused renderer helper `runCompositeTransformAction` and dead callsite logic.
- Remove obsolete IPC channel from shared contract, preload bridge, and main handler registration.
- Keep shortcut/queue transform path intact as sole supported model.

### Scope Files
- `src/renderer/renderer-app.tsx`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `e2e/electron-ui.e2e.ts`
- Tests touching removed channel/renderer action.

### Trade-offs
- Selected: full channel removal.
  - Pros: smaller IPC contract, no ghost APIs.
  - Cons: breaks any undocumented external caller (acceptable under no-backward-compat).
- Rejected: keep channel hidden and unused.
  - Pros: avoids potential external break.
  - Cons: keeps dead API surface and confusion.

### Proposed Snippets (non-applied)
```ts
// shared/ipc.ts
// remove runCompositeTransformFromClipboard from channels and bridge types
```

```ts
// renderer-app.tsx
// remove runCompositeTransformAction and references; no UI trigger remains.
```

### Tasks
- [ ] Blocking decision gate: add issue comment/acceptance note confirming no active requirement for manual transform channel.
- [ ] Remove `runCompositeTransformAction` function.
- [ ] Remove obsolete IPC contract channel and preload exposure.
- [ ] Remove corresponding main IPC handler branch.
- [ ] Update tests that covered manual/legacy transform trigger only.
- [ ] Update docs/spec sections that mention manual transform channel.

### Checklist
- [ ] No renderer UI callback references removed manual action.
- [ ] IPC surface no longer exposes obsolete channel.
- [ ] Shortcut-driven transform flow continues unchanged.
- [ ] At least one automated regression test is added/updated in PR-3.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] Requirement confirmation note exists in issue/PR before deletion lands.
- [ ] `rg "runCompositeTransform(Action|FromClipboard)" src e2e` returns zero intentional matches.
- [ ] IPC contract tests and affected renderer tests pass.
- [ ] Transform success/failure behavior through hotkey path remains unchanged.

### Risk
- Potential risk: channel still referenced in a non-obvious fixture/test helper.
- Mitigation: full-repo search and targeted e2e/contract tests.

---

## Ticket T381 (P3): Issue #381 -> PR-4

### Goal
Prune strict-unused symbols and keep `tsc --noUnusedLocals --noUnusedParameters` clean for production code and intentional test placeholders.

### Approach
- Run strict-unused check to generate current candidate list after PR-3.
- Remove confirmed dead symbols (including `escapeHtml` and any residual dead helpers).
- Clean only true dead code; avoid semantic rewrites.

### Scope Files
- `src/main/services/profile-picker-service.ts`
- Any files reported by strict-unused check after prior tickets
- Associated tests where placeholders become obsolete

### Trade-offs
- Selected: check-driven pruning in isolated PR.
  - Pros: deterministic, objective signal.
  - Cons: depends on prior PR sequencing to avoid overlap.
- Rejected: opportunistic ad-hoc cleanup across all PRs.
  - Pros: less dedicated process.
  - Cons: noisy diffs and missed dead symbols.

### Proposed Snippets (non-applied)
```ts
// profile-picker-service.ts
// remove unused escapeHtml helper and dead references.
```

### Tasks
- [ ] Run strict-unused TypeScript check and capture candidate list.
- [ ] Remove each confirmed dead symbol with minimal edits.
- [ ] Update/remove tests using legacy-only placeholders.
- [ ] Update docs/changelog note with removed dead-symbol list for auditability.
- [ ] Re-run strict-unused check until green.

### Checklist
- [ ] No remaining strict-unused production symbols.
- [ ] Test-only intentional unused parameters are explicitly prefixed/justified.
- [ ] No functional behavior changed.
- [ ] At least one automated regression test is added/updated in PR-4.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] `pnpm run typecheck` passes.
- [ ] `pnpm -s exec tsc --noEmit --noUnusedLocals --noUnusedParameters` passes.
- [ ] Related unit tests pass in touched modules.
- [ ] Diff audit confirms cleanup-only change class.

### Risk
- Potential risk: false-positive cleanup of symbol used indirectly (dynamic/reflection).
- Mitigation: search usage + tests + conservative delete-only strategy.

---

## Ticket T379 (P4): Issue #379 -> PR-5

### Goal
Resolve misleading no-op activity logging path by deleting no-op callsites and keeping current behavior model (toast + terminal-only activity feed) unchanged.

### Approach
- Choose direction (1) from issue: remove no-op `addActivity` usage rather than re-enable insertion.
- Delete no-op helper and callsites in renderer/native/settings mutations where calls currently do nothing.
- Update tests/text expectations that assume activity insertion from these no-op calls.

### Scope Files
- `src/renderer/renderer-app.tsx`
- `src/renderer/native-recording.ts`
- `src/renderer/settings-mutations.ts`
- Related tests under `src/renderer/*.test.ts*`

### Trade-offs
- Selected: remove ghost calls to preserve actual runtime behavior.
  - Pros: zero behavior change, lower confusion.
  - Cons: less explicit placeholder for future activity extension.
- Rejected: restore real activity insertion.
  - Pros: richer activity feed.
  - Cons: behavior change, larger scope, added regression risk.

### Proposed Snippets (non-applied)
```ts
// renderer-app.tsx
// remove addActivity no-op helper entirely
```

```ts
// settings-mutations.ts
// remove addActivity('...') calls that had no runtime effect
```

### Tasks
- [ ] Remove no-op `addActivity` helper.
- [ ] Remove callsites in renderer/native/settings mutations.
- [ ] Update tests that assert strings/calls tied only to no-op path.
- [ ] Add targeted automated regression test proving toast/terminal activity behavior is unchanged.
- [ ] Update docs note clarifying intentional activity model (terminal-only + toast feedback).
- [ ] Verify toasts and terminal activity behavior remain intact.

### Checklist
- [ ] No no-op activity helper remains.
- [ ] No stale callsites imply behavior that does not happen.
- [ ] User-visible behavior remains unchanged.
- [ ] At least one automated regression test is added/updated in PR-5.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] `rg "addActivity\(" src/renderer` returns only real/non-no-op activity mechanisms.
- [ ] Renderer tests for notifications/activity continue to pass.
- [ ] Added regression test for no-op path removal passes.
- [ ] Manual smoke confirms no new/removed user-visible activity items.

### Risk
- Potential risk: removing callsites that also trigger side effects.
- Mitigation: inspect each callsite before deletion; only remove pure no-op calls.

---

## Ticket T380 (P5): Issue #380 -> PR-6

### Goal
Remove compatibility-only normalization paths and stale docs/spec references so runtime/tests enforce only current schema/contract.

### Approach
- Inventory compatibility-only tests and corresponding normalization branches.
- Delete deprecated payload acceptance paths in settings/domain/prompt/shortcut processing where not part of current contract.
- Rewrite tests to strict current-schema assertions.
- Update `specs/spec.md` to remove removed fields/flows (e.g., old `baseUrlOverrides` references and outdated transform sequence).
- Build a per-branch decision table before deletions:
  - `remove`: pure backward-compat normalization for deprecated payloads.
  - `keep`: invariant/safety guard still required for current persisted schema.
  - `migrate`: data-shape transition needing explicit startup migration test coverage.

### Scope Files
- `src/main/services/settings-service.ts` and `.test.ts`
- `src/shared/domain.ts` and `.test.ts`
- `src/main/services/transformation/prompt-format.ts` and `.test.ts`
- `src/renderer/settings-validation.ts` and `.test.ts`
- `src/renderer/shortcut-capture.ts` and `.test.ts`
- `src/renderer/settings-shortcut-editor-react.test.tsx`
- `specs/spec.md`
- `src/main/routing/processing-mode-source.test.ts`

### Trade-offs
- Selected: strict current-contract enforcement.
  - Pros: clear boundaries, less maintenance, easier reasoning.
  - Cons: old payloads/configs no longer accepted.
- Rejected: keep normalization adapters “just in case”.
  - Pros: soft landing.
  - Cons: continued backward-compat burden and ambiguity.

### Proposed Snippets (non-applied)
```ts
// settings-service.ts
// remove legacy field normalization branches; fail/ignore per current schema only.
```

```ts
// domain.test.ts
it('rejects deprecated payload forms and accepts current schema only', () => {
  // strict-schema assertions
})
```

### Tasks
- [ ] Build and commit a branch decision table (`remove` / `keep` / `migrate`) for each targeted normalization branch.
- [ ] Remove compatibility-only normalization branches.
- [ ] Rewrite compatibility-focused tests to strict-schema tests.
- [ ] Update spec/docs references to current contract only.
- [ ] Add/refresh startup-load fixtures that represent historical persisted settings data and verify valid-current schema still loads.
- [ ] Run full targeted test matrix for settings/domain/transformation/shortcut areas.

### Checklist
- [ ] No compatibility-only branches remain in targeted modules.
- [ ] Tests validate strict current contract, not historical shapes.
- [ ] Spec text aligns with implemented contract and removed fields.
- [ ] At least one automated regression test is added/updated in PR-6.
- [ ] Docs/spec delta is included (or explicit N/A justification is documented in PR description).

### Gates
- [ ] Targeted tests in all touched modules pass.
- [ ] `rg` shows removed deprecated fields no longer referenced in code/spec where not valid.
- [ ] Review confirms no silent schema coercion remains.
- [ ] Startup/load gate: legacy persisted-settings fixtures are tested and each removed branch is proven non-required for valid current data loading.

### Risk
- Potential risk: removing normalization that still protects real persisted data edge cases.
- Mitigation: classify each branch as compatibility-only vs invariant-protection; keep invariant protection.

---

## Cross-Ticket Risk Controls

- Behavior lock: prioritize delete-only changes that do not alter current user-visible flow.
- Contract lock: use type narrowing + exhaustive checks to force compile-time removal of dead variants.
- Search lock: `rg`-based removal verification for targeted legacy symbols/channels after each PR.
- Test lock: each PR must include at least one regression test update aligned to current business logic.

## Suggested PR Merge Order

1. PR-1 (T378)
2. PR-2 (T376)
3. PR-3 (T377)
4. PR-4 (T381)
5. PR-5 (T379)
6. PR-6 (T380)

## Review Criteria Coverage

- Ticket granularity: one issue -> one ticket -> one PR, with bounded scope files.
- Ticket priority: ordered by contract centrality, dependency, and drift risk.
- Feasibility: each ticket states feasibility and execution gates.
- Potential risk: explicit per-ticket risk + mitigation.
- Proposed approaches: each ticket defines selected/rejected approach and snippets.
