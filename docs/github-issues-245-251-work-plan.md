<!--
Where: docs/github-issues-245-251-work-plan.md
What: Prioritized execution plan for GitHub tickets #245-#251 with one-ticket-per-PR delivery.
Why: Provide granular, feasible, risk-aware implementation slices with explicit gates and sequencing.
-->

# GitHub Issues Work Plan (#245-#251) - February 28, 2026

## Plan Rules
- One ticket equals one PR.
- One PR references exactly one ticket.
- Every ticket includes goal, checklist, tasks, gates, granularity, feasibility, potential risk, and approach.
- Behavior/contract changes require a decision doc in `docs/decisions/` in the same PR.
- Each code ticket adds/updates at least one test and updates docs.
- Do not start dependent ticket PRs until predecessor PRs are merged to `main`.

## Source of Truth
- Open issues reviewed on February 28, 2026:
  - #245 Remove Shortcut Contract from Shortcuts tab (no backward compatibility)
  - #246 Show "Settings autosaved." as toast on auto-save
  - #247 API key field should be redacted after save
  - #248 Remove STT/LLM base URL override settings (no backward compatibility)
  - #249 Bug: final output not added to Activity when output-text=transformed-text
  - #250 Bug: keybind recording triggers existing shortcuts; must block while recording
  - #251 Move Audio Input setting into its own tab next to Shortcuts

## Priority Model
- P0: Core user-facing correctness bugs that can trigger incorrect behavior during primary flows.
- P1: Contract/UI behavior changes with moderate-to-high regression surface.
- P2: Information architecture and presentation cleanup with lower runtime risk.

## Dependency Map
- Hard dependencies:
  - None.
- Soft sequencing:
  - #251 after #248 (both edit Settings tab composition; sequence to reduce merge/rework conflicts).
  - #245 after #250 to avoid parallel edits in shortcut-tab files.
  - #246 after #247 for consistent user-feedback behavior work in one sequence.

## Ticket Index (Sorted by Priority)

| Priority | Ticket | Issue | Type | Hard Depends On | Soft Sequence |
|---|---|---|---|---|---|
| P0 | Block shortcut actions during keybind capture | #250 | Bug/Interaction Correctness | None | before #245 |
| P0 | Ensure transformed-text capture writes terminal Activity entry | #249 | Bug/Core Output Behavior | None | None |
| P1 | Remove STT/LLM base URL override feature and contract | #248 | Contract + Runtime Cleanup | None | before #251 |
| P1 | Redact API key input after save with persisted-key indicator | #247 | Security UX Bug | None | after #248 |
| P1 | Show autosave success as toast instead of inline status | #246 | UX Bug | None | after #247 |
| P2 | Move Audio Input into a dedicated tab beside Shortcuts | #251 | IA/UI Refactor | None | after #248 |
| P2 | Remove Shortcut Contract panel from Shortcuts tab | #245 | UI Cleanup | None | after #250 |

## Chunked Execution Order
1. Chunk A (P0 correctness): #250, #249.
2. Chunk B (contract + security UX): #248, #247, #246.
3. Chunk C (IA + panel cleanup): #251, #245.

---

## P0 Tickets

### #250 - [P0] Block shortcut actions during keybind capture
- Goal:
  - Prevent existing global shortcut actions from firing while shortcut capture mode is active; capture-only behavior must win.
- Checklist:
  - [ ] Non-goals locked: no shortcut schema changes.
  - [ ] Capture mode exposes explicit active/inactive state consumable by renderer event handlers.
  - [ ] Incoming shortcut-triggered recording commands are suppressed while capture is active.
  - [ ] Duplicate/conflict feedback remains visible and unchanged.
  - [ ] Add regression tests for suppression behavior.
  - [ ] Update docs with capture-mode suppression contract.
- Tasks (Step-by-step):
  1. Trace keybind capture lifecycle owner in `SettingsShortcutEditorReact` and IPC recording-command entry in renderer.
  2. Add shared capture-state signal in app shell/orchestrator state.
  3. Gate `onRecordingCommand` handling while capture-state is active.
  4. Ensure state resets on cancel/blur/outside-click/window blur paths.
  5. Add tests proving `toggleRecording` dispatch does not trigger recording while capture is active.
  6. Add/adjust docs decision record for suppression behavior.
- Gates:
  - No recording/transform shortcut action executes while any shortcut field is capturing.
  - Existing duplicate-shortcut validation feedback still appears.
  - Capture mode exits cleanly and command handling resumes immediately after exit.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/settings-shortcut-editor-react.tsx`
  - `src/renderer/app-shell-react.tsx`
  - `src/renderer/renderer-app.tsx`
  - `src/renderer/*shortcut*.test.tsx` and/or `src/renderer/renderer-app.test.ts`
  - `docs/decisions/*`
- Test cases to add:
  - `suppresses recording command dispatch while shortcut capture is active`
  - `resumes command dispatch after capture exits`
- Granularity:
  - Renderer capture/dispatch boundary only.
- Feasibility:
  - Medium.
- Potential Risk:
  - Over-suppression could block legitimate commands after capture if state teardown is incorrect.
- Approach:
  - Centralize capture-state in renderer state and gate command-dispatch entrypoint, not per-button handlers.

### #249 - [P0] Ensure transformed-text output still appends final Activity entry
- Goal:
  - Guarantee terminal Activity entries are recorded for successful captures when `output.selectedTextSource=transformed`.
- Checklist:
  - [ ] Non-goals locked: no Activity visual redesign.
  - [ ] Reproduce missing terminal entry with transformed output mode.
  - [ ] Fix source-of-truth selection for terminal message projection.
  - [ ] Preserve behavior for transcript mode.
  - [ ] Add coverage for both selectedTextSource modes.
  - [ ] Update docs on capture terminal-message behavior.
- Tasks (Step-by-step):
  1. Trace capture completion path (`submitRecordedAudio` -> history poll -> terminal Activity append).
  2. Reproduce with fixture where transcript/transformed availability differs.
  3. Patch terminal-message resolver/projection so transformed mode always emits terminal entry when available.
  4. Keep fallback behavior when transformed text is missing.
  5. Add regression tests around `resolveSuccessfulRecordingMessage` and integration path.
  6. Update docs/decision note for terminal-entry contract.
- Gates:
  - With transformed selected and transformed text present, Activity shows the final transformed text entry.
  - Transcript-selected behavior remains unchanged.
  - No duplicate terminal entry for one capture.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/native-recording.ts`
  - `src/renderer/native-recording.test.ts`
  - `src/renderer/renderer-app.test.ts` (if integration assertion is needed)
  - docs decision/contract file
- Test cases to add:
  - `transformed selected source appends transformed terminal activity`
  - `transformed selected source falls back safely when transformed text absent`
- Granularity:
  - Capture terminal-result projection path only.
- Feasibility:
  - Medium-high.
- Potential Risk:
  - Polling/path changes could accidentally alter toast timing or duplicate append behavior.
- Approach:
  - Keep fix local to terminal-message resolver and terminal append point; avoid modifying broader activity pipeline.

---

## P1 Tickets

### #248 - [P1] Remove STT/LLM base URL override feature and contract (no backward compatibility)
- Goal:
  - Remove endpoint override fields from UI, shared settings schema, and runtime resolution paths.
- Checklist:
  - [ ] Non-goals locked: no provider/model allowlist changes.
  - [ ] Remove UI controls for STT/LLM override fields.
  - [ ] Remove override validation fields and autosave handling.
  - [ ] Remove settings schema/default fields for override maps.
  - [ ] Remove runtime use of override values in command/orchestrator/service paths.
  - [ ] Remove obsolete tests/docs that enforce override behavior.
  - [ ] Add/update tests locking post-removal contract.
  - [ ] Add decision doc for contract removal.
- Tasks (Step-by-step):
  1. Remove only base-URL-override UI/props/callbacks while keeping provider/model/API-key flows intact (`SettingsSttProviderFormReact`, `SettingsEndpointOverridesReact`, app shell wiring).
  2. Simplify settings validation input/result by deleting URL-override fields.
  3. Update shared settings schema/defaults to remove override maps.
  4. Remove `resolveSttBaseUrlOverride`/`resolveLlmBaseUrlOverride` usage from main routing/orchestrators.
  5. Keep service adapter endpoint code using provider defaults only.
  6. Rewrite tests that currently assert override parsing/routing.
  7. Update docs (field matrix, decision docs, issue plans references).
- Gates:
  - No STT/LLM base URL override controls remain in UI.
  - Settings payload no longer includes override maps.
  - Runtime calls use provider defaults only.
  - Legacy override payloads are not supported (explicitly out of compatibility scope).
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/app-shell-react.tsx`
  - `src/renderer/settings-stt-provider-form-react.tsx`
  - `src/renderer/settings-endpoint-overrides-react.tsx` (delete)
  - `src/renderer/settings-validation.ts`
  - `src/shared/domain.ts`
  - `src/main/core/command-router.ts`, `src/main/orchestrators/*`
  - `src/main/services/endpoint-resolver.ts` and tests
  - `src/main/services/transcription/*` adapters and tests
  - `src/main/services/transformation/*` adapters and tests
  - related `*.test.ts(x)` and docs/decisions
- Test cases to add:
  - `settings schema rejects/strips removed override fields per new contract`
  - `command snapshot uses provider default endpoints only`
- Granularity:
  - Cross-layer contract cleanup; still bounded to override feature surface.
- Feasibility:
  - Medium.
- Potential Risk:
  - High churn across schema + orchestration could create broad test fallout.
- Approach:
  - Remove from schema first, then compile-fix downstream callers, then test-matrix cleanup.

### #247 - [P1] Redact API key field after save
- Goal:
  - Show saved-key presence with redacted field presentation after successful save, without revealing plaintext by default.
- Checklist:
  - [ ] Choose accepted UX option and document it (recommended: always-redacted unless user is actively typing a new value).
  - [ ] Keep plaintext hidden after save/reload.
  - [ ] Preserve current secure key persistence flow.
  - [ ] Keep per-provider status clarity (`Saved`/`Not set`) visible.
  - [ ] Add tests for redacted display and save flow.
  - [ ] Update docs/UI guidance.
- Tasks (Step-by-step):
  1. Define component-level redaction behavior for STT and Google key forms.
  2. Bind display state to `apiKeyStatus` + local dirty input state.
  3. After successful save, clear plaintext local value and render masked placeholder/value.
  4. Ensure visibility-toggle does not reveal unknown persisted secrets by default.
  5. Add tests in `settings-stt-provider-form-react.test.tsx` and `settings-api-keys-react.test.tsx`.
  6. Update docs describing redacted-after-save UX.
- Gates:
  - Saved key fields render as redacted indicator, not empty-ambiguous state.
  - Plaintext is not re-shown after save unless user enters a new value.
  - Save buttons and validation behavior remain intact.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/settings-stt-provider-form-react.tsx`
  - `src/renderer/settings-api-keys-react.tsx`
  - their component tests
  - docs decision note
- Test cases to add:
  - `shows redacted key indicator when apiKeyStatus provider=true and field not dirty`
  - `save success clears plaintext draft and keeps redacted state`
- Granularity:
  - API key form UX only.
- Feasibility:
  - High.
- Potential Risk:
  - UI state mix-ups across provider switches could show stale drafts.
- Approach:
  - Separate `dirtyDraft` and `savedKeyPresent` rendering states explicitly.

### #246 - [P1] Show "Settings autosaved." as toast on autosave success
- Goal:
  - Replace inline autosave success messaging with toast-based feedback.
- Checklist:
  - [ ] Non-goals locked: no autosave timing changes.
  - [ ] Autosave success triggers toast with exact text.
  - [ ] Inline message is not used for autosave-success status.
  - [ ] Failure inline/error behavior remains clear.
  - [ ] Add tests for toast emission and message removal.
  - [ ] Update docs to reflect toast contract.
- Tasks (Step-by-step):
  1. Update `runNonSecretAutosave` success path in renderer state orchestration.
  2. Keep failure path semantics unchanged unless required.
  3. Remove/adjust `data-settings-save-message` expectations for success in shell tests.
  4. Add renderer integration test asserting success toast contains `Settings autosaved.`.
  5. Update docs/decision record for autosave feedback.
- Gates:
  - Successful autosave emits toast text exactly `Settings autosaved.`.
  - No inline success message for autosave remains.
  - Autosave failure feedback is still visible and actionable.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/renderer-app.tsx`
  - `src/renderer/renderer-app.test.ts`
  - `src/renderer/app-shell-react.test.tsx`
  - docs decision/update note
- Test cases to add:
  - `autosave success shows toast and no inline success message`
- Granularity:
  - Autosave feedback channel only.
- Feasibility:
  - High.
- Potential Risk:
  - Losing visibility for users who miss ephemeral toasts.
- Approach:
  - Keep error inline surfaces while moving success-only feedback to toast.

---

## P2 Tickets

### #251 - [P2] Move Audio Input into dedicated tab next to Shortcuts
- Goal:
  - Introduce an Audio Input tab adjacent to Shortcuts and move audio controls out of generic Settings tab.
- Checklist:
  - [ ] Add `audio-input` tab route and panel.
  - [ ] Render `SettingsRecordingReact` audio controls in new tab.
  - [ ] Remove audio-input section from Settings tab.
  - [ ] Preserve callbacks/selectors for recording method/sample rate/device.
  - [ ] Update tab-order and section-order tests.
  - [ ] Update docs/spec screenshots/contracts.
- Tasks (Step-by-step):
  1. Extend `AppTab` union and tab rail to include `audio-input` beside `shortcuts`.
  2. Move `SettingsRecordingReact` mount from Settings panel to new panel.
  3. Keep data hooks/IDs stable where possible.
  4. Update app-shell and renderer-app tests for navigation and section ordering.
  5. Update docs (style/update IA notes, issue plan references).
- Gates:
  - Audio Input controls are accessible only through the new Audio Input tab.
  - Settings tab no longer contains audio-input section.
  - Tab order places Audio Input adjacent to Shortcuts.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/app-shell-react.tsx`
  - `src/renderer/app-shell-react.test.tsx`
  - `src/renderer/renderer-app.test.ts`
  - docs IA references
- Test cases to add:
  - `audio input tab renders recording controls and settings tab omits audio section`
- Granularity:
  - Tab IA/layout composition only.
- Feasibility:
  - Medium-high.
- Potential Risk:
  - E2E selector drift due to tab-route changes.
- Approach:
  - Preserve existing control IDs and callbacks; change only tab placement.

### #245 - [P2] Remove Shortcut Contract panel from Shortcuts tab (no backward compatibility)
- Goal:
  - Remove the read-only “Shortcut Contract” panel and associated contract-display logic.
- Checklist:
  - [ ] Remove `SettingsShortcutsReact` from Shortcuts tab.
  - [ ] Delete component and tests if no longer used.
  - [ ] Remove helper builders only used by contract panel.
  - [ ] Update docs/spec references to shortcut contract table/panel.
  - [ ] Add/adjust tests to assert panel absence.
- Tasks (Step-by-step):
  1. Remove shortcut contract builder + render call in `AppShell`.
  2. Delete `settings-shortcuts-react.tsx` and its tests if dead.
  3. Update shortcut-tab tests to validate editor-only surface.
  4. Remove stale docs language about “Shortcut Contract” panel.
- Gates:
  - Shortcuts tab no longer shows “Shortcut Contract” heading or combo table.
  - No dead imports/components remain.
  - Tests and docs are updated in PR.
- Files expected to change:
  - `src/renderer/app-shell-react.tsx`
  - `src/renderer/settings-shortcuts-react.tsx` (delete)
  - `src/renderer/settings-shortcuts-react.test.tsx` (delete)
  - `src/renderer/app-shell-react.test.tsx`
  - docs decision/spec files
- Test cases to add:
  - `shortcuts tab renders editor controls and omits shortcut contract panel`
- Granularity:
  - Shortcut-tab presentation cleanup only.
- Feasibility:
  - High.
- Potential Risk:
  - Removing contract display could reduce discoverability of default bindings.
- Approach:
  - Keep editable shortcut rows as single source of truth; update docs with concise binding guidance.

---

## Definition of Done (Per Ticket PR)
- [ ] PR references exactly one GitHub issue (one `Fixes`/`Closes #...`) and one ticket from this plan; no additional issue-closing keywords.
- [ ] Goal/checklist/tasks/gates from this plan are copied into PR description and checked.
- [ ] At least one relevant test is added/updated.
- [ ] Relevant docs are updated.
- [ ] Risk notes and rollback steps are included in PR description.
- [ ] Required CI checks are green before merge.
