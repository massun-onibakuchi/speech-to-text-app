<!--
Where: docs/github-issues-220-229-work-plan.md
What: Prioritized execution plan for GitHub tickets #220-#229 with one-ticket-per-PR delivery.
Why: Provide granular, feasible, risk-aware implementation slices with explicit gates and sequencing.
-->

# GitHub Issues Work Plan (#220-#229) - Feb 28, 2026

## Execution Status (Closed Out)
- Closeout date: February 28, 2026.
- Result: all in-scope tickets from #220-#229 are completed and merged to `main`.
- Evidence:
  - #220 -> [PR #236](https://github.com/massun-onibakuchi/speech-to-text-app/pull/236)
  - #225 -> [PR #237](https://github.com/massun-onibakuchi/speech-to-text-app/pull/237)
  - #228 -> [PR #238](https://github.com/massun-onibakuchi/speech-to-text-app/pull/238)
  - #222 -> [PR #239](https://github.com/massun-onibakuchi/speech-to-text-app/pull/239)
  - #226 -> [PR #240](https://github.com/massun-onibakuchi/speech-to-text-app/pull/240)
  - #224 -> [PR #241](https://github.com/massun-onibakuchi/speech-to-text-app/pull/241)
  - #227 -> [PR #242](https://github.com/massun-onibakuchi/speech-to-text-app/pull/242)
  - #229 -> [PR #243](https://github.com/massun-onibakuchi/speech-to-text-app/pull/243)
  - #223 -> [PR #244](https://github.com/massun-onibakuchi/speech-to-text-app/pull/244)

## Plan Rules
- One ticket equals one PR.
- One PR references exactly one ticket.
- Every ticket includes goal, checklist, tasks, gates, granularity, feasibility, potential risk, and approach.
- Behavior/contract changes require a decision doc in `docs/decisions/` within the same PR.
- Each code ticket must add/update at least one test and update docs.
- Do not start dependent ticket PRs until predecessor PRs are merged to `main`.

## Scope Notes
- Reviewed range: #220 through #229 on Feb 28, 2026.
- #221 is already merged (PR), so it is out of execution scope for this plan.
- All in-scope tickets are now closed; this document remains as execution record and audit trail.

## Priority Model
- P0: User-facing correctness bugs in core flow (activity, keybind correctness, completion feedback/sound).
- P1: UX behavior changes with moderate regression risk (recording lifecycle, settings persistence behavior).
- P2: UI/docs polish and low-risk cleanup.

## Environment Matrix
- Keyboard-sensitive tickets (#225, #222): validate on macOS and one non-mac path (Linux/Windows mapping).

## Ticket Index (Sorted by Priority)

| Priority | Ticket | Issue | Type | Hard Depends On | Soft Sequence | Final Status |
|---|---|---|---|---|---|---|
| P0 | Activity feed terminal-only transform entries | #220 | Bug/Behavior Contract | None | None | Merged (PR #236) |
| P0 | Option-modified keybind base-key rendering | #225 | Bug | None | before #222 | Merged (PR #237) |
| P0 | Completion sound parity across output modes | #228 | Bug | Verify #220 event-source impact | after #220 if event-source changed | Merged (PR #238) |
| P1 | Keybind recording cancel on focus loss/click outside | #222 | UX Behavior | None | after #225 | Merged (PR #239) |
| P1 | Settings auto-save for non-API-key fields | #224 | UX + Persistence Behavior | None | after #226 | Merged (PR #241) |
| P1 | API key save validates connection automatically | #226 | UX + Validation Contract | None | before #224 | Merged (PR #240) |
| P2 | Remove reset-to-default controls for URL overrides | #227 | UI Cleanup | None | after #224/#226 | Merged (PR #242) |
| P2 | Activity copy success confirmation state | #229 | UI Enhancement | None | after #220 | Merged (PR #243) |
| P2 | Remove Shortcut Contract tables from docs/spec | #223 | Docs Cleanup | None | after #222/#225 | Merged (PR #244) |

## Chunked Execution Order
1. Chunk A (core correctness): #220, #225, #228.
2. Chunk B (input/settings behavior): #222, #226, #224.
3. Chunk C (polish/docs): #227, #229, #223.
- Chunk A tickets can run in parallel across separate branches unless #228 depends on event-source changes from #220.
- Actual completion sequence on Feb 28, 2026 followed the planned dependency order and is fully merged.

---

## P0 Tickets

### #220 - [P0] Activity feed terminal-only transform entries
- Goal:
  - Ensure transform actions append exactly one terminal activity item (success or failure), with no enqueue/processing entries.
- Checklist:
  - [ ] Non-goals locked: no toast text/order changes and no non-transform activity behavior changes.
  - [ ] Remove non-terminal transform activity emissions/projections.
  - [ ] Ensure success terminal entry includes final transformed text.
  - [ ] Ensure failure terminal entry includes actionable error messaging.
  - [ ] Add tests for success/failure and assertion that no non-terminal item is appended.
  - [ ] Update docs describing activity-feed transform contract.
- Tasks (Step-by-step):
  1. Trace transform event producers and activity projection path in renderer/main.
  2. Map all emitted transform activity event types (terminal vs non-terminal) before filtering.
  3. Filter/stop non-terminal transform entries at source or projection boundary.
  4. Normalize terminal payload shape so copy/result rendering remains stable.
  5. Add unit tests for success/failure/no-enqueue and re-entrant retry paths.
  6. Run targeted test suite and document behavior contract in docs.
- Gates:
  - Triggering transform never adds `Transformation enqueued` (or equivalent) to visible activity.
  - Exactly one terminal activity item appears per transform request.
  - Retries/re-entrant calls do not create duplicate terminal entries for the same request id.
  - Existing toast behavior remains unchanged unless explicitly documented.
  - Tests and docs are updated in the PR.
- Files expected to change:
  - 3 to 6 files in activity projection/event mapping and tests.
- Test cases to add:
  - `transform success emits only terminal success item`
  - `transform failure emits only terminal failure item`
  - `transform enqueue never appears in activity feed`
  - `retry/re-entrant transform does not duplicate final item`
- Granularity:
  - Activity pipeline and related tests only; no broader activity UI redesign.
- Feasibility:
  - Medium: localized, but touches event-to-view contract.
- Potential Risk:
  - Hiding needed operational events globally instead of only transform non-terminal entries.
- Approach:
  - Restrict change to transform-specific activity mapping, preserve non-transform event behavior.

### #225 - [P0] Option-modified keybind base-key rendering
- Goal:
  - Record/display Option-modified shortcuts as semantic keybind labels (`Opt+P`), not produced characters (`Opt+π`).
- Checklist:
  - [ ] Non-goals locked: no shortcut schema redesign and no shortcut-tab IA changes.
  - [ ] Normalize base key label extraction for Option-modified input.
  - [ ] Preserve existing rendering for non-Option shortcuts.
  - [ ] Ensure Option+letter bindings can be persisted.
  - [ ] Add tests for Option-letter examples and regressions.
- Tasks (Step-by-step):
  1. Audit key event parsing path used by recorder.
  2. Introduce base-key normalization before label rendering.
  3. Validate serialization/persistence path receives normalized key names.
  4. Add tests for `Opt+P` and non-Option parity cases.
- Gates:
  - Recording Option+letter displays `Opt+<Letter>` consistently.
  - No symbol-substitution labels appear in shortcut UI.
  - Save flow accepts normalized Option shortcuts.
  - Existing stored shortcuts still load and render correctly after this change.
- Files expected to change:
  - 2 to 5 files in keybind capture/formatting and tests.
- Test cases to add:
  - `option+letter renders semantic key label`
  - `non-option shortcuts remain unchanged`
  - `stored legacy shortcut values still parse/render`
- Granularity:
  - Keybind recorder parsing/rendering path only.
- Feasibility:
  - Medium: bounded logic, but keyboard-layout variance must be verified.
- Potential Risk:
  - Platform-specific keyboard layout variance (macOS Option behavior).
- Approach:
  - Normalize from hardware/key code semantics, not text-input character output.

### #228 - [P0] Completion sound parity across output modes
- Goal:
  - Play the same completion audio exactly once after successful finish for both raw dictation and transformed-text output paths.
- Checklist:
  - [ ] Non-goals locked: no sound asset replacement and no failure/cancel sound behavior changes.
  - [ ] Identify divergent sound trigger paths by output mode.
  - [ ] Route both modes through one completion-sound trigger policy.
  - [ ] Ensure no duplicate playback on a single completion event.
  - [ ] Add tests covering both output modes and single-fire behavior.
- Tasks (Step-by-step):
  1. Trace completion event handling for raw and transformed paths.
  2. Consolidate to a shared completion-sound dispatcher.
  3. Add idempotency guard against duplicate event handling.
  4. Add tests for both output modes and duplicate prevention.
- Gates:
  - Sound plays once on successful completion in both modes.
  - Same configured file is used for both paths.
  - No duplicate playback regressions.
  - No completion sound on failure or cancel paths.
- Files expected to change:
  - 2 to 5 files in completion-event sound dispatch and tests.
- Test cases to add:
  - `raw dictation success plays sound once`
  - `transformed text success plays sound once`
  - `failure/cancel paths do not play completion sound`
  - `duplicate completion event id is ignored`
- Granularity:
  - Completion event-to-sound wiring only; no sound asset changes.
- Feasibility:
  - Medium-high: small surface, regression-prone if listeners are duplicated.
- Potential Risk:
  - De-dup logic accidentally suppresses valid future events.
- Approach:
  - Assign a unique completion event id at source and deduplicate with a seen-id set; avoid time-window dedupe.

---

## P1 Tickets

### #222 - [P1] Keybind recording cancel on focus loss/click outside
- Goal:
  - Cancel recording immediately when input loses focus, user clicks outside, or app/window focus changes.
- Checklist:
  - [ ] Non-goals locked: no shortcut persistence format changes.
  - [ ] Start recording only while intended keybind input is active.
  - [ ] Cancel recording on outside click.
  - [ ] Cancel recording on window/app focus loss.
  - [ ] Ensure UI state returns to non-recording state.
  - [ ] Add tests for blur/outside-click/focus-loss cancellation.
- Tasks (Step-by-step):
  1. Identify recording-state owner and active-input lifecycle hooks.
  2. Add explicit cancel handlers for blur and outside-click boundaries.
  3. Hook window/app focus-loss events to same cancel path.
  4. Add tests for each cancellation trigger and UI reset.
- Gates:
  - Recording cannot continue after focus/context is lost.
  - UI always exits recording mode on cancellation.
  - Clicking inside recorder popovers/controls does not cause false cancellation.
- Files expected to change:
  - 3 to 6 files in keybind recording lifecycle/state and tests.
- Test cases to add:
  - `blur cancels recording and resets UI`
  - `outside click cancels recording`
  - `inside popover click does not cancel`
  - `window focus loss cancels recording`
- Granularity:
  - Keybind recording lifecycle only.
- Feasibility:
  - Medium: event handling across DOM/window boundaries.
- Potential Risk:
  - False-positive cancellation while interacting within recorder controls.
- Approach:
  - Use one shared cancel function and containment via `event.composedPath()` to handle portals/overlays safely.

### #224 - [P1] Settings auto-save for non-API-key fields
- Goal:
  - Persist non-API-key settings automatically on change and remove explicit save controls for those fields.
- Checklist:
  - [ ] Non-goals locked: API key flow is out of scope.
  - [ ] Field-scope matrix is confirmed before coding (`docs/settings-field-save-matrix.md`).
  - [ ] Auto-save on change for in-scope fields.
  - [ ] Remove save button dependency for in-scope settings.
  - [ ] Preserve validation/error behavior.
  - [ ] Add tests for immediate persistence and validation failures.
- Tasks (Step-by-step):
  1. Create `docs/settings-field-save-matrix.md` with field ownership (auto-save vs manual-save) and validation expectations.
  2. Route non-API-key change handlers to immediate save flow.
  3. Remove/disable non-API save buttons and Enter-to-save coupling.
  4. Add tests for persistence, validation failure, and UI messaging.
- Gates:
  - Non-API-key settings persist without Enter or explicit save click.
  - No non-API save button remains visible.
  - Validation failures still surface without persisting invalid values.
  - Under rapid edits, last-write-wins and invalid values never overwrite last valid persisted value.
- Files expected to change:
  - 4 to 8 files in settings form handling, persistence wiring, and tests.
- Test cases to add:
  - `non-api field autosaves on change`
  - `invalid non-api value does not persist`
  - `rapid edits obey last-write-wins`
  - `non-api save button not rendered`
- Granularity:
  - Settings persistence UX only; no provider contract/schema redesign.
- Feasibility:
  - Medium: broad settings surface, but repetitive patterns.
- Potential Risk:
  - Increased save frequency causing race conditions or noisy error states.
- Approach:
  - Keep API key path isolated and default to debounced auto-save (>=300ms) for non-API fields, documented in field matrix.

### #226 - [P1] API key save validates connection automatically
- Goal:
  - Remove Test Connection button and validate API key during save; persist only on successful validation.
- Checklist:
  - [ ] Non-goals locked: no provider/model schema changes.
  - [ ] Preconditions confirmed: current API-key persistence path and write location identified.
  - [ ] Remove Test Connection UI control.
  - [ ] Trigger connection validation inside save action.
  - [ ] Prevent persistence on failed validation.
  - [ ] Show actionable validation failure feedback.
  - [ ] Add tests for save-success/save-failure persistence behavior.
- Tasks (Step-by-step):
  1. Locate current API key save + test action wiring.
  2. Move validation call into save pipeline.
  3. Update UI state/actions to single save path.
  4. Add tests for successful validation persistence and failed validation rejection.
- Gates:
  - No standalone Test Connection button exists.
  - Save action performs validation before persistence.
  - Invalid keys are not persisted.
  - Validation timeout is handled distinctly (target: 10s timeout -> explicit timeout error).
  - Failed validation does not persist key to store, cache, or logs.
- Files expected to change:
  - 3 to 6 files in API-key save flow, validation hook, and tests.
- Test cases to add:
  - `save success validates then persists`
  - `save failure does not persist`
  - `validation timeout returns explicit timeout error`
  - `error/log surfaces redact key material`
- Granularity:
  - API key setting flow only.
- Feasibility:
  - Medium-high: focused path.
- Potential Risk:
  - Slower save UX if validation is long-running or flaky.
- Approach:
  - Keep explicit pending/error states and enforce fixed 10s validation timeout; timeout is treated as non-persisting validation failure.

---

## P2 Tickets

### #227 - [P2] Remove reset-to-default controls for URL overrides
- Goal:
  - Remove reset actions for STT/LLM URL defaults from settings UI.
- Checklist:
  - [ ] Non-goals locked: no URL schema/default-value contract changes.
  - [ ] Remove reset controls for both URL fields.
  - [ ] Ensure manual editing/saving paths still work.
  - [ ] Update tests/selectors for removed controls.
- Tasks (Step-by-step):
  1. Remove reset button handlers and render branches.
  2. Clean dead code paths tied only to reset actions.
  3. Update tests and docs/snapshots.
- Gates:
  - No reset controls are rendered for STT/LLM URL fields.
  - URL edit/save remains functional.
- Files expected to change:
  - 2 to 4 files in settings UI and tests.
- Test cases to add:
  - `stt/llm reset controls not rendered`
  - `manual url edit/save still works`
- Granularity:
  - UI control removal only.
- Feasibility:
  - High: straightforward deletion.
- Potential Risk:
  - Hidden dependency on reset handlers for default-value hints.
- Approach:
  - Remove controls first, then clean handlers only if no other call sites remain.

### #229 - [P2] Activity copy success confirmation state
- Goal:
  - Show visible, temporary confirmation (e.g., checkmark) after successful copy in Activity tab.
- Checklist:
  - [ ] Non-goals locked: no clipboard API replacement and no activity-item data contract changes.
  - [ ] Add success-only visual confirmation state for copy action.
  - [ ] Reset confirmation state after short interval.
  - [ ] Keep failure path without false success indication.
  - [ ] Add tests for success feedback and timed reset.
- Tasks (Step-by-step):
  1. Add per-item copy-success UI state.
  2. Trigger state only on resolved clipboard success.
  3. Implement timed reset to default copy icon.
  4. Add tests for success/timeout/failure behavior.
- Gates:
  - Successful copy shows immediate visual confirmation.
  - Confirmation auto-resets reliably.
  - Failed copy does not show success state.
  - Timer cleanup prevents state updates after unmount or list refresh.
- Files expected to change:
  - 2 to 5 files in activity item UI state and tests.
- Test cases to add:
  - `copy success shows check then resets`
  - `copy failure never shows check`
  - `rapid recopy preserves latest timer`
  - `unmount/list refresh clears timeout safely`
- Granularity:
  - Activity copy interaction only.
- Feasibility:
  - High: local UI state.
- Potential Risk:
  - Timer cleanup bugs when activity list re-renders/unmounts.
- Approach:
  - Use key-scoped transient state and clear timeouts in lifecycle cleanup before unmount/re-render.

### #223 - [P2] Remove Shortcut Contract tables from docs/spec
- Goal:
  - Remove Shortcut Contract tables while keeping shortcut guidance clear and consistent.
- Checklist:
  - [ ] Non-goals locked: no shortcut behavior/runtime changes.
  - [ ] Locate all Shortcut Contract table occurrences in docs/spec.
  - [ ] Remove tables and replace with concise narrative guidance where needed.
  - [ ] Reconcile terminology with current shortcuts behavior.
  - [ ] Run grep audit and include evidence in PR.
- Tasks (Step-by-step):
  1. Search `docs/` and `specs/` for shortcut contract table sections.
  2. Remove table blocks and rewrite minimal replacement text (max 5 lines per removed table).
  3. Re-run audit for stale references.
  4. Update docs plan/changelog if present.
- Gates:
  - No Shortcut Contract tables remain.
  - Remaining shortcut docs are coherent and non-contradictory.
  - Removed sections are verified against current implementation before deletion.
  - PR description includes grep pattern list and zero-hit evidence for stale table references.
- Files expected to change:
  - 2 to 6 files in `docs/` and `specs/`.
- Test cases to add:
  - N/A (docs-only ticket). Required evidence: grep audit command output attached to PR.
- Granularity:
  - Documentation only.
- Feasibility:
  - High: low implementation risk.
- Potential Risk:
  - Loss of useful structure reducing clarity.
- Approach:
  - Replace removed tables with compact bullet guidance only where readability drops.

---

## Definition of Done (Per Ticket PR)
- [ ] PR links exactly one issue in this plan.
- [ ] Ticket goal/checklist/tasks/gates are copied into PR description.
- [ ] At least one test is added/updated for code tickets.
- [ ] Docs are updated to match delivered behavior.
- [ ] Targeted lint/typecheck and ticket-specific test commands are recorded in PR notes.
- [ ] Manual QA checklist for affected user flow is completed.
- [ ] If contract/persistence format changes, migration/backward-compat test coverage is included.
- [ ] Rollback check is documented in PR notes (`git revert` path + any required data cleanup notes).
- [ ] Required CI checks are green before merge.
