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
- Gap: `SettingsService` uses `private static settings` (module-level mutable state shared across all instances); must be converted to instance state before repository migration.

### C. Shortcuts and transformation semantics
- Gap: missing `runTransformationOnSelection` shortcut and IPC path.
- Gap: `pickAndRunTransformation` is cyclic-next behavior, not explicit user-picked behavior; requires new profile picker UI surface.
- Gap: default-profile-null skip semantics are not implemented.
- Gap: per-request snapshot binding is not modeled as first-class immutable request objects.
- Gap: `runTransformationOnSelection` requires reading cursor-selected text from frontmost app — no implementation exists; approach must be spiked (see Uncertainty Hotspots).

### D. Provider/adapters and validation
- Gap: STT/LLM adapters do not accept or route `baseUrlOverride`.
- Gap: explicit preflight blocking for unset provider/model is not fully enforced by contract.
- Gap: multi-provider boundary for LLM is not explicit in registry shape (UI remains Google-only by requirement).
- Gap: `GeminiTransformationAdapter` silently falls back from configured model to `gemini-2.5-flash` on HTTP 404; spec requires no silent failover (spec 5.2).

### E. UI compliance
- Gap: Home includes Session Activity and Processing History; v1 UI requires operational Home only.
- Gap: output matrix UI exists but must be removed from v1 UI; copy/paste toggles must be exposed in Settings.
- Gap: required Home/Settings control semantics and disabled-state explanations are incomplete.

### F. Notifications/sound/device requirements
- Gap: required sound notifications are not implemented as explicit service.
- Gap: audio input discovery is placeholder-only and lacks fallback/warning semantics.

### G. Spec items requiring explicit plan coverage (compliance review findings)
- Gap: transformation failure must keep original transcript available for user access (spec 6.2 L316) — not explicitly enforced.
- Gap: `toggleRecording` semantics (start if idle, stop if recording) not explicitly tested (spec 4.1 L152).
- Gap: post-network API authentication failures not distinguished from preflight validation failures (spec 5.2 L275).
- Gap: shortcut registration must happen in main process not explicitly stated (spec 4.2 L160).

## 3. Phase Plan (Chunked Work)

### Pre-Phase Actions (Before Phase 0A Starts)
These actions establish prerequisites and reduce risk for the main phase sequence:
1. Add at least one IPC round-trip integration test to the existing suite to establish the pattern before refactor begins. This validates the IPC boundary is testable and creates a template for per-phase integration tests.
2. Set up shared test infrastructure: snapshot factories, queue test harnesses, and settings fixture builders. These will be needed across multiple phases and should exist before Phase 0A.
3. Spike `runTransformationOnSelection` OS text selection mechanism (see H1) — required before Phase 3A.
4. Define `pickAndRunTransformation` profile picker UX modality and IPC contract (see H2) — required before Phase 3A.

### Phase 0A: Routing and Request Contracts
Scope:
- Introduce mode routing and immutable request snapshot types.
- No persisted schema change and no intended user-visible behavior change.

Steps:
1. Add `ModeRouter` and `ExecutionContext` contracts in main process.
2. Add `ProcessingModeSource` adapter so `ModeRouter` can read legacy mode source now and canonical settings later without router rewrite.
3. Add immutable request snapshot types (designed for concurrent shortcut isolation from the start):
   - `CaptureRequestSnapshot`
   - `TransformationRequestSnapshot`

Phase 0A DoD:
- `npm test` passes with no net test failures.
- Mode routing contract tests pass.
- Snapshot types compile with immutability constraints; snapshot binding contract tests verify post-enqueue immutability.

### Phase 0B: Queue Lanes, Output Coordination, and Service Stubs
Scope:
- Split execution lanes and add coordinator/service interfaces.

Steps:
1. Split execution lanes:
   - `CaptureQueue` lane (FIFO capture jobs)
   - `TransformQueue` lane (independent transformation jobs)
2. Add `OrderedOutputCoordinator` interface and serial default implementation.
3. Add `ClipboardStatePolicy` interface stub for forward compatibility.
4. Add `SoundService` interface + event wiring points (initial no-op impl; define event surface for all required events: recording started/stopped/cancelled, transformation success/failure).
5. Add `SettingsRepository` interface with in-memory adapter only.

Phase 0B DoD:
- Queue-lane isolation tests pass.
- Smoke flows pass: start/stop recording, cancel recording, default transformation shortcut.

Dependency note: Phase 0A snapshot types must be designed with Phase 3A concurrent shortcut isolation in mind.

### Phase 1A: Canonical Settings Schema + Validation
Steps:
1. Define canonical schema:
   - `settings.recording`, `settings.processing`, `settings.stt`, `settings.llm`, `settings.output`
   - `transformationProfiles: { defaultProfileId: string | null, activeProfileId: string, profiles[] }`
   - Include `baseUrlOverride` fields in schema shape now (wired in Phase 4) to avoid later schema migration.
2. Enforce invariants:
   - `activeProfileId` must reference existing profile.
   - `defaultProfileId` is nullable, and if non-null must reference existing profile.
3. Add shortcut validation: invalid accelerators and conflicting keybinds rejected with actionable feedback.
4. Convert `SettingsService` from static mutable state to instance state.

Phase 1A DoD:
- Schema types compile; validation rejects invalid states.
- Existing tests updated for new type shape.

### Phase 1B: File-Backed Persistence + Migration
Steps:
1. Implement versioned, idempotent migrator from legacy schema.
   - Migration must map `defaultPresetId` (non-nullable) to `defaultProfileId` (nullable) with explicit value-preservation: existing value becomes `defaultProfileId`, not `null`.
2. Add file-backed `SettingsRepository` with:
   - atomic temp-write + rename
   - pre-migration backup
   - rollback to last-known-good on parse/validation failure
3. Add `schemaVersion` gates and corruption handling.

Phase 1B DoD:
- Legacy fixtures migrate correctly and remain readable after repeated migrations.
- Restart persistence works and rollback path is covered by tests.
- Soak gate: pass restart migration corpus before Phase 2 starts.

Dependency note: depends on Phase 0B `SettingsRepository` interface and Phase 1A canonical schema.

### Phase 1C: Secure Secret Storage
Steps:
1. Keep API keys out of plain settings payload; persist STT/LLM credentials via secure secret storage (`SecretStore`/keychain-backed abstraction) with explicit read/write contract tests.

Phase 1C DoD:
- API keys stored/retrieved via keychain abstraction.
- Plain settings payload does not contain secrets.
- Contract tests pass.

### Phase 2A: Pipeline Stage Refactor
Steps:
1. Route finalized capture through `CaptureRequestSnapshot` enqueue path.
2. Enforce capture command semantics:
   - `stop` enqueues exactly one job.
   - `cancel` enqueues none.
   - `toggleRecording` starts if idle, stops if recording (spec 4.1 L152).
3. Formalize processing stages:
   - `TranscriptionStage`
   - optional `TransformationStage` — on transformation failure, original transcript must be preserved and remain available for output (spec 6.2 L316).
   - `OutputCommitStage` (via `OrderedOutputCoordinator`)
4. Keep transformation shortcut execution non-blocking with active recording.

Phase 2A DoD:
- Back-to-back capture reliability retained; pipeline stages independently testable.
- `toggleRecording` semantics tested.
- Transformation failure preserves original transcript (tested).

### Phase 2B: Output Matrix + Preflight Guards
Steps:
1. Enforce runtime output action matrix in default mode:
   - copy/paste four combinations exactly per spec.
2. Surface terminal statuses through shared enum only:
   - `succeeded`, `capture_failed`, `transcription_failed`, `transformation_failed`, `output_failed_partial`.
3. Add minimal preflight guards now (do not defer):
   - missing provider/model/key blocks execution with actionable errors (pre-network validation).
   - post-network API authentication failures emit explicit user-facing error distinct from preflight failures (spec 5.2 L275).

Phase 2B DoD:
- Output matrix tested for all four combinations.
- Blocked execution errors are actionable and tested.
- Pre-network vs post-network error paths are distinguishable.

Dependency note: preflight guards for missing API key depend on Phase 1C `SecretStore`.
Dependency note: output matrix runtime enforcement (Phase 2B) is functionally coupled with Settings UI copy/paste toggles (Phase 5B); if Phase 2B changes how output settings are consumed, Phase 5B UI must be aware.

### Phase 3A: Core Shortcut Dispatch
Steps:
1. Implement shortcut command set:
   - `runDefaultTransformation`
   - `pickAndRunTransformation`
   - `changeDefaultTransformation`
   - `runTransformationOnSelection`
2. Add `ShortcutContextResolver` for `default-target`, `active-target`, `selection-target`.
3. Enforce exact semantics:
   - `runDefaultTransformation`: skip non-error when `defaultProfileId` is `null`.
   - `pickAndRunTransformation`: explicit user profile pick, update `activeProfileId`, then execute using that profile.
   - `changeDefaultTransformation`: set `defaultProfileId` to current `activeProfileId` without execution.
   - `runTransformationOnSelection`: resolve profile from `activeProfileId` and selection text source; actionable failure when no selected text.
4. Shortcut registration must happen in main process (spec 4.2 L160).

Phase 3A DoD:
- Each shortcut command semantics tested per spec 4.2.
- `null` `defaultProfileId` skip behavior verified.

Pre-requisite: spike `runTransformationOnSelection` OS text selection mechanism before starting (see Uncertainty Hotspots H1).
Pre-requisite: define `pickAndRunTransformation` profile picker UX modality and IPC contract (see Uncertainty Hotspots H2).
Dependency note: Phase 3A's IPC contract for `runTransformationOnSelection` must align with Phase 5B's shortcut editor UI; coordinate IPC channel definitions early.

### Phase 3B: Snapshot Immutability and Concurrent Isolation
Steps:
1. Per-request snapshot binding at enqueue time; concurrent shortcut isolation.
2. Profile updates from `pickAndRunTransformation` take effect for subsequent requests only; in-flight requests are not rewritten.

Phase 3B DoD:
- Concurrent shortcut requests preserve per-request snapshot isolation.
- Tests prove later setting changes do not affect in-flight requests.

Ordering note: Phase 3B could theoretically move earlier (right after Phase 0A) to ensure snapshot isolation is designed into the enqueue contract from the start. However, this plan mitigates that risk by requiring Phase 0A snapshot types to be "designed for concurrent shortcut isolation from the start" (Phase 0A step 3). If Phase 0A's snapshot types prove insufficient during Phase 3B, revise Phase 0 contracts under the contract review gate.

### Phase 3C: Shortcut Lifecycle + Documentation
Steps:
1. Global shortcut lifecycle compliance:
   - persist keybind changes across restart/login.
   - live re-register without app restart (use incremental unregister/register to avoid gap window where all shortcuts are unregistered).
   - if registration fails, UI command execution remains available and user gets actionable feedback.
2. Update `specs/user-flow.md` to cover shortcut flows identified in PR review:
   - Add `cancelRecording` flow (spec 4.1: cancel stops capture, enqueues no job, produces no output).
   - Add standalone `runDefaultTransformation` flow (spec 4.2: including null-`defaultProfileId` skip behavior).
   - Add `runTransformationOnSelection` flow (spec 4.2: cursor-selected text source, distinct from clipboard).
   - Add `changeDefaultTransformation` flow (spec 4.2: set default without execution).
   - Update Flow 5 to reference `pickAndRunTransformation` terminology and `activeProfileId` update semantics.
   - Add sound notification cues to relevant flow steps (spec 4.3).
   - Add cross-flow guarantee for snapshot immutability (spec 4.2: profile binding at enqueue time).

Phase 3C DoD:
- Shortcut lifecycle passes automated tests.
- User-flow documentation covers all identified flows.

### Phase 4: Provider Contracts and Endpoint Overrides
Steps:
1. Extend STT/LLM request contracts with `baseUrlOverride`.
2. Route adapter calls to override endpoint when configured.
3. Preserve explicit provider/model choice rules:
   - no silent provider/model auto-switching.
   - unsupported model/provider rejected pre-network.
4. Remove Gemini silent model fallback: migrate existing profiles using deprecated model to fallback model, then remove silent fallback code. Surface change to users via one-time toast.
5. Keep LLM architecture multi-provider-capable; keep v1 UI exposure Google-only.
6. Ensure STT provider requirements remain Groq + ElevenLabs.
7. Add canonical settings fields for optional endpoint override:
   - `settings.stt.baseUrlOverride`
   - `settings.llm.baseUrlOverride`

Phase 4 DoD:
- Override routing and preflight rejection behavior fully test-covered.
- Silent model fallback removed and migration tested.

Note: Phase 4 and Phase 3C have no dependency on each other and can be developed in parallel.

### Phase 5A: Navigation + Home Page
Steps:
1. Enforce IA/navigation:
   - top-level `Home` and `Settings`
   - launch default route = `Home`
   - Settings reachable even when recording is blocked
2. Home page compliance:
   - Recording Control Card with command actions, blocked reason, next step, and state badge (`Idle/Recording/Busy/Error`).
   - Transform Action Card with prerequisites, disabled explanation, link to Settings, last status summary.
   - button and shortcut trigger parity for composite transform action.
3. Remove Session Activity/Processing History from Home.

Phase 5A DoD:
- Home page renders correct cards; no legacy panels visible; navigation works.

### Phase 5B: Settings Page
Steps:
1. API key fields for Groq/ElevenLabs/Google with save/test/masking states.
2. STT and LLM base URL override inputs (optional) with clear validation and reset-to-default control.
3. Transformation profile CRUD with default/active controls and prompt persistence.
4. Shortcut editors including selection transform action.
5. Recording/audio source settings; FFmpeg text informational-only and explicitly deferred.
6. Output copy/paste toggles for transcript and transformed output exposed in Settings.

Phase 5B DoD:
- All Settings fields functional; output copy/paste toggles exposed; profile CRUD works.

Note: Phase 5A and Phase 5B can be developed in parallel after Phase 3A is complete.

### Phase 5C: Cross-Cutting UI Behavior
Steps:
1. Toast system for `error/success/info` with specific triggers:
   - command start/stop/cancel outcomes
   - transformation completion outcomes (success and failure)
   - validation and network/API failures
2. All blocked/disabled controls provide reason + next step + deep-link where applicable.
3. Remove output matrix UI from Settings (replaced by copy/paste toggles in Phase 5B).

Phase 5C DoD:
- Toasts fire for all required events per spec section 9.
- No blank disabled panels; no unexplained disabled controls.

### Phase 6: Device/Sound/Observability Hardening
Steps:
1. Implement real audio device discovery and default fallback with warning.
2. Implement concrete `SoundService` with required events:
   - recording started/stopped/cancelled
   - transformation completion success/failure
3. Standardize actionable error mapping (provider context + next step); distinguish pre-network preflight errors from post-network authentication/runtime errors.
4. Add dev-only diagnostics surface/log bundle during rollout; remove or gate before release if no longer needed.

Phase 6 DoD:
- Manual conformance checklist from spec section 10.2 passes.
- Sound/device behavior verified by tests and manual checks.

## 4. Execution Order and Release Gates

0. Pre-phase: establish IPC integration test pattern + shared test infrastructure.
1. PR-A: Phase 0A (routing and request contracts).
2. PR-B: Phase 0B (queue lanes, output coordinator, service stubs).
3. PR-C: Phase 1A (canonical schema + validation).
4. PR-D: Phase 1B (file-backed persistence + migration).
5. PR-E: Phase 1C (secure secret storage).
6. PR-F: Phase 2A (pipeline stage refactor).
7. PR-G: Phase 2B (output matrix + preflight guards).
8. PR-H: Phase 3A (core shortcut dispatch).
9. PR-I: Phase 3B (snapshot immutability + concurrent isolation).
10. PR-J: Phase 3C (shortcut lifecycle + documentation) — parallelizable with PR-K.
11. PR-K: Phase 4 (provider contracts + endpoint overrides) — parallelizable with PR-J.
12. PR-L: Phase 5A (navigation + Home page) — parallelizable with PR-M.
13. PR-M: Phase 5B (Settings page) — parallelizable with PR-L.
14. PR-N: Phase 5C (cross-cutting UI behavior).
15. PR-O: Phase 6 (hardening + final conformance sweep).

Contract review gate (between PR-B and PR-F):
- Before Phase 2A starts, validate Phase 0 contracts (ModeRouter, OrderedOutputCoordinator, queue lanes, snapshot types) against the planned Phase 2A stage decomposition.
- If contracts need revision, amend Phase 0 before proceeding.

Gate template (required per PR):
- Automated tests for changed scope pass.
- Regression smoke paths pass.
- Stop-the-line criteria absent:
  - migration rollback triggered unexpectedly
  - queue ordering nondeterminism
  - IPC contract break between main/renderer.

## 5. Risk Register and Mitigations

### Previously identified risks (updated)
- Migration corruption risk (HIGH):
  - Mitigate with versioned idempotent migrator, backup + rollback, restart fixture corpus.
  - Note: migration is deep structural reshaping (`transcription` -> `stt`, `presets` -> `profiles`, non-nullable -> nullable `defaultProfileId`); not just field renames.
- Concurrency/race risk after queue split (HIGH):
  - Mitigate with invariants (snapshot immutability, exactly-once commit, lane-order guarantees) and stress tests.
  - Note: need concurrency test infrastructure (scheduler controls) — not yet available.
- Shortcut regression risk (MEDIUM):
  - Mitigate with lifecycle tests (persist/re-register/failure fallback) and explicit semantic matrix tests.
  - Note: does not cover `runTransformationOnSelection` which has unknown implementation requirements.
- Observability gap during UI simplification (LOW):
  - Mitigate with temporary dev-only diagnostics until hardening phase completes.

### Newly identified risks

- IPC contract breakage during schema migration (HIGH):
  - `Settings` type is shared across main/renderer via `IpcApi` interface. Changing it requires updating all consumers atomically.
  - Mitigate: add IPC round-trip integration test as part of Phase 1A DoD. Consider typed IPC schema version and backward-compatible adapter layer at IPC boundary.

- `pickAndRunTransformation` requires new profile picker UI (HIGH):
  - Current implementation is cyclic-next; spec requires explicit user pick. This needs a new UI surface (modal/menu) and new IPC channels.
  - Mitigate: define picker UX modality and IPC contract before Phase 3A starts. If picker is renderer-side modal, scope UI component in Phase 5B; if native menu, scope in Phase 3A.

- `runTransformationOnSelection` requires OS text selection access (HIGH):
  - No existing code for reading selected text from arbitrary frontmost app. Approaches include Accessibility API, copy-to-clipboard-first, or AppleScript bridge.
  - Mitigate: spike the mechanism before Phase 3A starts. Document approach, limitations, and required permissions.

- Gemini silent model fallback removal (MEDIUM):
  - Current adapter silently falls back to `gemini-2.5-flash` on 404; both orchestrators rely on `persistMigratedPresetModel` for this.
  - Mitigate: Phase 4 adds migration step to update affected profiles, then removes fallback. Surface change via one-time toast.

- Static mutable state in SettingsService (MEDIUM):
  - `private static settings` means all instances share module-level mutable state. Repository migration could introduce divergent read paths.
  - Mitigate: Phase 1A converts to instance state before repository integration.

- Phase 0 queue lanes may be premature abstractions (MEDIUM):
  - Queue lanes without Phase 2 stage decomposition may be cosmetic or create intermediate non-compliant states.
  - Mitigate: Phase 0B queue lanes must have concrete acceptance criteria demonstrating correctness when wired to Phase 2A stages.

- No integration tests (HIGH):
  - All 89 existing tests are unit-level with mocked dependencies. No tests exercise full IPC-to-adapter path.
  - Mitigate: add at least one IPC round-trip integration test per phase. Extend existing `@playwright/test` infrastructure.

- Phase 0 contracts may not compose correctly with Phase 2 implementation (MEDIUM):
  - If Phase 0 interface design (ModeRouter, OrderedOutputCoordinator, queue lanes) proves wrong during Phase 2, both phases need revision.
  - Mitigate: add an explicit contract review gate between Phase 0B and Phase 2A. Before Phase 2A starts, validate Phase 0 contracts against the planned Phase 2A stage decomposition with a lightweight design review. If contracts need revision, amend Phase 0 before proceeding.

- `globalShortcut.unregisterAll()` creates gap window (LOW):
  - Between unregisterAll() and re-registration, all shortcuts are unavailable.
  - Mitigate: Phase 3C uses incremental per-accelerator unregister/register instead of bulk unregister-then-reregister.

## 6. Uncertainty Hotspots

### H1. `runTransformationOnSelection` text selection mechanism
No existing code or plan detail addresses reading selected text from an arbitrary frontmost app on macOS. Common approaches:
- `Cmd+C` to clipboard then read clipboard (destructive: overwrites clipboard).
- Accessibility API via `AXUIElementCopyAttributeValue` for `kAXSelectedTextAttribute` (requires native module or AppleScript bridge; requires macOS Accessibility permission).
- No reliable approach exists for all applications.

**Action required before Phase 3A:** Spike the mechanism; document approach, limitations, and permission requirements.

### H2. `pickAndRunTransformation` profile picker UX
Spec requires "explicit user-picked behavior" but does not define picker modality:
- Native context menu at cursor position?
- Renderer-side modal dialog?
- System notification with options?

Choice affects which phase owns the UI component and whether new IPC channels are needed.

**Action required before Phase 3A:** Define picker modality and IPC contract (`showProfilePicker() -> Promise<profileId | null>`).

### H3. Ordered output hold-back algorithm
Spec requires output commits in source sequence order, but transformations may complete out-of-order. `OrderedOutputCoordinator` must implement hold-back buffering:
- Hold job N+1's output until job N's output is committed.
- Handle the case where job N fails (should job N+1 be released?).
- Handle timeout/starvation if job N never completes.

**Action required during Phase 0B:** Define hold-back algorithm, failure release policy, and starvation timeout.

### H4. `SoundService` audio playback backend
- `shell.beep()` is a single tone (insufficient for distinct success/failure sounds).
- `<audio>` HTML element requires renderer involvement and IPC.
- `NSSound` requires native module.

**Action required during Phase 0B:** Choose audio backend; this determines whether `SoundService` lives purely in main process or requires IPC.

### H5. `transformation.enabled` toggle replacement
Current `ProcessingOrchestrator.process()` checks `settings.transformation.enabled` (line 136). The spec schema does not include this field. Possible replacements:
- Removed entirely (transformation always runs if a profile is bound).
- Replaced by `defaultProfileId: null` (null means no transformation).
- Moved to a per-profile field.

**Action required during Phase 1A:** Document the replacement semantics; this affects Phase 2A pipeline logic.

### H6. `SettingsRepository` persistence format
Phase 1B calls for file-backed `SettingsRepository` but does not specify:
- File location (next to existing queue journal? separate directory?).
- File format (JSON?).
- Whether settings and profiles are stored in one file or multiple.

**Action required during Phase 1B:** Define format and location.

## 7. Required Test Traceability (Spec 10.1)
1. Profiles CRUD + default/active enforcement: Phase 1A + 3A.
2. STT allowlist rejection: Phase 4.
3. LLM allowlist rejection: Phase 4.
4. Recording command shortcut dispatch: Phase 3A.
5. Sound triggers (start/stop/cancel/transform complete): Phase 6.
6. Audio device discovery with multiple options: Phase 6.
7. Back-to-back reliability without dropped jobs: Phase 2A.
8. Non-blocking recording commands during processing: Phase 2A + 3A.
9. Transformation shortcut behavior matrix: Phase 3A.
10. STT pre-configuration validation (unset provider/model): Phase 2B + 4.
11. API key validation blocking (STT/LLM): Phase 1C + 2B + 5B.
12. Base URL override routing (STT/LLM): Phase 4.
13. Capture finalization auto-enqueue/auto-process: Phase 2A.

## 8. Spec Reconciliation Decision (Resolved)
- `specs/spec.md` is the single canonical source of truth for all requirements.
- `specs/ui-components-requirements.md` has been removed; its applicable requirements are covered by `specs/spec.md`.
- `specs/user-flow.md` has been reconciled: session history references removed, Flow 4 marked deferred, terminology aligned with spec.
- v1 UI must not ship session activity/history panels; output copy/paste toggles are exposed in Settings.
