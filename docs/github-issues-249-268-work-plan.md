<!--
Where: docs/github-issues-249-268-work-plan.md
What: Priority-sorted execution and closeout plan for GitHub tickets #249-#268 using one-ticket-per-PR rules.
Why: Provide granular, feasible, backward-compatible delivery gates with explicit risk control.
-->

# GitHub Issues Work Plan (#249-#268) - March 1, 2026

## Plan Rules
- New work: one ticket equals one PR.
- New work: one PR references exactly one ticket.
- Keep backward compatibility by default; allow contract breaks only when the ticket explicitly calls for it.
- Every ticket includes goal, checklist, tasks, and gates.
- Each active code ticket must include at least one automated test and docs update in the same PR.
- Behavior/contract changes require a decision doc in `docs/decisions/`.
- Do not start dependent tickets until predecessor PRs are merged to `main`.

## Scope Snapshot (Issues/PRs #249-#268)
- Open issues requiring implementation planning: #252, #255, #267, #268.
- Closed/merged items in range are treated as closeout verification tickets.
- State mismatch to reconcile first: #249 appears open while [PR #266](https://github.com/massun-onibakuchi/speech-to-text-app/pull/266) is merged and marked `Closes #249`.

## Priority Model
- P0: User-facing correctness in shortcut capture lifecycle.
- P1: Broad UI consistency with behavior-preserving constraints.
- P2: Closeout verification and traceability (already merged tickets).

## Dependency Map
- #267 should land before #268 (both touch shortcut capture state lifecycle).
- #252 and #255 can run in parallel only when shared style primitive overlap is zero; otherwise sequence #252 then #255.
- Closeout verification tickets can run independently in docs-only PRs.

## Ticket Index (Sorted by Priority)

| Priority | Ticket | Status | Type | Depends On | PR Rule |
|---|---|---|---|---|---|
| P0 | #267 Shortcut capture cancel on focus loss/outside click | Open | Bug | #250 merged baseline | 1 ticket = 1 PR |
| P0 | #268 Clear stale shortcut capture error when new recording starts | Open | Bug | Prefer after #267 | 1 ticket = 1 PR |
| P1 | #252 Style consistency for transformation popup menus | Open | UI style-only | None | 1 ticket = 1 PR |
| P1 | #255 Style consistency for select-like controls | Open | UI style-only | Optional after #252 | 1 ticket = 1 PR |
| P2 | #249 Activity transformed output terminal entry | Open state mismatch (fix merged in #266) | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #250 Keybind capture suppression | Closed (fixed in #256) | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #251 Audio Input tab move | Closed (fixed in #260/#264) | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #253 Docs plan (#245-#251) | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #254 Docs closeout (#220-#229) | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #256 PR closes #250 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #257 PR closes #248 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #258 PR closes #247 | Closed PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #259 PR closes #246 | Closed PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #260 PR closes #251 | Closed PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #261 PR closes #245 | Closed PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #262 PR closes #247 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #263 PR closes #246 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #264 PR closes #251 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #265 PR closes #245 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |
| P2 | #266 PR closes #249 | Merged PR | Closeout verify | None | 1 ticket = 1 PR |

## Chunked Step-by-Step Sequence
1. Chunk A (P0 correctness): #267 then #268.
2. Chunk B (P1 UI consistency): #252 and #255 (parallel if safe, otherwise sequential).
3. Chunk C (P2 reconciliation/closeout): #249 and #250-#266 verification tickets.

---

## Active Delivery Tickets

### #267 - [P0] Shortcut capture must cancel on focus loss/outside click
- Goal:
  - Ensure shortcut recording exits immediately when focus leaves the active shortcut input context.
- Checklist:
  - [ ] Cancel on outside click.
  - [ ] Cancel on window blur/focus loss.
  - [ ] Remove `Recording...` indicator immediately on cancel.
  - [ ] No key capture remains active after cancel.
  - [ ] Add automated tests for each cancellation trigger.
  - [ ] Keep existing keybind schema and save contract unchanged.
- Tasks:
  1. Trace capture-state owner (`SettingsShortcutEditorReact` through app shell).
  2. Add unified cancel handler for outside-click and blur events.
  3. Wire window focus-loss events to the same cancel path.
  4. Ensure teardown clears active-field id and recording flags.
  5. Add regression tests in shortcut editor and shell integration tests.
  6. Update decision doc for capture lifecycle if behavior contract changes.
- Gates:
  - Clicking outside active shortcut input always cancels capture.
  - Window blur/focus loss always cancels capture.
  - No shortcut action is triggered during or after cancel teardown unexpectedly.
  - Tests and docs updated in the PR.

### #268 - [P0] Clear stale capture errors when starting recording on another field
- Goal:
  - Prevent old validation errors from persisting when a new shortcut recording session starts.
- Checklist:
  - [ ] Starting new recording clears prior capture error state.
  - [ ] `Recording...` context matches only the active field.
  - [ ] No stale error from previous field is shown while new field is recording.
  - [ ] Add automated tests for cross-field recording transition.
  - [ ] Preserve duplicate-binding validation behavior.
- Tasks:
  1. Identify capture-error state storage and render conditions.
  2. Reset prior error state at new-session start boundary.
  3. Scope error display to active recording field.
  4. Validate transitions: invalid attempt on field A -> start recording field B.
  5. Add regression tests for stale-error suppression and expected new errors.
  6. Update docs for error-state lifecycle contract.
- Gates:
  - Starting recording on a new shortcut field removes previous field errors.
  - New validation errors still appear when new recording attempt is invalid.
  - No regression in duplicate/conflict feedback logic.
  - Tests and docs updated in the PR.

### #252 - [P1] Popup menu style consistency for transformation actions
- Goal:
  - Align popup menu visuals with existing app design tokens without changing behavior.
- Checklist:
  - [ ] Apply style updates only to targeted menus.
  - [ ] Keep pick/change-default transformation behavior unchanged.
  - [ ] Use existing design tokens/classes and spacing/typography conventions.
  - [ ] Add/adjust targeted UI tests or snapshots as needed.
  - [ ] Update style docs/changelog notes.
- Tasks:
  1. Audit menu components used by “Pick and run transformation” and “Change default transformation”.
  2. Refactor markup only if needed to reuse shared UI primitives.
  3. Apply token-consistent styling for hover/focus/active states.
  4. Re-run affected tests and update expected snapshots/assertions.
  5. Verify keyboard navigation and selection interactions are unchanged.
  6. Document style-only scope in PR notes.
- Gates:
  - Menus visually match app style baseline.
  - No behavior or state-transition regression in transformation flows.
  - Targeted tests pass and docs updated.

### #255 - [P1] Standardize select-like control styles across tabs
- Goal:
  - Apply one consistent select-control style language in Audio Input, Profiles, and Settings tabs.
- Checklist:
  - [ ] Identify all select-like controls in scope tabs.
  - [ ] Apply shared styling aligned with reference direction and existing tokens.
  - [ ] Remove legacy style variants in scoped controls.
  - [ ] Keep provider/model/business logic unchanged.
  - [ ] Add/adjust component tests for visual-structure expectations.
  - [ ] Update style docs for standardized control pattern.
- Tasks:
  1. Inventory controls in Audio Input, Profiles, and Settings tabs.
  2. Introduce or reuse a shared select style primitive.
  3. Apply styling incrementally per tab to reduce regression scope.
  4. Validate keyboard accessibility and focus states after restyle.
  5. Update test expectations in affected renderer component tests.
  6. Document standard style contract in docs.
- Gates:
  - Scoped select-like controls render with consistent style.
  - No behavior/logic changes in provider/model selection.
  - Focus, disabled, and validation states remain clear and accessible.
  - Tests and docs updated in the PR.

---

## Closeout Verification Tickets (Backward-Compatibility Audit)

### #249 - [P2] Verify merged fix (#266) and close state reconciliation
- Goal:
  - Confirm production behavior fixed and reconcile issue status mismatch.
- Checklist:
  - [ ] Re-run tests covering transformed output activity behavior.
  - [ ] Confirm no duplicate terminal activity append regressions.
  - [ ] Verify issue closure status on GitHub.
- Tasks:
  1. Run target tests from PR #266 validation set.
  2. Confirm docs decision consistency (`output.selectedTextSource` behavior).
  3. If issue still open, create docs/admin PR note to close with evidence.
- Gates:
  - Behavior matches acceptance criteria.
  - GitHub issue state is consistent with merged fix.

### #250, #251, #253-#266 - [P2] Per-ticket closeout queue
| Ticket | Goal | Checklist | Tasks | Gates |
|---|---|---|---|---|
| #250 | Confirm keybind capture suppression fix remains stable | Mapping recorded; regression test rerun | Re-run shortcut capture tests from PR #256 and verify docs decision link | Tests pass and no suppression regression |
| #251 | Confirm dedicated Audio Input tab behavior and location | Mapping recorded; IA expectations verified | Re-run app-shell/renderer tests used in PR #260/#264 | Tab exists beside Shortcuts and controls are not in generic Settings |
| #253 | Preserve docs-plan audit trail integrity | Mapping recorded; references valid | Check links/status consistency in plan artifact | No broken references |
| #254 | Preserve docs closeout integrity for #220-#229 | Mapping recorded; merged PR refs valid | Validate ticket-to-PR references remain accurate | Closeout doc remains auditable |
| #256 | Confirm #250 fix PR remains green | Mapping recorded; tests rerun | Re-run listed validation tests from PR body | Behavior still matches #250 acceptance criteria |
| #257 | Confirm intentional endpoint-override removal remains contract baseline | Mapping recorded; intentional break explicitly tagged | Re-run core schema/orchestrator tests and verify decision doc | No accidental reintroduction of endpoint override fields |
| #258 | Confirm #247 redaction behavior baseline | Mapping recorded; supersession checked | Compare with #262 and verify current behavior is preserved | Redacted-after-save behavior remains correct |
| #259 | Confirm #246 autosave-toast baseline | Mapping recorded; supersession checked | Compare with #263 and verify toast contract | `Settings autosaved.` toast behavior remains correct |
| #260 | Confirm early #251 implementation state stayed compatible with final follow-up | Mapping recorded; supersession checked | Compare with #264 final state | No regressions from final merged behavior |
| #261 | Confirm early #245 implementation state stayed compatible with final follow-up | Mapping recorded; supersession checked | Compare with #265 final state | Final behavior on `main` matches intended cleanup |
| #262 | Confirm canonical #247 closure state | Mapping recorded; canonical set | Use #262 as final closure PR for #247 | Canonical PR assignment documented |
| #263 | Confirm canonical #246 closure state | Mapping recorded; canonical set | Use #263 as final closure PR for #246 | Canonical PR assignment documented |
| #264 | Confirm canonical #251 closure state | Mapping recorded; canonical set | Use #264 as final closure PR for #251 | Canonical PR assignment documented |
| #265 | Confirm canonical #245 closure state | Mapping recorded; canonical set | Use #265 as final closure PR for #245 | Canonical PR assignment documented |
| #266 | Confirm canonical #249 closure state and resolve open-issue mismatch | Mapping recorded; issue status reconciled | Verify behavior and close #249 if still open | Issue/PR state is consistent |

## Explicit Ticket -> PR Mapping (Audit Table)

| Ticket | Canonical Closing PR | Historical multi-PR closure (pre-rule) | Observed State | Backward Compatibility Posture |
|---|---|---|---|---|
| #249 | #266 | None | Issue open, PR merged | Intended to preserve behavior (bug fix) |
| #250 | #256 | None | Closed/merged | Preserved |
| #251 | #264 | #260 | Closed/merged | Preserved |
| #252 | TBD | None | Open | Preserve behavior (style-only) |
| #255 | TBD | None | Open | Preserve behavior (style-only) |
| #253 | #253 | None | Merged | Not applicable (docs) |
| #254 | #254 | None | Merged | Not applicable (docs) |
| #256 | #256 | None | Merged | Preserved |
| #257 | #257 | None | Merged | Intentional break (endpoint override removed) |
| #258 | #262 | #258 | Closed/merged | Preserved |
| #259 | #263 | #259 | Closed/merged | Preserved |
| #260 | #260 | None | Closed/merged | Preserved |
| #261 | #261 | None | Closed/merged | Preserved |
| #262 | #262 | None | Merged | Preserved |
| #263 | #263 | None | Merged | Preserved |
| #264 | #264 | None | Merged | Preserved |
| #265 | #265 | None | Merged | Preserved |
| #266 | #266 | None | Merged | Preserved |
| #267 | TBD | None | Open | Preserve |
| #268 | TBD | None | Open | Preserve |

## PR Chunk Plan (Execution Order)
1. PR-1: #267 focus-loss cancel behavior + tests + docs note.
2. PR-2: #268 stale error clearing behavior + tests + docs note.
3. PR-3: #252 transformation popup style-only alignment + tests/docs.
4. PR-4: #255 select-like style standardization + tests/docs.
5. Parallel gate for PR-3/PR-4: if shared style primitive/file overlap is greater than zero, run sequential (#252 then #255); otherwise run in parallel.
6. PR-5: #249 status reconciliation and closeout docs/admin update.
7. PR-6+: optional individual closeout docs/admin PRs per ticket for remaining merged items only when audit drift is found.

## Risks and Mitigations
- Risk: overlapping edits in shortcut editor from #267 and #268.
  - Mitigation: merge #267 first and rebase #268 before final test run.
- Risk: style-only tickets accidentally change behavior.
  - Mitigation: add explicit behavior regression assertions in renderer tests.
- Risk: ambiguous duplicate PR links in this range (#258/#262, #259/#263, #260/#264, #261/#265).
  - Mitigation: assign canonical closing PR plus historical follow-up PR tags and diff canonical merge-commit behavior against current `main` for each impacted area.
