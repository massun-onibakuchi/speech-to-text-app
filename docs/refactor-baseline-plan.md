# Refactor Plan: Baseline Architecture First, Then Components

## 1. Goal and Success Criteria
- Deliver a spec-aligned architecture where recording, transcription, transformation, and output are routed through explicit orchestration boundaries.
- Build baseline skeleton first (routing seams, request snapshots, queue lanes, output coordinator contracts), then migrate components incrementally.
- Preserve current behavior only where it does not conflict with normative MUST requirements in `specs/spec.md`; when conflict exists, spec compliance takes precedence and the behavior change must be called out in phase acceptance notes.
- Keep the app shippable after each phase with explicit entry/exit gates.

## 2. Gap Analysis (Spec vs Current Code)

### A. Core architecture and boundaries
- Gap: no explicit `ModeRouter` / mode-aware entrypoint; runtime path is direct `RecordingOrchestrator -> JobQueueService -> ProcessingOrchestrator`.
- Gap: no isolated ordered output commit stage; output side effects are applied inline in `ProcessingOrchestrator`.
- Gap: transformation shortcut jobs execute directly, not via dedicated transformation worker path with bound snapshots.

### B. Settings and schema compliance
- Gap: settings schema in `src/shared/domain.ts` diverges from required shape (`stt`, `llm`, `processing.mode`, `transformationProfiles`).
- Gap: `defaultPresetId` is non-nullable; spec requires nullable `defaultProfileId`.
- Gap: `baseUrlOverride` fields are missing from runtime adapter inputs.
- Gap: `SettingsService` is in-memory only; restart persistence and migration are missing.

### C. Shortcuts and transformation semantics
- Gap: missing `runTransformationOnSelection` shortcut and IPC path.
- Gap: `pickAndRunTransformation` is cyclic-next behavior, not explicit user-picked behavior.
- Gap: default-profile-null skip semantics are not implemented.
- Gap: per-request snapshot binding is not modeled as first-class immutable request objects.

### D. Provider/adapters and validation
- Gap: STT/LLM adapters do not accept or route `baseUrlOverride`.
- Gap: explicit preflight blocking for unset provider/model is not fully enforced by contract.
- Gap: multi-provider boundary for LLM is not explicit in registry shape (UI remains Google-only by requirement).

### E. UI compliance
- Gap: Home includes Session Activity and Processing History; v1 UI requires operational Home only.
- Gap: output matrix UI exists but must be removed from v1 UI.
- Gap: required Home/Settings control semantics and disabled-state explanations are incomplete.

### F. Notifications/sound/device requirements
- Gap: required sound notifications are not implemented as explicit service.
- Gap: audio input discovery is placeholder-only and lacks fallback/warning semantics.

## 3. Phase Plan (Chunked Work)

### Phase 0: Baseline Architecture Skeleton (No User-Visible Change)
Scope:
- Introduce contracts, routing seams, and adapter shims only.
- No persisted schema change and no intended user-visible behavior change.

Steps:
1. Add `ModeRouter` and `ExecutionContext` contracts in main process.
2. Add `ProcessingModeSource` adapter so `ModeRouter` can read legacy mode source now and canonical settings later without router rewrite.
3. Add immutable request snapshot types:
   - `CaptureRequestSnapshot`
   - `TransformationRequestSnapshot`
4. Split execution lanes:
   - `CaptureQueue` lane (FIFO capture jobs)
   - `TransformQueue` lane (independent transformation jobs)
5. Add `OrderedOutputCoordinator` interface and serial default implementation.
6. Add `ClipboardStatePolicy` interface stub for forward compatibility.
7. Add `SoundService` interface + event wiring points (initial no-op impl).
8. Add `SettingsRepository` interface with in-memory adapter only.

Phase 0 DoD:
- `npm test` passes with no net test failures.
- New contract tests verify mode routing, snapshot immutability post-enqueue, and queue-lane isolation.
- Smoke flows pass: start/stop recording, cancel recording, default transformation shortcut.

### Phase 1: Canonical Settings Schema + Migration Safety
Steps:
1. Define canonical schema:
   - `settings.recording`, `settings.processing`, `settings.stt`, `settings.llm`, `settings.output`
   - `transformationProfiles: { defaultProfileId: string | null, activeProfileId: string, profiles[] }`
2. Enforce invariants:
   - `activeProfileId` must reference existing profile.
   - `defaultProfileId` is nullable, and if non-null must reference existing profile.
3. Implement versioned, idempotent migrator from legacy schema.
4. Add file-backed `SettingsRepository` with:
   - atomic temp-write + rename
   - pre-migration backup
   - rollback to last-known-good on parse/validation failure
5. Add `schemaVersion` gates and corruption handling.
6. Add shortcut validation: invalid accelerators and conflicting keybinds rejected with actionable feedback.
7. Keep API keys out of plain settings payload; persist STT/LLM credentials via secure secret storage (`SecretStore`/keychain-backed abstraction) with explicit read/write contract tests.

Phase 1 DoD:
- Legacy fixtures migrate correctly and remain readable after repeated migrations.
- Restart persistence works and rollback path is covered by tests.
- Phase 1 soak gate: pass restart migration corpus before Phase 2 starts.

### Phase 2: Recording/Processing Pipeline Compliance
Steps:
1. Route finalized capture through `CaptureRequestSnapshot` enqueue path.
2. Enforce capture command semantics:
   - `stop` enqueues exactly one job.
   - `cancel` enqueues none.
3. Formalize processing stages:
   - `TranscriptionStage`
   - optional `TransformationStage`
   - `OutputCommitStage` (via `OrderedOutputCoordinator`)
4. Enforce runtime output action matrix in default mode:
   - copy/paste four combinations exactly per spec.
5. Surface terminal statuses through shared enum only:
   - `succeeded`, `capture_failed`, `transcription_failed`, `transformation_failed`, `output_failed_partial`.
6. Add minimal preflight guards now (do not defer):
   - missing provider/model/key blocks execution with actionable errors.
7. Keep transformation shortcut execution non-blocking with active recording.

Phase 2 DoD:
- Back-to-back capture reliability retained.
- Queue invariants covered: exactly-once commit, deterministic commit order within lane policy.
- Blocked execution errors are actionable and tested.

### Phase 3: Full Shortcut Semantics and Dispatch Reliability
Steps:
1. Implement shortcut command set:
   - `runDefaultTransformation`
   - `pickAndRunTransformation`
   - `changeDefaultTransformation`
   - `runTransformationOnSelection`
2. Add `ShortcutContextResolver` for `default-target`, `active-target`, `selection-target`.
3. Enforce exact semantics:
   - `runDefaultTransformation`: skip non-error when `defaultProfileId` is `null`.
   - `pickAndRunTransformation`: explicit user profile pick, update active profile, then execute.
   - `changeDefaultTransformation`: set default to active profile without execution.
   - `runTransformationOnSelection`: actionable failure when no selected text.
4. Guarantee in-flight request immutability:
   - profile/source snapshots bound at enqueue time and unaffected by later setting changes.
5. Global shortcut lifecycle compliance:
   - persist keybind changes across restart/login.
   - live re-register without app restart.
   - if registration fails, UI command execution remains available and user gets actionable feedback.

Phase 3 DoD:
- Concurrent shortcut requests preserve per-request snapshot isolation.
- Shortcut lifecycle behavior passes automated tests and smoke checks.

### Phase 4: Provider Contracts and Endpoint Overrides
Steps:
1. Extend STT/LLM request contracts with `baseUrlOverride`.
2. Route adapter calls to override endpoint when configured.
3. Preserve explicit provider/model choice rules:
   - no silent provider/model auto-switching.
   - unsupported model/provider rejected pre-network.
4. Keep LLM architecture multi-provider-capable; keep v1 UI exposure Google-only.
5. Ensure STT provider requirements remain Groq + ElevenLabs.
6. Add canonical settings fields for optional endpoint override:
   - `settings.stt.baseUrlOverride`
   - `settings.llm.baseUrlOverride`

Phase 4 DoD:
- Override routing and preflight rejection behavior fully test-covered.

### Phase 5: UI Alignment (Home + Settings)
Steps:
1. Enforce IA/navigation:
   - top-level `Home` and `Settings`
   - launch default route = `Home`
   - Settings reachable even when recording is blocked
2. Home page compliance:
   - Recording Control Card with command actions, blocked reason, next step, and state badge (`Idle/Recording/Busy/Error`).
   - Transform Action Card with prerequisites, disabled explanation, link to Settings, last status summary.
   - button and shortcut trigger parity for composite transform action.
3. Remove Session Activity/Processing History from Home and remove output matrix UI from Settings.
4. Settings compliance:
   - API key fields for Groq/ElevenLabs/Google with save/test/masking states.
   - STT and LLM base URL override inputs (optional) with clear validation and reset-to-default control.
   - transformation profile CRUD with default/active controls and prompt persistence.
   - shortcut editors including selection transform action.
   - recording/audio source settings; FFmpeg text informational-only and explicitly deferred.
5. Cross-cutting UI behavior:
   - toast system for `error/success/info`.
   - all blocked/disabled controls provide reason + next step + deep-link where applicable.

Phase 5 DoD:
- UI checklist in `specs/ui-components-requirements.md` satisfied.
- No blank disabled panels; no unexplained disabled controls.

### Phase 6: Device/Sound/Observability Hardening
Steps:
1. Implement real audio device discovery and default fallback with warning.
2. Implement concrete `SoundService` with required events:
   - recording started/stopped/cancelled
   - transformation completion success/failure
3. Standardize actionable error mapping (provider context + next step).
4. Add dev-only diagnostics surface/log bundle during rollout; remove or gate before release if no longer needed.

Phase 6 DoD:
- Manual conformance checklist from spec section 10.2 passes.
- Sound/device behavior verified by tests and manual checks.

## 4. Execution Order and Release Gates
1. PR-A: Phase 0 contracts (`ModeRouter`, snapshots, queue lanes, coordinator interfaces).
2. PR-B: Phase 1 schema/migration/persistence.
3. PR-C: Phase 2 pipeline stage refactor + output matrix runtime enforcement.
4. PR-D: Phase 3 shortcut semantics + global shortcut lifecycle compliance.
5. PR-E: Phase 4 provider/override compliance.
6. PR-F: Phase 5 UI alignment.
7. PR-G: Phase 6 hardening + final conformance sweep.

Gate template (required per PR):
- Automated tests for changed scope pass.
- Regression smoke paths pass.
- Stop-the-line criteria absent:
  - migration rollback triggered unexpectedly
  - queue ordering nondeterminism
  - IPC contract break between main/renderer.

## 5. Risk Register and Mitigations
- Migration corruption risk:
  - Mitigate with versioned idempotent migrator, backup + rollback, restart fixture corpus.
- Concurrency/race risk after queue split:
  - Mitigate with invariants (snapshot immutability, exactly-once commit, lane-order guarantees) and stress tests.
- Shortcut regression risk:
  - Mitigate with lifecycle tests (persist/re-register/failure fallback) and explicit semantic matrix tests.
- Observability gap during UI simplification:
  - Mitigate with temporary dev-only diagnostics until hardening phase completes.

## 6. Required Test Traceability (Spec 10.1)
1. Profiles CRUD + default/active enforcement: Phase 1 + 3.
2. STT allowlist rejection: Phase 4.
3. LLM allowlist rejection: Phase 4.
4. Recording command shortcut dispatch: Phase 3.
5. Sound triggers (start/stop/cancel/transform complete): Phase 6.
6. Audio device discovery with multiple options: Phase 6.
7. Back-to-back reliability without dropped jobs: Phase 2.
8. Non-blocking recording commands during processing: Phase 2 + 3.
9. Transformation shortcut behavior matrix: Phase 3.
10. STT pre-configuration validation (unset provider/model): Phase 2 + 4.
11. API key validation blocking (STT/LLM): Phase 2 + 4 + 5.
12. Base URL override routing (STT/LLM): Phase 4.
13. Capture finalization auto-enqueue/auto-process: Phase 2.

## 7. Spec Reconciliation Decision
- `specs/user-flow.md` narrative says processed text remains visible in app history/view, while `specs/ui-components-requirements.md` requires v1 UI removal of session activity/history surfaces.
- Planning decision for this execution track:
  - treat `specs/ui-components-requirements.md` as the authoritative v1 UI contract for visible screens,
  - keep persisted backend history records for diagnostics/migration safety,
  - do not ship user-facing history/session activity panels in v1 unless the spec owner revises the UI requirements.
