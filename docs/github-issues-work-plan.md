<!--
Where: docs/github-issues-work-plan.md
What: Execution plan for currently open GitHub issues (#194-#203), with #186 deferred.
Why: Provide one-ticket-per-PR delivery with explicit goal/checklist/gates and risk-aware priority.
-->

# GitHub Issues Work Plan (Feb 28, 2026)

## Plan Rules
- One ticket equals one PR.
- One PR must map to exactly one GitHub issue.
- Every ticket includes: goal, checklist, tasks, gates, granularity, risk, feasibility.
- Behavior/schema changes require a decision doc under `docs/decisions/` in the same PR.
- Every ticket updates tests and docs for user-visible or contract changes.
- Keep rollback steps in each PR description.

## Source of Truth
- Open issues reviewed on Feb 28, 2026:
  - #194, #195, #196, #197, #198, #199, #200, #201, #202, #203
- Deferred by request:
  - #186 E2E fake-audio diagnostics and CI policy hardening

## Priority Model
- P0: Correctness/data-contract bugs and core workflow behavior.
- P1: Delivery-critical UX/IA changes.
- P2: Feature polish and workflow improvements.
- P3: Nice-to-have low-risk cleanup.

## Dependency Map
- Hard dependencies:
  - #197 depends on #196.
  - #203 depends on #200.
  - #202 depends on #200 and #203.
- Soft sequencing:
  - #195 after #198.
  - #194 after #197.

## Decision Checkpoints (Before Coding)
- D-201 (for #201): choose Option A vs B for activity result-card contract.
  - Recommended: Option A (single final output item per capture path).
- D-198 (for #198): define transformed-source failure fallback.
  - Recommended: fallback to transcript output with explicit failure metadata.

## Ticket Index

| Priority | Ticket | Issue | Type | Hard Depends On | Soft Sequence |
|---|---|---|---|---|---|
| P0 | Activity terminal-results contract and capped feed | #201 | Bug + Behavior Contract | None | None |
| P0 | Derive transform auto-run from selected output source | #198 | Bug + Logic Contract | None | after D-198 |
| P0 | Provider-local endpoint override schema | #196 | Bug + Data Contract | None | None |
| P1 | Generic provider form in Settings | #197 | UX + Refactor | #196 | None |
| P1 | Remove transformation profile editor from Settings | #195 | IA/UX | None | after #198 |
| P1 | Add dedicated Shortcuts tab and move editor | #200 | Navigation/IA | None | None |
| P2 | Remove start/stop recording shortcuts | #203 | UX + Settings Contract | #200 | before #202 |
| P2 | Better keybind capture UX and validation | #202 | Enhancement | #200, #203 | None |
| P2 | Remove restore/batch-save controls and obsolete helper text | #194 | UI Cleanup | None | after #197 |
| P3 | Remove idle-state Settings button under recording CTA | #199 | UI Cleanup | None | None |

---

## P0 Tickets

### #201 - [P0] Activity terminal-results contract and capped feed
- Type: Bug + Behavior Contract
- Goal: Align activity feed with terminal-result-only behavior, cap list to 10 items, and retain copyable result text.
- Granularity:
- Renderer activity-store/event filtering and result-card payload contract only.
- No styling redesign beyond what is necessary to represent new data contract.
- Checklist:
- [ ] Add decision doc D-201 and lock Option A vs B before coding.
- [ ] Enforce max 10 activity items.
- [ ] Ensure recording cancel does not emit a `processing` activity item.
- [ ] Remove non-terminal operational events (start/stop/cancel) from visible feed.
- [ ] Persist copyable output text for successful terminal entries per chosen option.
- [ ] Add tests for cap, filtering, cancel behavior, and copy payload contract.
- [ ] Update docs for activity behavior contract.
- Tasks:
1. Audit current event producer/consumer flow (`renderer-app`, `ipc-listeners`, activity feed state).
2. Add/adjust event normalization layer for terminal-only filtering.
3. Implement cap policy (drop oldest beyond 10).
4. Implement copy-text persistence model for success cards.
5. Add deterministic tests for all acceptance paths.
- Gates:
- Feed contains only terminal outcomes (success/failure) for STT/transformation.
- Cancel path never creates processing card.
- Feed caps at 10 deterministically.
- Decision doc + tests + docs are merged.
- Risk:
- Trigger: history or operational log events disappear unexpectedly after filter changes.
- Detection: renderer unit tests for log/feed separation fail; manual smoke shows missing terminal cards.
- Mitigation: isolate filtering to feed projection layer and keep source events unchanged.
- Rollback validation: revert PR and confirm prior event-list behavior in activity tests.
- Feasibility:
- Medium: cross-file but localized to activity data flow.

### #198 - [P0] Derive transform auto-run from selected output source
- Type: Bug + Logic Contract
- Goal: Remove `autoRunDefaultTransform` toggle and make transformation run deterministic from `output.selectedTextSource`.
- Granularity:
- Settings contract + orchestration decision logic only.
- No unrelated Settings IA cleanup in this PR.
- Checklist:
- [x] Add decision doc D-198 for derived-run contract and fallback behavior.
- [x] Remove auto-run toggle from UI.
- [x] Remove/deprecate `autoRunDefaultTransform` in settings schema.
- [x] Add migration handling for persisted settings (deprecated key stripping; no backward-compat intent remap by product decision).
- [x] Update capture/orchestration logic to derived behavior.
- [x] Add tests for transcript-source mode and transformed-source mode.
- [x] Update docs/help text.
- Tasks:
1. Define exact runtime rule and fallback semantics in decision doc.
2. Update shared domain types and defaults/migrations.
3. Update orchestrator logic and guard rails.
4. Remove UI controls/help text and adjust tests.
- Gates:
- No auto-run toggle visible in Settings.
- Runtime behavior is fully derived from selected output source.
- Migration is backward-compatible for existing settings files.
- Unit tests cover both source modes and transform failure path.
- Risk:
- Trigger: transformed-source runs skip/overrun unexpectedly in capture pipeline.
- Detection: orchestrator mode-matrix tests fail; manual run shows wrong output.
- Mitigation: add exhaustive mode matrix tests before downstream UI cleanup merges.
- Rollback validation: revert PR and verify legacy auto-run behavior returns with existing tests.
- Feasibility:
- Medium: clear rule, but contract migration and orchestration must stay aligned.

### #196 - [P0] Provider-local endpoint override schema
- Type: Bug + Data Contract
- Goal: Remove global endpoint overrides and standardize optional `baseURLOverride` per provider config.
- Granularity:
- Domain schema, migration, and endpoint resolution only.
- Out of Scope:
- Renderer provider-form layout refactor and field relocation (handled in #197).
- Checklist:
- [ ] Add decision doc for settings-contract shape migration.
- [ ] Remove global STT/LLM base URL override fields from schema/defaults.
- [ ] Add provider-scoped `baseURLOverride` in schema/types.
- [ ] Add migration for persisted settings.
- [ ] Update endpoint resolver to provider-local lookup.
- [ ] Add tests for migration and resolution behavior.
- [ ] Update docs where endpoint override is documented.
- Tasks:
1. Inventory all reads/writes of old global override keys.
2. Introduce provider-local schema and migration.
3. Update resolver and callers.
4. Add regression tests for old-to-new settings files.
- Gates:
- No global override schema fields remain active.
- Provider-local override resolves correctly per selected provider.
- Existing settings load safely after migration.
- Decision doc and tests merged.
- Risk:
- Trigger: existing settings fail validation/load post-migration.
- Detection: migration tests with legacy fixtures fail; startup shows settings recovery warnings.
- Mitigation: one-way migration with explicit defaults and strict fixture coverage.
- Rollback validation: revert PR and load legacy settings fixture successfully.
- Feasibility:
- Medium: bounded contract change with good testability.

---

## P1 Tickets

### #197 - [P1] Generic provider form with provider-scoped model list
- Type: UX + Refactor
- Depends On: #196
- Goal: Replace separate provider sections with one provider form (`provider`, `model`, `apiKey`, optional `baseURLOverride`) with valid model allowlist per provider.
- Granularity:
- Settings provider UI composition and provider/model selection behavior only.
- Checklist:
- [ ] Render single provider form structure.
- [ ] Restrict model options by selected provider.
- [ ] Keep save/test behavior provider-targeted.
- [ ] Ensure baseURLOverride field follows selected provider.
- [ ] Add tests for provider-switch model list and save/test targeting.
- [ ] Update docs/screenshots for Settings provider section.
- Tasks:
1. Implement provider selector + derived model list.
2. Wire apiKey/baseURL fields to selected provider.
3. Ensure test/save callbacks dispatch to selected provider only.
4. Update renderer tests.
- Gates:
- No duplicated per-provider form sections remain.
- Model allowlists are valid and provider-scoped.
- Provider switching does not leak stale model selections.
- Tests and docs updated.
- Risk:
- Trigger: provider switches preserve invalid model/api/baseURL state.
- Detection: provider-switch tests fail or model dropdown shows cross-provider values.
- Mitigation: reset derived fields on provider change with explicit allowlist validation.
- Rollback validation: revert PR and validate legacy per-provider sections still function.
- Feasibility:
- High-medium: mostly renderer changes post-#196.

### #195 - [P1] Remove transformation profile editor from Settings
- Type: IA/UX
- Soft Sequence: after #198
- Goal: Make Profiles tab the single source for profile editing by removing transformation profile controls from Settings.
- Granularity:
- Settings IA cleanup only; no profile feature changes.
- Checklist:
- [ ] Remove default/select/add/remove/run/profile-edit controls from Settings.
- [ ] Keep profile edit/create/delete fully available in Profiles tab.
- [ ] Retire or isolate unused Settings transformation component wiring.
- [ ] Update tests to reflect new Settings IA.
- [ ] Update docs/spec references.
- Tasks:
1. Remove transformation section from Settings render tree.
2. Delete or de-wire now-unused component paths.
3. Update renderer/e2e tests referencing removed controls.
4. Refresh docs for Settings/Profiles responsibilities.
- Gates:
- Settings contains no profile configuration controls.
- Profiles tab remains fully functional for profile management.
- Tests and docs updated.
- Risk:
- Trigger: hidden references to removed controls break save/render flows.
- Detection: settings/app-shell/e2e selector tests fail after section removal.
- Mitigation: remove control paths incrementally and run focused selector grep + test sweep.
- Rollback validation: revert PR and confirm removed selectors/components reappear in Settings tests.
- Feasibility:
- High: mostly removal and rewiring.

### #200 - [P1] Add dedicated Shortcuts tab and move editor
- Type: Navigation/IA
- Goal: Introduce first-class `Shortcuts` tab and move shortcut editor/contract UI from Settings to that tab.
- Granularity:
- Tab rail + shortcuts surface relocation only.
- No shortcut semantics changes in this PR.
- Checklist:
- [x] Add `Shortcuts` tab in shell tab rail.
- [x] Move shortcut editor and contract display into Shortcuts tab.
- [x] Remove shortcut editor section from Settings.
- [x] Keep existing validation/save semantics unchanged.
- [x] Update app-shell and e2e tests for new navigation.
- [x] Update docs and screenshots.
- Tasks:
1. Add new route/tab panel and mount shortcut components there.
2. Remove duplicate settings placement.
3. Update navigation and keyboard-focus tests.
4. Update e2e selectors for shortcuts location.
- Gates:
- Tab rail shows `Shortcuts` and editor functions in new tab.
- Settings no longer contains shortcut editor.
- Existing save/validation behavior is unchanged.
- Tests/docs updated.
- Risk:
- Trigger: tab relocation breaks keyboard navigation or save wiring.
- Detection: app-shell navigation tests and shortcuts e2e assertions fail.
- Mitigation: preserve existing shortcut component interfaces and relocate mount points only.
- Rollback validation: revert PR and confirm shortcut editor renders in Settings again.
- Feasibility:
- High: structural relocation.

---

## P2 Tickets

### #203 - [P2] Remove start/stop recording shortcuts
- Type: UX + Settings Contract
- Depends On: #200
- Goal: Simplify shortcut set by removing `startRecording` and `stopRecording` entries from UI, defaults, validation, and persistence.
- Granularity:
- Shortcut schema/defaults/validation/UI for removed actions only.
- Checklist:
- [x] Remove start/stop fields from shortcut editor UI.
- [x] Remove defaults and validation rules for start/stop shortcuts.
- [x] Ensure persistence read/write no longer requires start/stop keys.
- [x] Add migration/backfill for existing settings files.
- [x] Update tests/docs for new shortcut set.
- Tasks:
1. Update domain model and defaults.
2. Add migration for legacy settings containing start/stop keys.
3. Update shortcut editor and validation.
4. Update hotkey registration logic if needed.
- Gates:
- Start/stop shortcuts are absent from UI and contracts.
- Toggle/cancel/transform shortcuts remain functional.
- Legacy settings load safely.
- Tests/docs updated.
- Risk:
- Trigger: startup hotkey registration fails due to removed start/stop keys.
- Detection: hotkey service tests or startup logs report missing binding keys.
- Mitigation: make registration iterate over explicit remaining keys only.
- Rollback validation: revert PR and verify start/stop bindings load and register again.
- Feasibility:
- High-medium: contract cleanup with migration.

### #202 - [P2] Better keybind capture UX
- Type: Enhancement
- Depends On: #200, #203
- Goal: Introduce recording-mode key capture with modifier requirement, duplicate prevention, and explicit cancel.
- Granularity:
- Shortcut input interaction and validation only.
- Checklist:
- [x] Clicking shortcut field enters recording mode.
- [x] Capture next key combination including modifiers.
- [x] Require at least one modifier.
- [x] Prevent duplicate bindings across shortcut actions.
- [x] Add explicit cancel action and visual recording-state hint.
- [x] Add tests for capture, duplicate rejection, modifier enforcement, cancel flow.
- [x] Update docs for new keybind entry interaction.
- Tasks:
1. Implement controlled capture state in shortcut editor.
2. Normalize captured combos consistently with existing parser.
3. Wire duplicate/modifier validation into form errors.
4. Add cancellation UX and no-commit behavior.
- Gates:
- Recording mode is explicit and cancelable.
- Invalid and duplicate bindings are blocked.
- Tests cover full capture flow and validation paths.
- Risk:
- Trigger: capture mode traps focus or records invalid key combos on some platforms.
- Detection: shortcut editor interaction tests fail across modifier/duplicate scenarios.
- Mitigation: centralize key normalization and add per-platform key event fixtures.
- Rollback validation: revert PR and confirm previous manual key-entry behavior returns.
- Feasibility:
- Medium: custom input behavior with validation complexity.

### #194 - [P2] Remove restore/batch-save controls and obsolete helper text
- Type: UI Cleanup
- Soft Sequence: after #197
- Goal: Remove deprecated Settings controls/copy (`Restore Defaults`, `Save API Keys`, obsolete helper text) while keeping per-provider save/test flows.
- Granularity:
- Settings copy/control removal only.
- Checklist:
- [x] Remove `Restore Defaults` from Output settings.
- [x] Remove `Save API Keys` batch-save button and submit flow.
- [x] Remove obsolete helper texts listed in issue.
- [x] Keep per-provider save/test behavior intact.
- [x] Update renderer/e2e tests and docs.
- Tasks:
1. Remove obsolete controls and dead handlers.
2. Ensure no references remain in save message logic.
3. Update tests and docs text assertions.
- Gates:
- Removed controls/text are absent from UI and tests.
- Provider-level save/test still works.
- No dead code paths for removed batch-save flow remain.
- Risk:
- Trigger: removed batch-save controls leave dead submit handlers invoked elsewhere.
- Detection: settings API-key tests fail or console errors appear on save interactions.
- Mitigation: delete unused handlers and enforce type-level dead-code cleanup.
- Rollback validation: revert PR and verify removed controls/handlers return without runtime errors.
- Feasibility:
- High: focused UI cleanup.

---

## P3 Tickets

### #199 - [P3] Remove idle-state Settings button from Home
- Type: UI Cleanup
- Goal: Remove Settings button under `Click to record` in idle state, while keeping blocked-state guidance links.
- Granularity:
- Home idle-state CTA area only.
- Checklist:
- [x] Remove idle Settings button from Home panel.
- [x] Keep blocked-state open-settings affordance when prerequisites are missing.
- [x] Update home component tests.
- [x] Update docs if this button is referenced.
- Tasks:
1. Remove idle button rendering branch.
2. Verify blocked-state messages/actions unchanged.
3. Update tests.
- Gates:
- Idle Settings button is gone.
- Blocked-state guidance still opens Settings.
- Tests/docs updated.
- Risk:
- Trigger: removing idle button also removes blocked-state settings affordance by mistake.
- Detection: home component tests for blocked-state action fail.
- Mitigation: keep blocked-state action branch unchanged and cover with explicit test.
- Rollback validation: revert PR and confirm idle Settings button appears again.
- Feasibility:
- High.

## Execution Order (Recommended)
1. #201
2. #198
3. #196
4. #197
5. #195
6. #200
7. #203
8. #202
9. #194
10. #199

## Deferred
- #186 E2E fake-audio diagnostics and CI policy hardening (deferred by request).

## Definition of Done (Per Ticket PR)
- [ ] PR references exactly one issue and only one ticket in this plan.
- [ ] Ticket goal/checklist/gates are satisfied and quoted in PR description.
- [ ] At least one test is added/updated and passing.
- [ ] Relevant docs are updated.
- [ ] Rollback procedure and post-revert validation are included in PR.
