<!--
Where: docs/github-issues-work-plan.md
What: Priority work plan for open GitHub issues with one-ticket-per-PR, fix-first ordering.
Why: Provide a detailed, reviewable execution plan with checklists and gates.
-->

# GitHub Issues Work Plan (Feb 25, 2026)

## Plan Rules
- One ticket equals one PR.
- Fixes and regressions take priority over new features and copy tweaks.
- Each ticket must include a checklist and a gate.
- Any behavior or API assumption must be verified against current code/docs before implementation.
- Each ticket adds at least one test and updates docs if user-facing behavior changes.
- Decision/architecture changes require a decision doc in `docs/decisions/`.
- Decision-dependent tickets are blocked until the decision doc is merged.
- OS-permission or focus-dependent tests must define a CI strategy (mock, skip, or dedicated runner).
- Provider-level behavior changes require verification per wired provider, not just the primary one.

## Source of Truth
- Issue list captured from GitHub on Feb 25, 2026.

## Priority Summary
- P0: Broken core workflows or incorrect outputs.
- P1: Guardrails and validation that prevent user error and unclear states.
- P2: Deterministic test coverage and workflow polish.
- P3: UI copy/terminology cleanup and low-risk UX improvements.

## Dependencies
- #130 is blocked on the decision doc from #127 (active vs default semantics).
- #128 decision doc must be merged before any toggle behavior changes.

## Ticket Index

| Priority | Ticket | Issue | Type | Status |
|---|---|---|---|---|
| P0 | Fix macOS paste-at-cursor failure | #121 | Fix | PR OPEN |
| P0 | Preserve spoken language in STT | #120 | Fix | TODO |
| P1 | Show message when stop/cancel pressed while idle | #124 | Fix | PR OPEN |
| P1 | Validate Transformation Profile prompts before saving | #122 | Fix | DONE |
| P2 | Add Playwright e2e recording test with fake audio | #95 | Test | TODO |
| P2 | Improve “change default config” behavior for 2 vs 3+ profiles | #130 | UX Change | TODO |
| P3 | Per-provider Save buttons for API keys | #125 | UX Change | TODO |
| P3 | Simplify Home transformation shortcut copy/status | #126 | UX Change | TODO |
| P3 | Remove IPC pong display from UI | #123 | UX Change | TODO |
| P3 | Rename “config” to “profile” in Transformation settings UI | #129 | UX Change | TODO |
| P3 | Clarify “Active config” vs “default” in Transformation settings | #127 | Decision + UX Change | TODO |
| P3 | Clarify “Enable transformation” toggle vs auto-run default | #128 | Decision + UX Change | TODO |

---

## P0 Tickets

### #121 - [P0] Paste at cursor fails silently on macOS
- Type: Fix
- Goal: Restore paste-at-cursor on macOS and show actionable error when paste fails.
- Granularity: Paste-at-cursor path only (no unrelated output behavior changes).
- Checklist:
- [x] Reproduce on macOS and capture exact steps, focus state, and permissions.
- [x] Read end-to-end paste-at-cursor flow (IPC, renderer insertion, clipboard).
- [x] Identify root cause and implement fix with minimal surface changes.
- [x] Add user-facing error when paste cannot execute (no silent failures).
- [x] Add at least one regression test covering paste success and failure paths.
- [x] Define CI strategy for paste testing (mock boundary, skip marker, or dedicated macOS runner).
- CI strategy: keep paste automation behavior asserted at the `OutputService`/orchestrator mock boundary in unit tests; require manual verification on macOS for real focus/permission behavior.
- Manual verification note: user reported local macOS paste-at-cursor success on the PR branch. Detailed failure-path capture (exact message text / OS version / focus state) is still pending.
- [ ] Update docs/help copy if paste behavior is described.
- [ ] Run relevant tests and manual macOS verification.
- Gate:
- Paste inserts at cursor on macOS and failure path shows a clear error.
- Regression test added and passing in CI (with explicit mock/skip strategy if needed).
- Docs updated and tests green.
- Risks/Uncertainty:
- macOS permission/focus behavior may vary across OS versions.
- Some host apps may block programmatic paste; error handling must be non-blocking.
- Feasibility:
- Medium. Requires reliable repro and OS-specific validation.

### #120 - [P0] STT should preserve spoken language instead of forcing English
- Type: Fix
- Goal: Default to auto-detect language unless explicitly overridden by the user.
- Granularity: STT request assembly only (no UI redesign).
- Checklist:
- [ ] Read STT request assembly and language handling paths.
- [ ] Verify transcription language behavior against current OpenAI docs (Context7).
- [ ] Enumerate wired STT providers and confirm language parameter behavior per provider.
- [ ] Remove forced English default when no explicit language is set.
- [ ] Update settings help text for language override behavior.
- [ ] Add at least one test for non-English transcription and explicit override.
- [ ] Run relevant tests and manual non-English verification.
- Gate:
- Default behavior preserves spoken language; explicit override still works.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Provider defaults may differ; ensure behavior is consistent across providers.
- Feasibility:
- High. Likely a small change with clear verification steps.

---

## P1 Tickets

### #124 - [P1] Show message when stop/cancel recording is pressed while not recording
- Type: Fix
- Goal: Provide clear feedback when stop/cancel is pressed without an active recording.
- Granularity: Stop/cancel handlers only.
- Checklist:
- [x] Read stop/cancel handlers and recording state logic.
- [x] Add idle-state guard with user-facing message.
- [x] Ensure no state changes occur in idle path.
- [x] Add at least one test for idle stop/cancel behavior.
- [x] Update docs/help text if referenced.
- Gate:
- Idle stop/cancel shows clear message and does not change state.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Must avoid double messaging when stop/cancel races with auto-stop.
- Feasibility:
- High. Limited scope and predictable changes.
- Implementation Notes (2026-02-25):
- Renderer recording command dispatch now guards idle `stopRecording` / `cancelRecording` and shows `Recording is not in progress.` instead of silent/success-like completion messages from the handler.
- Idle guard returns before recorder-state mutations, sound playback, or `onStateChange`.
- Added renderer unit tests for both idle stop and idle cancel paths.

### #122 - [P1] Validate Transformation Profile prompts before saving
- Type: Fix
- Goal: Block saving invalid prompts and show clear validation messages.
- Granularity: Transformation Profile validation only.
- Checklist:
- [x] Read prompt save flow and validation surface.
- [x] Enforce non-blank system prompt and user prompt.
- [x] Enforce `{{text}}` presence in user prompt.
- [x] Block save and show clear validation errors.
- [x] Add at least one test for invalid and valid prompt cases.
- [x] Update docs/help text for prompt requirements.
- Gate:
- Invalid prompts cannot be saved and show actionable errors.
- Valid prompts save normally; tests pass and docs updated.
- Risks/Uncertainty:
- Must ensure validation messaging is consistent with existing UX patterns.
- Feasibility:
- High. Validation is localized and easy to test.
- Implementation Notes (2026-02-25):
- Renderer save validation now blocks invalid prompt saves and shows inline errors for system/user prompts.
- User prompt help text documents required `{{text}}` placeholder.
- Save path normalizes legacy `{{input}}` to `{{text}}`; runtime formatter supports both placeholders for backward compatibility.
- No manual user verification required; covered with renderer unit tests and prompt formatter tests.

---

## P2 Tickets

### #95 - [P2] Add Playwright e2e recording test with fake audio capture
- Type: Test
- Goal: Deterministic e2e coverage of recording flow using fake audio.
- Granularity: Test harness and a single e2e spec.
- Checklist:
- [ ] Read Playwright config and existing e2e patterns.
- [ ] Add fixture audio file and resolve absolute path at runtime.
- [ ] Add Chromium fake media stream flags for audio capture.
- [ ] Implement start/stop recording e2e test with deterministic assertions.
- [ ] Define retry/timeouts policy for the test and document fallback if media flags fail in CI.
- [ ] Update test docs to describe fixture and flags.
- Gate:
- Test passes deterministically in headless CI and locally.
- Docs updated with fixture and launch flags.
- Risks/Uncertainty:
- Fake audio capture can be flaky across CI runners; may require retries or timeouts.
- Feasibility:
- Medium. Needs stable test harness and correct media flags.

### #130 - [P2] Improve “change default config” behavior for 2 vs 3+ profiles
- Type: UX Change
- Goal: Auto-switch for 2 profiles; chooser dialog for 3+ profiles.
- Granularity: Change-default command and chooser UI only.
- Blocked By: #127 decision doc (active vs default semantics).
- Checklist:
- [ ] Read current change-default flow and persistence paths.
- [ ] Confirm #127 decision doc is merged and align behavior with it.
- [ ] Implement 2-profile auto-switch behavior.
- [ ] Implement 3+ profile chooser behavior and persistence.
- [ ] Add at least one test for 2-profile and 3+ profile flows.
- [ ] Update settings docs/help text.
- Gate:
- 2-profile case switches immediately; 3+ case uses chooser.
- #127 decision doc referenced; tests pass and docs updated.
- Risks/Uncertainty:
- Ambiguity around whether “default” also sets “active.” Requires explicit decision.
- Feasibility:
- Medium. Depends on existing settings model and picker UI reuse.

---

## P3 Tickets

### #125 - [P3] Add per-provider Save buttons for API key fields
- Type: UX Change
- Goal: Allow saving each provider key independently with feedback.
- Granularity: Settings UI save actions only.
- Checklist:
- [ ] Read current API key storage and save flow.
- [ ] Implement per-provider save actions and feedback.
- [ ] Ensure saving one key does not overwrite unsaved fields.
- [ ] Add at least one test for per-provider save isolation.
- [ ] Update settings docs/help text.
- Gate:
- Each provider can be saved independently with feedback.
- No cross-field overwrite; tests pass and docs updated.
- Risks/Uncertainty:
- Must avoid leaking secrets in logs or UI feedback.
- Feasibility:
- Medium. Requires careful state handling to avoid overwrite.

### #126 - [P3] Simplify Home transformation shortcut UI copy and status display
- Type: UX Change
- Goal: Update copy and remove status per issue request.
- Granularity: Home shortcut UI copy only.
- Checklist:
- [ ] Read Home shortcut UI copy usage.
- [ ] Replace copy per issue request and remove status display.
- [ ] Update tests/snapshots for new copy.
- [ ] Update docs/help text if referenced.
- Gate:
- Updated copy and status removal are visible in UI.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Minor: Copy changes could conflict with localization rules if any exist.
- Feasibility:
- High. Localized UI copy changes.

### #123 - [P3] Remove IPC pong display from the UI
- Type: UX Change
- Goal: Remove pong indicator from user-facing UI.
- Granularity: UI display only; do not remove internal diagnostics unless required.
- Checklist:
- [ ] Read pong UI rendering path.
- [ ] Remove UI element without affecting internal diagnostics.
- [ ] Update tests/snapshots as needed.
- [ ] Update docs/help text if referenced.
- Gate:
- Pong display removed from UI and no regressions.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Ensure removal does not break any dev-only diagnostics.
- Feasibility:
- High. Simple UI removal.

### #129 - [P3] Rename “config” to “profile” in Transformation settings UI
- Type: UX Change
- Goal: Use consistent “profile” terminology in transformation settings UI.
- Granularity: UI copy only.
- Checklist:
- [ ] Read all transformation settings UI copy locations.
- [ ] Replace “config” with “profile” consistently.
- [ ] Update tests/snapshots for copy changes.
- [ ] Update docs/help text if referenced.
- Gate:
- Transformation settings UI uses “profile” consistently.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Copy changes may require localization or snapshot updates.
- Feasibility:
- High. Localized text update.

### #127 - [P3] Clarify “Active config” vs “default” in Transformation settings
- Type: Decision + UX Change
- Goal: Define and communicate the relationship between active and default profiles.
- Granularity: UX text and behavior alignment only.
- Checklist:
- [ ] Read current behavior and any related specs.
- [ ] Create decision doc in `docs/decisions/` defining semantics.
- [ ] Update UI copy/help text to reflect the decision.
- [ ] Align behavior with the documented semantics if needed.
- [ ] Add at least one test for the clarified behavior.
- [ ] Update docs/help text.
- Gate:
- Decision recorded; UI text and behavior match the decision.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Product semantics are unclear; require explicit agreement.
- Feasibility:
- Medium. Depends on existing behavior alignment.

### #128 - [P3] Clarify “Enable transformation” toggle vs auto-run default transformation
- Type: Decision + UX Change
- Goal: Define toggle interaction rules and ensure UI matches behavior.
- Granularity: Toggle semantics and help text only.
- Checklist:
- [ ] Read current toggle behavior and settings dependencies.
- [ ] Create decision doc in `docs/decisions/` defining interaction rules.
- [ ] Update UI copy/help text to reflect the decision.
- [ ] Align behavior with the documented semantics if needed.
- [ ] Add at least one test for toggle combinations.
- [ ] Update docs/help text.
- Gate:
- Decision recorded; UI text and behavior match the decision.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Ambiguous behavior could lead to user confusion if not carefully specified.
- Feasibility:
- Medium. Requires agreement on intended semantics.
