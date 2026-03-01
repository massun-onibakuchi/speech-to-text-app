<!--
Where: docs/github-issues-247-278-280-work-plan.md
What: Priority-sorted, one-ticket-per-PR execution plan for issues #247, #278, and #280.
Why: Deliver small, feasible, risk-aware slices with strict completion gates before starting the next ticket.
-->

# GitHub Issues Work Plan (#247, #278, #280) - March 1, 2026

## Plan Rules
- One ticket equals one PR.
- Do not start the next ticket until the current ticket PR is merged to `main`.
- Do not create the next ticket branch or PR until the previous ticket PR is merged.
- Each ticket PR must include at least one test update and one docs update.
- If behavior/contract changes, add a decision record in `docs/decisions/`.

## Source of Truth
- Issue #247: API key field should be redacted after save.
- Issue #278: Clear stale keybind error before starting any new recording.
- Issue #280: Remove Record button and prevent title-click recording in Shortcuts.

## Priority Order
1. `P0` - #247 (security/privacy UX: avoid ambiguous empty state and prevent accidental key exposure patterns)
2. `P1` - #278 (interaction correctness: clear stale error state when starting new capture)
3. `P2` - #280 (UI trigger cleanup: remove explicit button and prevent unintended title-click trigger)

## Execution Chunks (Strictly Sequential)
1. Chunk A (#247):
   Entry: synced `main`, no open in-flight ticket branch/PR.
   Steps: implement #247 -> run tests/docs update -> open PR -> review/fix -> re-test -> merge.
   Exit: #247 PR merged, local `main` synced.
2. Chunk B (#278):
   Entry: #247 merged and `main` synced.
   Steps: implement #278 -> run tests/docs update -> open PR -> review/fix -> re-test -> merge.
   Exit: #278 PR merged, local `main` synced.
3. Chunk C (#280):
   Entry: #278 merged and `main` synced.
   Steps: implement #280 -> run tests/docs update -> open PR -> review/fix -> re-test -> merge.
   Exit: #280 PR merged, local `main` synced.

## PR Workflow Gate (Applies to Every Ticket)
1. Create branch from latest `main`.
2. Implement ticket-only scope.
3. Run targeted tests (unit/component under change) + shortcut/settings integration suite.
4. Update docs (and decision doc if behavior/contract changed).
5. Open PR referencing exactly one ticket.
6. Run sub-agent review and external coding-agent review; apply fixes.
7. Re-run tests after fixes.
8. Merge PR.
9. Sync local `main` before starting next ticket.

---

## Ticket Plan (Sorted by Priority)

### #247 - [P0] API key field should be redacted after save
- Goal:
  - Show a clear "saved key exists" redacted state after save/reload without exposing plaintext keys.
- Checklist:
  - [ ] Remove reveal behavior for persisted keys.
  - [ ] Persisted key shows redacted representation rather than ambiguous empty input.
  - [ ] Editing a saved key re-enters draft state; switching away without saving restores redacted display.
  - [ ] Plaintext draft is cleared after successful save.
  - [ ] Save/validation behavior remains unchanged.
  - [ ] Tests added/updated.
  - [ ] Docs updated.
- Tasks (step-by-step):
  1. Audit current key field state flow in renderer key settings components.
  2. Define rendering states: `not_set`, `dirty_draft`, `saved_redacted`.
  3. Implement post-save draft clearing and forced redacted display for saved keys.
  4. Remove or disable reveal toggle behavior for persisted secret values.
  5. Add regression test: switch provider/tab while a draft exists; confirm no plaintext leak and redacted state restores when unsaved draft is abandoned.
  6. Add/adjust component tests for redacted-after-save and reload behavior.
  7. Add docs update describing the key redaction rule.
- Gates:
  - Saved key is always shown redacted after save/reopen.
  - No path reveals persisted plaintext key.
  - Existing save flow and validation still pass.
  - Risk mitigation gate: provider-switch regression test confirms no stale draft/plaintext appears after switching tabs/providers.
  - Tests and docs are included in PR.
- Granularity:
  - Renderer API-key UI/state only.
- Feasibility:
  - High.
- Potential risk:
  - State bugs across provider switch could show stale draft content.
- Approach:
  - Keep persisted-key presence and input draft states separate; render based on explicit state machine. Redacted display uses a fixed-length masked placeholder (for example `••••••••••••`) in read-only/disabled presentation, never an empty field.

### #278 - [P1] Clear stale keybind error before starting any new recording
- Goal:
  - Ensure starting any keybind recording session resets previous error/conflict message immediately.
- Checklist:
  - [ ] On new recording start, old error state is cleared first.
  - [ ] Error only appears for current failed attempt.
  - [ ] No regressions in duplicate/conflict detection.
  - [ ] Tests added/updated.
  - [ ] Docs updated.
- Tasks (step-by-step):
  1. Trace keybind recording state lifecycle and error source ownership.
  2. Add a deterministic "clear error on start" transition at recording begin event.
  3. Verify Escape key, blur, and cancel-button paths do not restore stale error after session-start clear.
  4. Update shortcut editor tests for stale-error reset behavior.
  5. Update docs for keybind capture state transitions.
- Gates:
  - Beginning any recording clears previous error instantly.
  - Error reappears only when the current attempt fails.
  - Existing duplicate-shortcut validation continues to work.
  - Risk mitigation gate: test confirms current-session failure still surfaces error immediately after a failed capture.
  - Tests and docs are included in PR.
- Granularity:
  - Shortcut-capture state transition path only.
- Feasibility:
  - High.
- Potential risk:
  - Over-clearing could hide legitimate current-session errors.
- Approach:
  - Clear error only on explicit session-start action, not on every render/update.

### #280 - [P2] Remove Record button and prevent title-click recording
- Goal:
  - Limit recording start to the dedicated edit/pencil icon control, remove explicit `Record` button, and block title text from triggering capture.
- Checklist:
  - [ ] `Record` button removed from shortcuts UI.
  - [ ] Clicking shortcut title no longer starts recording.
  - [ ] Intended recording trigger still functions.
  - [ ] Tests added/updated.
  - [ ] Docs updated.
- Tasks (step-by-step):
  1. Confirm issue #280 accepted trigger path (dedicated edit/pencil icon), then identify handlers wired to title, `Record` button, and accepted trigger.
  2. Remove `Record` button rendering and related handlers.
  3. Ensure title text is non-interactive for recording start.
  4. Keep intended trigger accessible and keyboard-usable.
  5. Update tests for trigger boundaries.
  6. Update docs for revised shortcut recording interaction.
- Gates:
  - No `Record` button exists in Shortcuts tab.
  - Title click does not enter recording mode.
  - Intended trigger still enters recording mode.
  - Risk mitigation gate: keyboard and accessibility path for intended trigger remains functional in tests.
  - Tests and docs are included in PR.
- Granularity:
  - Shortcuts tab interaction surface only.
- Feasibility:
  - Medium-high. Handler removal is simple, but retaining keyboard/accessibility behavior for the accepted trigger requires explicit regression coverage.
- Potential risk:
  - Removing handlers may accidentally break accessibility/keyboard trigger path.
- Approach:
  - Retain a single explicit trigger control and lock tests to accepted trigger behavior.

## Branch and PR Mapping
1. Ticket #247: branch `ticket/247-api-key-redaction` -> PR `fix: #247 redact api key field after save`.
2. Ticket #278: branch `ticket/278-clear-stale-keybind-error` -> PR `fix: #278 clear stale keybind error on new recording`.
3. Ticket #280: branch `ticket/280-remove-record-button-title-trigger` -> PR `fix: #280 remove record button and title-click recording`.

## Stop Conditions / Escalation
- Pause and ask for clarification if issue scope conflicts with existing product behavior or tests.
- Pause if a ticket requires cross-ticket UI restructuring beyond listed scope.
