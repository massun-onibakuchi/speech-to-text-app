<!--
Where: docs/github-issues-214-216-work-plan.md
What: Execution plan for GitHub issues #214, #215, #216 under parent #208.
Why: Deliver legacy cleanup in small, reviewable, one-ticket-per-PR slices with explicit risk gates.
-->

# GitHub Issues Work Plan (#214, #215, #216) - Feb 28, 2026

## Plan Rules
- One ticket equals one PR.
- One PR must reference exactly one GitHub issue.
- Every ticket includes: goal, checklist, tasks, gates, granularity, feasibility, potential risk.
- Behavior/schema contract changes require a decision doc in `docs/decisions/` in the same PR.
- Every ticket updates tests and docs when behavior/contracts or user guidance changes.

## Source of Truth
- Parent issue: #208 `Remove legacy code`
- Open issues reviewed on Feb 28, 2026:
  - #214 Docs cleanup: stale legacy-contract references
  - #215 Legacy cleanup: obsolete settings migrations
  - #216 Contract tests: post-sunset schema behavior

## Priority Model
- P0: Runtime/settings-contract correctness and migration removal.
- P1: Regression-proofing tests that lock the new contract.
- P2: Specs/docs cleanup to remove stale normative guidance.

## Dependency Map
- Hard dependencies:
  - #216 depends on #215 (tests must lock post-cleanup behavior, not pre-cleanup compatibility behavior).
- Soft sequencing:
  - #214 after #215 and #216, so docs describe the finalized post-sunset contract.

## Ticket Index (Sorted by Priority)

| Priority | Ticket | Issue | Type | Hard Depends On | Soft Sequence |
|---|---|---|---|---|---|
| P0 | Remove obsolete settings migration branches | #215 | Backend Contract Cleanup | None | None |
| P1 | Add post-sunset contract regression tests | #216 | QA + Backend Contract Tests | #215 | None |
| P2 | Clean stale legacy-contract references in specs/docs | #214 | Docs + Spec Alignment | None | after #215/#216 |

---

## P0 Ticket

### #215 - [P0] Remove obsolete settings migration branches
- Type: Backend Contract Cleanup
- Goal: Remove one-time legacy migration branches from `settings-service` that are now outside support policy, while preserving strict validation and current-schema persistence behavior.
- Granularity:
  - Runtime scope: settings-service plus schema/parser modules directly invoked by settings migrate/load/save.
  - Test scope: `settings-service` and schema contract tests only.
  - Docs scope: one decision doc for migration sunset plus one settings-contract doc update.
  - Out of scope: UI refactors and orchestrator behavior changes.
- Checklist:
  - [ ] Create decision doc defining migration sunset boundary and rationale.
  - [ ] Perform pre-removal corpus audit of historical settings fixtures/stored samples available in repo.
  - [ ] Enumerate migration branches currently in `migrateSettings` and classify keep/remove.
  - [ ] Remove obsolete migration helpers and dead calls from migration pipeline.
  - [ ] Keep startup normalization/parsing behavior that strips unknown/deprecated keys.
  - [ ] Update settings-service tests/fixtures for removed migration paths.
  - [ ] Update docs describing settings load/save contract.
- Tasks (Step-by-step):
  1. Capture baseline with explicit commands (`pnpm vitest src/main/services/settings-service.test.ts src/shared/domain.test.ts`).
  2. Run corpus audit before deletion and capture represented/missing payload shapes in PR notes.
  3. Create a migration inventory table (helper, legacy key, remove/keep decision, reason).
  4. Remove deprecated migration helpers and update `migrateSettings` composition.
  5. Simplify tests by deleting cases tied only to removed compatibility paths.
  6. Add/adjust tests that verify strict parse + persistence still hold.
  7. Re-run the same focused commands and one broader guard (`pnpm vitest src/main/services src/shared`), plus startup-related tests (`pnpm vitest src/main/core/app-lifecycle.test.ts`), then record command output summary in PR.
- Gates:
  - No removed migration helper remains reachable in runtime path.
  - Settings still load/save under current schema without validation regressions.
  - Startup settings load path passes targeted tests after migration removal.
  - CI pipeline for the PR branch is green before merge.
  - Decision doc is merged and referenced in PR.
  - PR references only issue #215.
- Potential Risk:
  - Trigger: removal drops normalization still needed for valid current payload shapes.
  - Detection: settings-service tests fail or startup parse throws for current fixtures.
  - Mitigation: remove migrations one by one with green tests after each deletion and explicit fixture coverage.
  - Trigger: persisted real-world settings variants are missing from test fixtures.
  - Detection: sample audit from historical fixtures or anonymized stored settings shows unmapped shapes.
  - Mitigation: add corpus-based fixtures before final migration-branch deletion.
  - Rollback validation: revert PR and verify removed migration tests pass again.
- Feasibility:
  - Medium: code surface is small, but cleanup requires precise distinction between dead compatibility code and still-required normalization.

## P1 Ticket

### #216 - [P1] Add post-sunset settings contract tests
- Type: QA + Backend Contract Tests
- Depends On: #215
- Goal: Lock strict post-sunset settings contract behavior so deprecated keys cannot silently return through parse/load/save paths.
- Granularity:
  - Scope to tests around schema parsing, normalization, and settings persistence contract.
  - No production behavior changes in #216. If tests expose behavior gaps, open follow-up issue(s) and keep this PR test-only.
- Checklist:
  - [ ] Enumerate active settings ingress paths in-scope for this ticket before writing tests.
  - [ ] Add contract tests that fail if deprecated keys are persisted after load/save.
  - [ ] Add tests for valid happy-path payloads that must remain accepted.
  - [ ] Add tests for invalid legacy payloads that must fail fast or normalize deterministically.
  - [ ] Verify provider/model constraints continue to fail fast under invalid combinations.
  - [ ] Update docs on supported settings payload expectations.
- Tasks (Step-by-step):
  1. Enumerate in-scope ingress paths (for example: settings-service load/save, schema parse entry points) and mark excluded paths in PR.
  2. Define canonical post-sunset payload fixtures (valid and invalid).
  3. Add parse-only tests at shared schema layer.
  4. Add settings-service persistence tests proving deprecated keys are not re-written.
  5. Add negative tests for required provider/model constraints.
  6. Run explicit matrix commands and record them in PR (`pnpm vitest src/shared/domain.test.ts src/main/services/settings-service.test.ts` plus ingress-path test files selected in task 1).
- Gates:
  - Contract tests fail when deprecated keys are reintroduced.
  - Valid payloads pass consistently.
  - Invalid payloads fail or normalize exactly as documented.
  - In-scope ingress-path matrix is fully covered or explicitly excluded with rationale.
  - CI pipeline for the PR branch is green before merge.
  - PR references only issue #216.
- Potential Risk:
  - Trigger: tests overfit implementation details and become brittle on harmless refactors.
  - Detection: frequent non-contract test breakage from internal refactors.
  - Mitigation: assert external contract outcomes only (accepted/rejected payload + persisted shape), not helper internals.
  - Trigger: deprecated keys re-enter via non-settings-service ingress paths.
  - Detection: ingress-path contract matrix (each loader/path represented by at least one test) shows uncovered path.
  - Mitigation: add one contract test per active ingress path or explicitly mark path out of scope in PR.
  - Rollback validation: revert PR and confirm no runtime behavior changes were introduced.
- Feasibility:
  - High: mostly additive tests with bounded fixtures.

## P2 Ticket

### #214 - [P2] Clean stale legacy-contract references in specs/docs
- Type: Docs + Spec Alignment
- Goal: Remove or mark superseded all stale normative references to removed legacy concepts across `specs/` and `docs/`.
- Granularity:
  - Scope to documentation/spec content only.
  - No runtime code changes.
- Checklist:
  - [ ] Run targeted grep audits for legacy terms (`activePresetId`, removed shortcut assumptions, old migration references).
  - [ ] Update stale normative text to current contract language.
  - [ ] Mark intentionally historical docs as superseded/historical with explicit status banner.
  - [ ] Confirm no active guidance conflicts with current schema/behavior.
  - [ ] Add docs validation note in PR summary with concrete audit commands and zero-conflict result.
- Tasks (Step-by-step):
  1. Build a searchable stale-term list from removed contracts and run explicit commands (for example `rg -n \"activePresetId|autoRunDefaultTransform|startRecording|stopRecording\" specs docs`).
  2. Classify each hit as normative, historical, or false-positive context.
  3. Edit normative sections to current behavior and add superseded banners where needed.
  4. Re-run grep audit and attach results to PR description.
  5. Cross-check updates against latest decision docs from #215/#216.
- Gates:
  - Targeted grep set returns no stale terms in active normative guidance.
  - Historical references are clearly labeled as superseded/historical.
  - Audit command list and grep results are attached in PR description.
  - PR references only issue #214.
- Potential Risk:
  - Trigger: historical context is deleted instead of marked, losing decision traceability.
  - Detection: missing linkage between current contract and previous decisions in doc review.
  - Mitigation: prefer status banners and superseded notes over deletion where history is still useful.
  - Rollback validation: revert PR and confirm previous doc state restoration.
- Feasibility:
  - High: bounded to docs/spec edits, low runtime risk.
  - Guardrail: if stale-term hits affect more than 15 files, split work into sequential specs/docs-focused PR slices under issue #214.

## Recommended Execution Order
1. #215
2. #216
3. #214

## Definition of Done (Per Ticket PR)
- [ ] PR references exactly one issue and one ticket from this plan.
- [ ] Ticket goal, checklist, and gates are copied into PR description and checked.
- [ ] For code-impacting tickets, at least one test is added/updated. For docs-only tickets, grep/audit evidence and reviewer checklist are attached.
- [ ] Docs are updated for contract or guidance changes.
- [ ] Rollback steps and post-revert validation are included.
- [ ] Required CI checks are green before merge.
