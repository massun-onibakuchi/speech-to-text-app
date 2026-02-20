<!--
Where: docs/p0-p1-p2-react-execution-plan.md
What: Ticketized execution plan for stabilization (P0/P1/P2) plus React refactor kickoff.
Why: Provide one-ticket-per-PR roadmap with status, constraints, and checklists aligned to normative spec.
-->

# P0/P1/P2 + React Kickoff Execution Plan

## Plan Rules
- One ticket equals one PR.
- No mixed-scope PRs.
- Every ticket must maintain compliance with `specs/spec.md`.
- Status vocabulary is restricted to: `TODO`, `WIP`, `DONE`, `CANCELED`.
- Any external review/claim must be validated against current code/docs before changing ticket scope/status.

## Pre-Phase Risk Checklist (must be green before R0 starts)
- Shortcut path sanity check completed for selection, change-default, and picker command flows.
- Renderer/main event ownership map reviewed to prevent double-binding during React coexistence.
- Home and Settings behavior contract freeze recorded for migration surfaces (command feedback, status badges, sound events, and selector contracts).
- Rollback drill documented for React mount gate (how to disable React path quickly without data/schema changes).

## Ticket Index

| Priority | Ticket | Issue | Status | PR Scope |
|---|---|---|---|---|
| P0 | Fix paste-at-cursor output failed partial regression | #62 | DONE | Output/paste reliability only |
| P0 | Fix selection-target transformation execution errors | #63 | DONE | Selection transform path only |
| P0 | Fix change-default-transformation shortcut no-op | #64 | DONE | Shortcut command behavior only |
| P0 | Fix duplicate action sound playback | #65 | DONE | Sound trigger dedup only |
| P0 | Fix malformed Groq status handling and diagnostics | #66 | CANCELED | Provider error parsing only |
| P1 | Add ElevenLabs scribe_v1 model support | #67 | CANCELED | STT allowlist/adapter/model path only |
| P1 | Support per-provider STT/LLM base URL overrides | #68 | DONE | Settings + resolver override mapping only |
| P1 | Add structured error logging policy (main + renderer) | #69 | DONE | Logging/redaction/diagnostics only |
| P2 | Resolve pick-and-run persistence spec conflict | #70 | DONE | Decision/spec alignment only |
| P2 | Add dedicated transformation profile picker window UX | #71 | DONE | Picker UX only (depends on #70) |
| P2 | Implement safe autosave for selected settings controls | #72 | DONE | Settings autosave behavior only |
| P2 | Simplify Home by removing shortcut reference panel | #73 | DONE | Home UX simplification only |
| R0 | React kickoff: bootstrap renderer root with parity | #74 | DONE | React bootstrap with zero feature change |
| R0 | React phase 1: migrate Home page with behavior parity | #75 | DONE | Home-only React migration |
| R1 | React phase 2: migrate remaining Settings forms to React | #76 | WIP | Settings-only React migration |

---

## P0 Tickets

### #62 - [P0] Fix paste-at-cursor output failed partial regression
- Status: `DONE`
- Goal: Remove false `output_failed_partial` failures from normal paste-at-cursor flows.
- Constraints:
  - Must preserve output matrix semantics (`specs/spec.md:229-233`).
  - Must keep actionable failure feedback (`specs/spec.md:549-560`).
  - Must remain non-blocking (`specs/spec.md:209-225`).
- Repro + acceptance criteria:
  - Deterministic repro exists for the pre-fix failure path.
  - Successful paste-at-cursor must not emit `output_failed_partial`.
  - True paste failure path must still emit actionable failure feedback.
- Tasks:
  - [x] Add deterministic repro for failing paste path.
  - [x] Fix output/paste side-effect handling and classification.
  - [x] Add/adjust tests for successful + failed paste behavior.
  - [x] Verify `pnpm run test` and `pnpm run test:e2e` pass.

### #63 - [P0] Fix selection-target transformation execution errors
- Status: `DONE`
- Goal: Ensure selection-target transformation works when text exists and fails gracefully when absent.
- Constraints:
  - Must follow selection shortcut semantics (`specs/spec.md:171-179`).
  - Must keep concurrent responsiveness (`specs/spec.md:212-215`).
- Repro + acceptance criteria:
  - Deterministic repro exists for valid-selection failure before fix.
  - With selected text, transformation runs and returns expected success status.
  - Without selected text, user receives actionable no-selection feedback.
- Tasks:
  - [x] Trace selection retrieval to transform enqueue path.
  - [x] Fix valid-selection execution path.
  - [x] Keep no-selection actionable feedback path intact.
  - [x] Add/adjust unit/e2e coverage.

### #64 - [P0] Fix change-default-transformation shortcut no-op
- Status: `DONE`
- Goal: Ensure change-default shortcut updates default profile reliably and emits feedback.
- Constraints:
  - Must set default from active without running transformation (`specs/spec.md:170-178`).
  - Must preserve shortcut reliability expectations (`specs/spec.md:156-166`).
- Repro + acceptance criteria:
  - Deterministic repro exists for no-op shortcut path.
  - Triggering shortcut updates persisted default profile from active profile.
  - Command feedback confirms change without running transformation.
- Tasks:
  - [x] Fix command dispatch/action route.
  - [x] Ensure settings persistence updates correctly.
  - [x] Add positive and regression tests.

### #65 - [P0] Fix duplicate action sound playback
- Status: `DONE`
- Goal: Play each required sound exactly once per event.
- Constraints:
  - Must preserve required sound events (`specs/spec.md:190-197`).
  - Distinct success vs failure tones are a deferred `SHOULD` follow-up (`specs/spec.md:198`), not part of dedup scope.
- Repro + acceptance criteria:
  - Deterministic repro exists for duplicate sound trigger.
  - Each required sound event is emitted exactly once per user action.
  - No required event sound is lost while deduplicating.
- Tasks:
  - [x] Identify duplicate listeners/invocations.
  - [x] Deduplicate sound triggers in renderer/main flows.
  - [x] Add tests asserting single invocation per event.
- Follow-up:
  - Open a separate ticket to add distinct success/failure tones while keeping single-trigger behavior.

### #66 - [P0] Fix malformed Groq status handling and diagnostics
- Status: `CANCELED`
- Goal: Robustly parse provider status/errors and avoid misleading user-visible values.
- Cancellation reason: skipped per product direction update.
- Constraints:
  - Must keep explicit authentication/network feedback (`specs/spec.md:273-276`, `specs/spec.md:560`).
- Tasks:
  - [ ] Harden status parsing and classification logic.
  - [ ] Improve diagnostic messaging with provider context.
  - [ ] Add tests for malformed status/provider responses.

---

## P1 Tickets

### #67 - [P1] Add ElevenLabs scribe_v1 model support
- Status: `CANCELED`
- Goal: Add `scribe_v1` support while preserving allowlist and validation guarantees.
- Cancellation reason: skipped per product direction update.
- Constraints:
  - Must maintain STT provider/model requirements (`specs/spec.md:259-276`).
- Tasks:
  - [ ] Extend STT model allowlist/schema.
  - [ ] Update adapter/model routing.
  - [ ] Update settings/UI model options.
  - [ ] Add tests for supported and rejected combinations.

### #68 - [P1] Support per-provider STT/LLM base URL overrides
- Status: `DONE`
- Goal: Configure overrides per provider for STT/LLM.
- Constraints:
  - STT override rules (`specs/spec.md:270-272`).
  - LLM override rules (`specs/spec.md:308-310`).
- Tasks:
  - [x] Extend settings model for provider-level overrides.
  - [x] Update resolver/request routing.
  - [x] Update settings UI + validation.
  - [x] Add resolver and integration tests.

### #69 - [P1] Add structured error logging policy (main + renderer)
- Status: `DONE`
- Goal: Introduce consistent, redacted logs for actionable diagnostics.
- Constraints:
  - Must not leak API keys/secrets.
  - Must complement user-facing error clarity (`specs/spec.md:549-560`).
- Tasks:
  - [x] Define logging levels and redact rules.
  - [x] Add logging hooks in main/renderer critical paths.
  - [x] Add checks/tests for redaction and key error classes.

---

## P2 Tickets

### #70 - [P2] Resolve pick-and-run persistence spec conflict
- Status: `DONE`
- Goal: Resolve mismatch between user feedback and current normative behavior.
- Constraints:
  - Superseded by issue #85: pick-and-run is one-time, not persistent.
- Tasks:
  - [x] Record decision: persistent vs one-time behavior.
  - [x] If decision changes behavior, prepare spec update PR.
  - [x] Create/update implementation follow-up constraints for #71.
  - Note: issue #83 is invalid; issue #85 is authoritative.

### #71 - [P2] Dedicated transformation profile picker window UX
- Status: `DONE`
- Goal: Provide dedicated picker UX if approved by #70 decision.
- Constraints:
  - Depends on #70.
  - Must preserve shortcut responsiveness/non-blocking behavior (`specs/spec.md:179`, `specs/spec.md:209-225`).
- Tasks:
  - [x] Define UX flow and behavior contract.
  - [x] Implement picker window and command integration.
  - [x] Add e2e coverage for picker flow.

### #72 - [P2] Safe autosave for selected settings controls
- Status: `DONE`
- Goal: Reduce save friction while keeping reliability and clear feedback.
- Constraints:
  - Must preserve settings validation and actionable feedback behavior.
  - API keys/secrets are out of autosave scope in this ticket; credential autosave requires separate security review and explicit product approval.
  - Shortcut configuration and shortcut contract must remain unchanged in this ticket.
- Tasks:
  - [x] Limit autosave scope to non-secret controls only (for example: output toggles, non-secret provider options).
  - [x] Implement debounce + failure rollback/feedback.
  - [x] Add tests for timing, failure, and persistence.
  - [x] Add tests confirming secret fields are not persisted via autosave paths.
  - [x] Verify shortcuts page/config behavior remains as-is.

### #73 - [P2] Remove shortcut reference panel from Home
- Status: `DONE`
- Goal: Simplify Home UX without harming discoverability.
- Constraints:
  - Must keep required shortcut affordances discoverable.
- Tasks:
  - [x] Remove Home shortcut panel and adjust layout.
  - [x] Ensure guidance remains available from Settings/help surfaces.
  - [x] Update e2e assertions and docs snapshots.

---

## React Refactor Start (R0)

### #74 - [R0] React kickoff: bootstrap renderer root with parity
- Status: `DONE`
- Goal: Introduce React root with zero behavior changes.
- Constraints:
  - No feature changes mixed in.
  - Must keep full test/e2e parity green.
- Coexistence architecture contract (required deliverable):
  - Define React/vanilla ownership boundary per screen/DOM root.
  - Keep one event owner per interaction path (no double-binding).
  - Route shared command/state updates through existing application services, not duplicate React-local side-effect wiring.
  - Document teardown sequence for replacing vanilla-managed Home mount points.
- Rollback requirement:
  - React renderer mount path must be gated (load-path or feature flag) so fallback to vanilla renderer is one config/code switch.
  - PR description must include explicit rollback steps.
- Tasks:
  - [x] Add React bootstrap/build config with pinned versions and compatibility notes.
  - [x] Set up React component test infrastructure (runner + jsdom/DOM environment + basic render smoke test) without mixing feature migration.
  - [x] Add parity checkpoint list for shortcuts, picker trigger path, status badges, and sound hooks before Home migration begins.
  - [x] Document coexistence boundary and event ownership for migration period.
  - [x] Mount root behind rollback-safe gate and retain existing style baseline.
  - [x] Verify parity (`typecheck`, `test`, `test:e2e`).

### #75 - [R0] React phase 1: migrate Home page with behavior parity
- Status: `DONE`
- Goal: Migrate Home rendering/actions to React components only.
- Constraints:
  - Depends on #74.
  - Preserve e2e selectors/contracts or migrate tests in same PR.
- Tasks:
  - [x] Split migration into explicit slices in PR checklist:
    - Shell/layout and static sections.
    - Recording control card behavior.
    - Transform action card behavior.
    - Status badge/toast/error states.
    - Disabled-state explanations and command affordances.
  - [x] Validate each slice against frozen behavior contracts for Home/Settings surfaces before advancing to next slice.
  - [x] Introduce Home hooks/services parity mapping for command/state flows.
  - [x] Preserve command/toast/status behavior for each slice before moving to next.
  - [x] Preserve sound and shortcut feedback semantics across migrated and non-migrated UI seams.
  - [x] Migrate or preserve e2e contracts in same PR with per-slice assertions.
  - [x] Run full regression suite and fix parity deltas.

### #76 - [R1] React phase 2: migrate remaining Settings forms to React
- Status: `WIP`
- Goal: Migrate remaining Settings form sections to React while removing duplicate legacy DOM event wiring.
- Constraints:
  - Keep API key React ownership from #75 intact and do not reintroduce legacy compatibility mode.
  - Preserve current Settings behavior contracts and e2e selectors unless migrated in the same PR.
  - Keep one event owner per interaction path during coexistence.
- Tasks:
  - [x] Split Settings migration into explicit slices:
    - Recording controls + refresh audio sources affordance. (Done in this PR slice)
    - Transformation controls + preset actions. (Done in this PR slice)
    - Output toggle matrix + defaults restore actions. (Done in this PR slice)
  - [ ] For each slice, move render + event ownership into React component(s) and delete equivalent legacy listeners.
  - [ ] Add/adjust component tests and e2e assertions per migrated slice.
  - [ ] Run `pnpm run typecheck`, `pnpm run test`, `pnpm run test:e2e`.

---

## Execution Order
1. Complete P0 tickets (#62-#65). Status: `DONE`.
2. Complete P1 tickets (#68-#69). Status: `DONE`.
3. Resolve P2 decision ticket #70 before implementing #71. Status: `DONE`.
4. Execute remaining P2 tickets (#71-#73) after product confirmation. Status: `DONE`.
5. Start React only after P0 is complete and stable and pre-phase risk checklist is green, beginning with #74 then #75. Current state: `#74 DONE`, `#75 DONE`.
6. Continue React migration with Settings-focused slice #76. Current state: `#76 WIP`.

## Stability Gate Before React Work (#74/#75)
- All active P0 tickets (#62-#65) are `DONE`.
- `pnpm run typecheck`, `pnpm run test`, and `pnpm run test:e2e` are green on main branch for 2 consecutive CI runs.
- No open P0 regression issue labeled against current main commit range.
- `#70` decision is `DONE`, and Home/Settings contracts impacted by `#71-#73` are frozen for the duration of `#74/#75`.

## CI Optimization Addendum (E2E)
- Default e2e CI path runs on macOS for pull request/push validation.
- macOS e2e path on pull request/push is scoped to smoke coverage by default.
- Live provider e2e checks run only on explicit manual request with required secrets configured.
- Workflow concurrency must cancel redundant runs for the same workflow/ref.
- Dependency caching must remain enabled to reduce repetitive CI runtime.

## Definition of Done (applies to every ticket)
- [ ] Ticket scope only (one ticket = one PR).
- [ ] Spec constraints explicitly validated in PR description.
- [ ] New/updated tests included.
- [ ] `pnpm run typecheck`, `pnpm run test` pass.
- [ ] `pnpm run test:e2e` pass (or documented, approved skip condition).
