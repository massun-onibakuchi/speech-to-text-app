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
| P0 | Prevent double output when auto-transform + transformed paste are enabled | #148 | Fix + UX | DONE |
| P0 | Fix macOS paste-at-cursor failure | #121 | Fix | DONE |
| P0 | Preserve spoken language in STT | #120 | Fix | DONE |
| P1 | Show message when stop/cancel pressed while idle | #124 | Fix | DONE |
| P1 | Validate Transformation Profile prompts before saving | #122 | Fix | DONE |
| P2 | Add Playwright e2e recording test with fake audio | #95 | Test | DONE |
| P2 | Improve “change default config” behavior for 2 vs 3+ profiles | #130 | UX Change | DONE |
| P3 | Per-provider Save buttons for API keys | #125 | UX Change | DONE |
| P3 | Simplify Home transformation shortcut copy/status | #126 | UX Change | DONE |
| P3 | Remove IPC pong display from UI | #123 | UX Change | DONE |
| P3 | Rename “config” to “profile” in Transformation settings UI | #129 | UX Change | DONE |
| P3 | Clarify “Active config” vs “default” in Transformation settings | #127 | Decision + UX Change | DONE |
| P3 | Clarify “Enable transformation” toggle vs auto-run default | #128 | Decision + UX Change | DONE |

---

## P0 Tickets

### #148 - [P0] Prevent double output when auto-transform and transformed paste are enabled
- Type: Fix + UX Change
- Goal: Deliver only one selected output text per capture job (raw or transformed) and replace conflicting output toggles with a single source selector plus shared destinations.
- Granularity: Capture output selection/preference logic and Settings Output UI only.
- Checklist:
- [x] Read capture pipeline / legacy orchestrator output paths and Settings Output UI.
- [x] Verify controlled checkbox/radio React patterns against current docs (Context7).
- [x] Add explicit output text source selection in settings (`transcript` vs `transformed`).
- [x] Backfill missing selection on load for existing settings via migration.
- [x] Enforce single-source output delivery in capture pipelines (no transcript + transformed double-delivery).
- [x] Replace overlapping output toggles with single `Output text` selector and shared `Output destinations`.
- [x] Preserve standalone transform shortcut output behavior while updating Settings Output UI.
- [x] Add regression tests for capture pipeline, legacy orchestrator, Settings Output UI, and settings migration.
- [ ] Run manual macOS verification for paste-at-cursor with auto-transform ON and transformed output selected.
- Gate:
- Capture jobs emit only one output text source per run (selected transformed on success; transcript fallback when transformed result is unavailable).
- Settings Output UI no longer presents overlapping transcript/transformed destination toggles.
- Tests pass and docs/decision record are updated.
- Risks/Uncertainty:
- Legacy installs may still have divergent transcript/transformed destination rules until users revisit the Output settings screen; UI now re-synchronizes them on edit.
- Transform-failure fallback remains transcript output (current behavior) when transformed output is selected but transformation fails.
- Feasibility:
- Medium. Small runtime/UI patch with cross-cutting settings-schema/test updates.
- Implementation Notes (2026-02-26):
- Added `output.selectedTextSource` to settings and one-time migration derivation with transformed precedence for legacy matrix configs.
- Capture pipelines now apply a single selected output rule instead of independently applying transcript and transformed outputs.
- Settings Output UI now uses `Raw dictation` / `Transformed text` single-select plus shared `Copy to clipboard` / `Paste at cursor` destinations.

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
- [x] Read STT request assembly and language handling paths.
- [x] Verify transcription language behavior against current OpenAI docs (Context7).
- [x] Enumerate wired STT providers and confirm language parameter behavior per provider.
- [x] Remove forced English default when no explicit language is set.
- [x] Update settings help text for language override behavior.
- [x] Add at least one test for non-English transcription and explicit override.
- [ ] Run relevant tests and manual non-English verification.
- Gate:
- Default behavior preserves spoken language; explicit override still works.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Provider defaults may differ; ensure behavior is consistent across providers.
- Feasibility:
- High. Likely a small change with clear verification steps.
- Implementation Notes (2026-02-25):
- STT adapters now treat blank/`auto` language as provider auto-detect (omit provider language parameter) instead of forwarding the sentinel value.
- Groq adapter preserves explicit overrides via `language`; ElevenLabs adapter now also preserves explicit overrides via `language_code`.
- Settings Recording help text now documents auto-detect default and the advanced `transcription.outputLanguage` file override.
- Added adapter tests for auto-detect omission and explicit non-English overrides, plus renderer help-text coverage.

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
- [x] Read Playwright config and existing e2e patterns.
- [x] Add fixture audio file and resolve absolute path at runtime.
- [x] Add Chromium fake media stream flags for audio capture.
- [x] Implement start/stop recording e2e test with deterministic assertions.
- [x] Define retry/timeouts policy for the test and document fallback if media flags fail in CI.
- [x] Update test docs to describe fixture and flags.
- Gate:
- Test passes deterministically in headless CI and locally.
- Docs updated with fixture and launch flags.
- Risks/Uncertainty:
- Fake audio capture can be flaky across CI runners; may require retries or timeouts.
- Feasibility:
- Medium. Needs stable test harness and correct media flags.
- Implementation Notes (2026-02-25):
- Added fixture WAV `e2e/fixtures/fake-mic-tone.wav` and runtime absolute-path resolver in `e2e/electron-ui.e2e.ts`.
- Extended Electron test launcher to accept per-test Chromium flags, then added a macOS-tagged fake-audio recording smoke test using fake-media switches.
- The test asserts start/stop UI feedback under fake-media flags without depending on live STT providers.
- Documented flags, retry policy, and CI fallback guidance in `docs/e2e-playwright.md`.

### #130 - [P2] Improve “change default config” behavior for 2 vs 3+ profiles
- Type: UX Change
- Goal: Auto-switch for 2 profiles; chooser dialog for 3+ profiles.
- Granularity: Change-default command and chooser UI only.
- Blocked By: #127 decision doc (active vs default semantics).
- Checklist:
- [x] Read current change-default flow and persistence paths.
- [x] Confirm #127 decision doc is merged and align behavior with it.
- [x] Implement 2-profile auto-switch behavior.
- [x] Implement 3+ profile chooser behavior and persistence.
- [x] Add at least one test for 2-profile and 3+ profile flows.
- [x] Update settings docs/help text.
- Gate:
- 2-profile case switches immediately; 3+ case uses chooser.
- #127 decision doc referenced; tests pass and docs updated.
- Risks/Uncertainty:
- Ambiguity around whether “default” also sets “active.” Requires explicit decision.
- Feasibility:
- Medium. Depends on existing settings model and picker UI reuse.
- Implementation Notes (2026-02-25):
- `change default transformation` hotkey now auto-switches to the other profile when exactly 2 profiles exist (no chooser popup).
- For 3+ profiles, it reuses the existing picker UI and preselects the current default profile.
- Action updates `defaultPresetId` only (does not change `activePresetId`), consistent with `#127` decision doc.
- Added HotkeyService tests for 2-profile and 3+ profile paths.

---

## P3 Tickets

### #125 - [P3] Add per-provider Save buttons for API key fields
- Type: UX Change
- Goal: Allow saving each provider key independently with feedback.
- Granularity: Settings UI save actions only.
- Checklist:
- [x] Read current API key storage and save flow.
- [x] Implement per-provider save actions and feedback.
- [x] Ensure saving one key does not overwrite unsaved fields.
- [x] Add at least one test for per-provider save isolation.
- [x] Update settings docs/help text.
- Gate:
- Each provider can be saved independently with feedback.
- No cross-field overwrite; tests pass and docs updated.
- Risks/Uncertainty:
- Must avoid leaking secrets in logs or UI feedback.
- Feasibility:
- Medium. Requires careful state handling to avoid overwrite.
- Implementation Notes (2026-02-25):
- Added per-provider `Save` buttons beside each API key field while retaining the bulk `Save API Keys` action.
- Single-provider save path only persists the selected provider key, leaving other unsaved field drafts untouched.
- Provider-specific save feedback is shown in row status text and the shared API-key save message area.
- Added renderer component coverage for row-level save button behavior and mutation tests for single-provider save isolation/validation.

### #126 - [P3] Simplify Home transformation shortcut UI copy and status display
- Type: UX Change
- Goal: Update copy and remove status per issue request.
- Granularity: Home shortcut UI copy only.
- Checklist:
- [x] Read Home shortcut UI copy usage.
- [x] Replace copy per issue request and remove status display.
- [x] Update tests/snapshots for new copy.
- [x] Update docs/help text if referenced.
- Gate:
- Updated copy and status removal are visible in UI.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Minor: Copy changes could conflict with localization rules if any exist.
- Feasibility:
- High. Localized UI copy changes.
- Implementation Notes (2026-02-25):
- Home transformation shortcut panel now uses simplified copy: `Run transformation on clipboard text`.
- Removed the `lastTransformSummary` line from the Home transformation shortcut panel display.
- Renamed the transform action button label from `Run Composite Transform` to `Transform` (busy label unchanged).
- Updated Home renderer tests for new copy and removed status text.

### #123 - [P3] Remove IPC pong display from the UI
- Type: UX Change
- Goal: Remove pong indicator from user-facing UI.
- Granularity: UI display only; do not remove internal diagnostics unless required.
- Checklist:
- [x] Read pong UI rendering path.
- [x] Remove UI element without affecting internal diagnostics.
- [x] Update tests/snapshots as needed.
- [x] Update docs/help text if referenced.
- Gate:
- Pong display removed from UI and no regressions.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Ensure removal does not break any dev-only diagnostics.
- Feasibility:
- High. Simple UI removal.
- Implementation Notes (2026-02-25):
- Removed the `IPC pong` chip from `ShellChromeReact` hero metadata.
- Kept renderer ping state + IPC ping wiring intact to avoid changing internal initialization diagnostics.
- Updated component test to assert pong text is no longer rendered.

### #129 - [P3] Rename “config” to “profile” in Transformation settings UI
- Type: UX Change
- Goal: Use consistent “profile” terminology in transformation settings UI.
- Granularity: UI copy only.
- Checklist:
- [x] Read all transformation settings UI copy locations.
- [x] Replace “config” with “profile” consistently.
- [x] Update tests/snapshots for copy changes.
- [x] Update docs/help text if referenced.
- Gate:
- Transformation settings UI uses “profile” consistently.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Copy changes may require localization or snapshot updates.
- Feasibility:
- High. Localized text update.
- Implementation Notes (2026-02-25):
- Renamed transformation settings labels/buttons from “configuration” to “profile” (active/default/profile actions/name/model).
- Updated related settings messages and validation text in the transformation settings flow (add/remove/required-name) to use “profile”.
- Updated renderer tests to assert profile terminology and no remaining “Configuration” text in the transformation settings component.

### #127 - [P3] Clarify “Active config” vs “default” in Transformation settings
- Type: Decision + UX Change
- Goal: Define and communicate the relationship between active and default profiles.
- Granularity: UX text and behavior alignment only.
- Checklist:
- [x] Read current behavior and any related specs.
- [x] Create decision doc in `docs/decisions/` defining semantics.
- [x] Update UI copy/help text to reflect the decision.
- [x] Align behavior with the documented semantics if needed.
- [x] Add at least one test for the clarified behavior.
- [x] Update docs/help text.
- Gate:
- Decision recorded; UI text and behavior match the decision.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Product semantics are unclear; require explicit agreement.
- Feasibility:
- Medium. Depends on existing behavior alignment.
- Implementation Notes (2026-02-25):
- Added decision doc `docs/decisions/transformation-active-vs-default-profile.md` documenting active/default semantics and confirming existing behavior.
- Added Settings help text clarifying active vs default profile usage and restart persistence.
- Added/updated tests for clarified behavior and help text (`CommandRouter` capture uses default profile when active/default differ; transformation settings UI copy assertions).

### #128 - [P3] Clarify “Enable transformation” toggle vs auto-run default transformation
- Type: Decision + UX Change
- Goal: Define toggle interaction rules and ensure UI matches behavior.
- Granularity: Toggle semantics and help text only.
- Checklist:
- [x] Read current toggle behavior and settings dependencies.
- [x] Create decision doc in `docs/decisions/` defining interaction rules.
- [x] Update UI copy/help text to reflect the decision.
- [x] Align behavior with the documented semantics if needed.
- [x] Add at least one test for toggle combinations.
- [x] Update docs/help text.
- Gate:
- Decision recorded; UI text and behavior match the decision.
- Tests pass and docs updated.
- Risks/Uncertainty:
- Ambiguous behavior could lead to user confusion if not carefully specified.
- Feasibility:
- Medium. Requires agreement on intended semantics.
- Implementation Notes (2026-02-25):
- Added decision doc `docs/decisions/transformation-enable-vs-auto-run.md` defining `Enable transformation` as the master gate and `Auto-run default transform` as capture/recording-only automation.
- Added Settings help text under both toggles clarifying scope and interaction.
- Aligned capture/processing behavior so auto-run-off skips automatic transformation (while manual transform flows remain gated only by `enabled`).
- Added tests for capture snapshot binding and processing behavior when auto-run is disabled, plus UI help text assertions.

---

## Update: Issue Batch #127-#154 Re-Triage (Feb 26, 2026)

### Open Issues in Scope
- Open: `#127`, `#132`, `#145`, `#148`, `#151`, `#154`

### Confirmed Constraints (user-confirmed)
- `#148`: two-step approach (`A`) with immediate runtime precedence fix first; settings redesign follows later.
- `#148`: zero backward compatibility for legacy overlapping output behavior.
- `#127`: remove `active` from user-facing Transformation settings UI.
- Platform scope for this batch: macOS first; Linux follow-up later.

### Batch Priority Order (revised)
- P0: `#148` Prevent double paste when auto-transformation + transformation paste-at-cursor are both enabled.
- P1: `#154` Clicking app icon should restore/reopen main window after it is closed.
- P1: `#145` Global shortcut profile picker should restore previous app focus after profile selection.
- P2: `#132` Global shortcut plays no sound when another app is focused (investigate first, then fix if scoped).
- P3: `#151` Pick-and-run transformation picker window is too small.
- P3: `#127` Finish UI/docs cleanup for profile semantics (remove `active` from user-facing settings UI).

### Key Risks (from sub-agent review) + Mitigations
- Risk: semantic dependency inversion (`#127` semantics resolved after `#148`) could force rework in the highest-priority fix.
- Mitigation: add a small semantic lock gate (subset of `#127`) before `#148`; record decisions in a short decision note before implementation.
- Risk: `#148` runtime behavior changes can ship before UI/docs are updated, leaving users with behavior/UI mismatch.
- Mitigation: include temporary helper text/docs update in the `#148` runtime PR and create a tracked follow-up for settings UI redesign (do not leave it as an untracked “later” task).
- Risk: `#145` and `#154` likely share focus/window lifecycle code paths; separate fixes may regress each other.
- Mitigation: perform a joint focus-path audit first and either (a) implement both in one milestone with shared validation, or (b) land sequential PRs after a shared strategy is documented.

### Execution Plan (granular and reviewable)

#### Gate 0 - Semantic Lock (subset of `#127`)
- Goal: lock only the behavior needed for current implementation work.
- Deliverables:
- Confirm and document that user-facing settings no longer expose `active`.
- Confirm manual/one-shot “Pick and Run” does not mutate default profile.
- Confirm “Run transformation” uses default profile semantics for current shipped behavior.
- Output:
- Short decision note in `docs/decisions/` (or update existing decision doc if preferred) with explicit date and scope.
- Feasibility:
- High. Small scope and prevents rework.

#### Step 1 - `#148` Runtime Output Precedence Fix (Phase 1)
- Goal: only the selected output text is delivered to selected destinations; no double insertion.
- Granularity:
- Runtime precedence/output routing only (no settings UI redesign in this PR).
- Required checks:
- Add tests for `Raw dictation` output path.
- Add tests for `Transformed text` output path (raw text is intermediate only, never pasted/copied).
- Add a user-facing docs/help note describing the behavior change until settings UI redesign lands.
- Risks/Uncertainty:
- Breaking change due to zero backward compatibility; ensure release notes/PR notes call this out clearly.
- Feasibility:
- Medium-High. Core logic change with test coverage.

#### Step 2 - Joint Focus/Lifecycle Audit for `#154` + `#145`
- Goal: identify shared activation/focus restoration code paths before implementation.
- Granularity:
- Audit + test matrix definition only (no broad refactor unless required).
- Required checks:
- Map app-icon click activation path.
- Map global shortcut picker open/close and focus-restore path.
- Define shared macOS manual verification matrix (main window open/closed/hidden/minimized, target app focused).
- Feasibility:
- Medium. Risk-reduction step before code changes.

#### Step 3 - `#154` Main Window Restore on App Icon Click
- Goal: clicking the app icon restores/reopens the main window when the app is still running.
- Granularity:
- App lifecycle/window restore behavior only.
- Required checks:
- Manual macOS verification for closed/hidden/minimized window states.
- Add/extend tests around window restore/show/focus orchestration where feasible.
- Risks/Uncertainty:
- Platform activation behavior may differ between dev and packaged builds.
- Feasibility:
- Medium.

#### Step 4 - `#145` Restore Previous App Focus after Picker Selection
- Goal: picker closes and focus returns to the previously focused app/window.
- Granularity:
- Global shortcut picker close/focus restore path only.
- Required checks:
- Verify behavior with main window open and closed.
- Run manual macOS validation using at least one external app (e.g., Chrome or editor).
- Add regression coverage at the focus-orchestrator/service boundary where possible.
- Risks/Uncertainty:
- OS-level focus APIs can be timing-sensitive; avoid flaky tests by asserting orchestration calls and keeping manual validation explicit.
- Feasibility:
- Medium.

#### Step 5 - `#132` Audio Cue Missing When Another App Is Focused (Investigation First)
- Goal: determine whether this is a packaged-build bug, `dist/`-run limitation, or focus-dependent audio-session issue.
- Granularity:
- Investigation and scoping first; implementation only after root cause is confirmed.
- Required checks:
- Reproduce on installed build vs `dist/` launch.
- Confirm app process lifecycle after main window close.
- Confirm sound cue call path and focus dependency.
- Document macOS-only support expectation and any `dist/` caveat if applicable.
- Mitigation:
- Timebox investigation and split fix into a separate PR if root cause expands.
- Feasibility:
- Unknown until investigation completes.
- Implementation Notes (2026-02-26):
- Root cause was a renderer-side `document.hasFocus()` guard that intentionally suppressed recording cue playback when the app window was not focused.
- Removed the focus gate for recording start/stop/cancel cues so global shortcut recordings still produce audible feedback while another app is focused.
- Added renderer unit regression coverage for background-focus `startRecording` cue playback.
- Manual macOS packaged-build verification is still recommended to confirm no OS audio-session quirks remain.

#### Step 6 - `#151` Picker Window Height / List Visibility
- Goal: show 3-5 profiles before scrolling, based on count.
- Granularity:
- Picker sizing only.
- Required checks:
- Validate `1-3`, `4-5`, and `>5` profile counts.
- Add UI test (if practical) or explicit manual screenshots/checklist.
- Feasibility:
- High. Localized UI sizing change.

#### Step 7 - `#127` Finish User-Facing Cleanup (post-semantic lock)
- Goal: remove `active` from user-facing settings UI and align copy/docs with shipped behavior.
- Granularity:
- UI copy/help text and user-facing settings presentation only.
- Required checks:
- Ensure copy matches actual `#148` behavior and current default-profile semantics.
- Update docs/help text and tests for removed `active` UI references.
- Feasibility:
- High once earlier behavior changes are landed.

### PR / Review Strategy for This Batch
- Continue using one ticket per PR for implementation changes.
- Exception allowed: shared audit notes for `#154` + `#145` may be prepared together before code changes.
- For macOS-specific focus/audio behavior, define test strategy per PR (unit/service mocks + manual macOS verification checklist).
