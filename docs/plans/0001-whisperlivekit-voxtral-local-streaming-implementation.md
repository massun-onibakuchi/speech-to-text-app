---
title: Implement WhisperLiveKit local streaming STT with Voxtral MLX
description: Step-by-step ticket plan for adding an app-managed optional WhisperLiveKit localhost runtime with Voxtral Mini 4B Realtime MLX as the first local streaming model.
date: 2026-03-18
status: active
review_by: 2026-03-25
links:
  decision: ADR-0001, ADR-0002, ADR-0003
tags:
  - plan
  - streaming
  - whisperlivekit
  - voxtral
  - mlx
  - localhost
---

<!--
Where: docs/plans/0001-whisperlivekit-voxtral-local-streaming-implementation.md
What: Execution plan for delivering optional local realtime streaming support through WhisperLiveKit and Voxtral MLX.
Why: Keep implementation scoped, reviewable, and aligned with the revised architecture before coding begins.
-->

# WhisperLiveKit Local Streaming Implementation Plan

## Goal

Deliver Apple Silicon macOS local streaming STT through the existing STT provider/model settings flow, using:

- an app-managed optional local runtime
- WhisperLiveKit as the managed localhost service
- Voxtral Mini 4B Realtime MLX as the first shipped local model/backend
- raw dictation and transformed output for finalized chunks
- locked paste-at-cursor output semantics while local streaming is selected

## Constraints

- one ticket maps to one PR
- tickets are ordered by dependency and delivery priority
- do not start implementation outside the current ticket
- keep current cloud batch STT behavior working throughout
- target support is Apple Silicon macOS only
- local runtime is not bundled by default
- app installs and manages the runtime only after explicit user confirmation

## Architecture Baseline

This plan assumes the architecture chosen in ADR-0003:

- provider id `local_whisperlivekit`
- first model id `voxtral-mini-4b-realtime-mlx`
- app-managed runtime install/update/remove lifecycle
- loopback-only localhost service boundary
- Electron main owns runtime supervision, websocket session lifecycle, ordered output, transform dispatch, and activity state

## Delivery Order

1. Ticket 1: settings contract and provider introduction
2. Ticket 2: output lock and routing cleanup
3. Ticket 3: runtime consent and install manager
4. Ticket 4: localhost service supervision and version pinning
5. Ticket 5: renderer PCM capture and main-process streaming client
6. Ticket 6: raw dictation local streaming lane
7. Ticket 7: transformed local streaming lane
8. Ticket 8: hardening, observability, and ship validation

## Ticket 1

### Title

Settings contract and provider introduction

### Priority

P0

### Goal

Introduce the local provider and first local model in shared settings and UI, without yet wiring the runtime lifecycle, so later tickets build on a stable user-facing contract.

### Approach

Use the existing STT settings UI and domain schema. Add provider `local_whisperlivekit` with canonical model id `voxtral-mini-4b-realtime-mlx`, and gate visibility to Apple Silicon macOS.

### Scope files

- `src/shared/domain.ts`
- `src/shared/*settings*`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/main/*settings*`
- `specs/spec.md`

### Checklist

- add provider id `local_whisperlivekit`
- add model id `voxtral-mini-4b-realtime-mlx`
- label it `Voxtral Mini 4B Realtime [streaming]`
- expose local options only on Apple Silicon macOS
- infer local streaming from selected provider/model

### Tasks

- extend shared settings/domain types for the new local provider and model
- add platform gating helper in renderer and main
- update provider/model form rendering and validation
- add focused unit tests for settings validation and UI gating

### Gates

- local provider cannot be selected on unsupported platforms
- tests cover provider gating and canonical local model ids

### Trade-offs

- keeping only one first model reduces flexibility, but it keeps the first shipped runtime contract narrow and reviewable
- platform gating in both UI and runtime is duplicated, but prevents unsupported execution

### Code shape

```ts
const isLocalStreamingProvider =
  settings.transcription.provider === "local_whisperlivekit";
```

## Ticket 2

### Title

Output lock and routing cleanup

### Priority

P0

### Goal

Remove duplicate routing state and enforce the local provider’s paste-only output semantics in UI and runtime.

### Approach

Delete stale mode-style routing scaffolding. Replace it with provider-derived routing and effective output policy when `local_whisperlivekit` is selected.

### Scope files

- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-recording-react.tsx`
- `src/main/routing/*`
- `src/main/core/command-router.ts`
- `src/main/services/output-service.ts`
- `src/main/tests/*routing*`
- `specs/spec.md`

### Checklist

- derive routing only from STT provider/model
- lock output controls to paste-only when local provider is selected
- show explanatory hover or helper text for locked controls
- preserve existing cloud batch output behavior

### Tasks

- delete obsolete route-selection code paths and tests
- update command routing to branch on provider/model only
- update output settings UI to enforce effective local-streaming policy
- add unit tests for provider-derived routing and locked output semantics

### Gates

- no remaining runtime path depends on `processing.mode` or equivalent duplicate routing state
- local provider selection forces paste-at-cursor and disables copy-to-clipboard in the UI
- hover/help text explains the lock reason

### Trade-offs

- removing legacy scaffolding early is riskier than keeping compatibility shims, but it prevents every later ticket from carrying invalid state branches
- enforcing locked output in both UI and runtime adds duplication, but avoids accidental drift between presentation and behavior

### Code shape

```ts
const effectiveOutput = isLocalStreamingProvider(settings)
  ? { copyToClipboard: false, pasteAtCursor: true }
  : loadUserOutputPolicy(settings);
```

## Ticket 3

### Title

Runtime consent and install manager

### Priority

P0

### Goal

Add the app-managed optional runtime lifecycle: explicit user consent, install/update/remove flow, and version-pinned runtime availability checks.

### Approach

Introduce a `LocalRuntimeInstallManager` that owns consent state, runtime bootstrap, pinned version installation, backend dependency installation, and uninstall/update behavior. The app should manage the runtime; the user should not have to install or version it manually.

### Scope files

- `src/main/services/local-runtime-install-manager.ts`
- `src/main/services/download-service.ts`
- `src/main/config/*`
- `src/main/ipc/*`
- `src/shared/domain.ts`
- `src/shared/events/*`
- `src/main/tests/*runtime-install*`
- `specs/spec.md`

### Checklist

- require explicit user confirmation before install
- create app-managed runtime root
- install pinned WhisperLiveKit version
- install required `voxtral-mlx` dependency set
- expose install states and progress
- support uninstall, reinstall, and update
- detect pinned-version mismatch before starting a new local session
- apply required updates only while no local session is active

### Tasks

- define runtime manifest/constants for version pinning and install metadata
- implement consent state and install approval flow
- bootstrap the managed environment in writable app data
- install WhisperLiveKit and the MLX backend dependency set
- expose progress/status events to session control
- define update policy for idle-only update application or staging
- add unit tests around first install, failed install, reinstall, and version drift

### Gates

- no runtime install starts without explicit user confirmation
- runtime availability is version-pinned and app-owned
- failed installs surface actionable errors with phase and version
- uninstall/update is blocked while a local session is active
- required updates do not interrupt active local sessions

### Trade-offs

- app-managed runtime ownership increases lifecycle complexity, but avoids user-managed drift
- version pinning slows backend upgrades, but keeps app/runtime compatibility predictable

### Code shape

```ts
type LocalRuntimeInstallState =
  | { kind: "not_installed" }
  | { kind: "awaiting_user_confirmation" }
  | { kind: "installing"; phase: "bootstrap" | "packages" | "backend" }
  | { kind: "ready"; version: string }
  | { kind: "failed"; phase: string; message: string };
```

## Ticket 4

### Title

Localhost service supervision and version pinning

### Priority

P0

### Goal

Launch and supervise the managed WhisperLiveKit localhost service in a way the app can rely on for session startup and recovery.

### Approach

Introduce a `LocalRuntimeServiceSupervisor` that starts WhisperLiveKit on loopback only, chooses/reserves the port, pins the expected runtime version, performs health checks, and maps service failure into typed app session errors.

### Scope files

- `src/main/services/local-runtime-service-supervisor.ts`
- `src/main/services/local-runtime-install-manager.ts`
- `src/main/config/*`
- `src/main/tests/*runtime-service*`
- `specs/spec.md`

### Checklist

- start loopback-only service
- reserve/track port
- verify service readiness
- verify runtime version compatibility
- detect service crash or unhealthy state
- stop and restart cleanly
- establish an app-owned auth/session-token handshake for localhost access

### Tasks

- define service startup command and environment contract
- implement readiness and health checks
- bind to `127.0.0.1` or equivalent loopback only
- add restart and shutdown handling
- define and validate the app-issued localhost auth/session token handshake
- map startup failures to `session_start_failed` and runtime failures to `stream_interrupted`
- add failure tests for service start, crash, and version mismatch

### Gates

- service never binds to a non-loopback interface by default
- app detects unhealthy or crashed service during an active session
- version mismatch becomes an actionable error, not silent drift
- localhost access requires an app-owned auth/session token or equivalent private handshake

### Trade-offs

- localhost service supervision is more complex than a child helper, but it better fits the optional-runtime model
- health checks add implementation overhead, but are necessary once the runtime is out-of-process and user-installable on demand

### Code shape

```ts
const runtime = await runtimeSupervisor.ensureRunning({
  host: "127.0.0.1",
  backend: "voxtral-mlx",
  expectedVersion,
});
```

## Ticket 5

### Title

Renderer PCM capture and main-process streaming client

### Priority

P0

### Goal

Replace stop-then-submit blob behavior for the local provider path with continuous PCM frame delivery and a main-process websocket client connected to WhisperLiveKit.

### Approach

Keep the existing blob recording path for cloud providers. Add a local renderer capture branch that produces PCM batches, and introduce a main-process streaming client that opens the realtime websocket session to the managed localhost service.

### Scope files

- `src/renderer/native-recording.ts`
- `src/renderer/*recording*`
- `src/preload/*`
- `src/shared/ipc.ts`
- `src/main/ipc/*recording*`
- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/main/services/local-runtime-service-client.ts`
- `src/renderer/tests/*recording*`
- `src/main/tests/*streaming-session*`

### Checklist

- start local session
- stream PCM batches
- stop local session
- cancel local session during install/start/prepare/active
- avoid tiny per-frame IPC messages
- pass selected language into the runtime session
- suppress or discard runtime partials for v1
- use the supervisor-provided runtime endpoint rather than a hardcoded port
- keep cloud recording path unchanged

### Tasks

- add local session controller state machine
- add renderer capture branch for local provider selection
- choose batch size target, for example 50-100 ms PCM chunks
- add IPC methods for `startLocalStreamingSession`, `appendLocalStreamingAudio`, `stopLocalStreamingSession`, `cancelLocalStreamingSession`
- open and manage the localhost websocket session from Electron main
- use the supervisor-provided endpoint and auth/session token when opening the websocket session
- normalize runtime events and drop/suppress partials for v1
- add renderer cleanup for device change, cancel, and focus loss cases
- test command responsiveness during in-flight streaming

### Gates

- cloud providers still use the old blob-based path
- local provider uses only PCM session IPC plus the managed websocket client
- cancel works during install, service start, prepare, and active phases
- websocket session connection uses the supervisor-provided endpoint and auth/session token

### Trade-offs

- `MessagePort` or shared memory may be ideal later, but a coarse-batched IPC path is a lower-risk first delivery
- keeping the websocket client in main rather than renderer centralizes session ownership and avoids UI-level networking state

### Code shape

```ts
await runtimeClient.openSession({
  url: runtime.endpoint.wsUrl,
  authToken: runtime.sessionToken,
  model: "voxtral-mini-4b-realtime-mlx",
  language: "en",
});
```

## Ticket 6

### Title

Raw dictation local streaming lane

### Priority

P1

### Goal

Commit finalized local chunks immediately as raw dictation while preserving source order, active-session cancel behavior, and paste-only output semantics.

### Approach

Use the managed runtime session as the text source. Raw dictation bypasses transformation entirely and commits each finalized chunk directly once it is eligible in sequence order.

### Scope files

- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/services/output-service.ts`
- `src/main/services/activity-publisher.ts`
- `src/main/tests/*streaming*`
- `src/renderer/*activity*`

### Checklist

- session starts and stops cleanly
- finalized chunks are emitted immediately
- output commits stay in speech order
- cancel during an active local session stops future commits cleanly
- paste-only semantics are enforced
- raw text remains visible in activity/debug state

### Tasks

- adapt ordered output coordinator for session-scoped chunk sequencing
- commit raw finalized chunks to output
- publish per-chunk activity and terminal state to renderer
- ensure active-session cancel discards uncommitted future chunks
- add tests for out-of-order arrival, output ordering, and active cancel behavior

### Gates

- raw dictation never waits for full-session completion
- output is ordered even if runtime chunk timing varies
- no clipboard-copy user mode is exposed while local provider is selected
- active cancel stops future output commits for the cancelled session

### Trade-offs

- reusing the ordered output coordinator reduces duplication, but it must remain readable across batch and live-session uses
- exposing raw text in activity state helps debugging, but should stay out of user-facing output when transformed mode is selected

### Code shape

```ts
orderedOutput.enqueue({
  streamId: sessionId,
  sequence,
  text: finalizedText,
  mode: "stream_raw_dictation",
});
```

## Ticket 7

### Title

Transformed local streaming lane

### Priority

P1

### Goal

Transform each finalized utterance chunk exactly once using the existing default transformation preset, while keeping chunk output ordered and bounded under backpressure.

### Approach

Bind the current default preset when each chunk is enqueued, run transforms concurrently through a bounded worker pool, retain raw chunk text in activity/debug state, and commit only transformed text to user-facing output.

### Scope files

- `src/main/orchestrators/local-streaming-session-controller.ts`
- `src/main/services/transformation-service.ts`
- `src/main/coordination/ordered-output-coordinator.ts`
- `src/main/tests/*transform*`
- `src/renderer/*activity*`
- `specs/spec.md`

### Checklist

- transform runs once per finalized chunk
- no per-word transform behavior exists
- preset binding occurs at enqueue time
- raw text remains visible in activity/debug state
- transformed output commits in original chunk order
- failed chunk transforms do not stop later chunks
- transform backpressure is bounded and observable

### Tasks

- map `output.selectedTextSource=transformed` to effective mode `stream_transformed`
- bind `defaultPresetId` snapshot per chunk
- run chunk transforms through a bounded worker pool with explicit backpressure behavior
- update ordered output coordinator to wait for missing earlier transforms
- publish both raw and transformed chunk states to activity/debug UI
- test transform failure isolation, backpressure, and preset snapshot behavior

### Gates

- chunks are transformed only after utterance finalization
- transformed output is ordered even when transform completion is out of order
- later chunks continue after one chunk transform fails
- bounded in-flight transforms and backpressure behavior are covered by tests

### Trade-offs

- preserving raw chunk text improves debugging, but increases temporary runtime state
- ordered commit may delay a ready transformed chunk behind an earlier slow chunk, but it keeps pasted text coherent

### Code shape

```ts
transformPool.enqueue({
  sessionId,
  sequence,
  sourceText: finalizedText,
  preset: boundDefaultPreset,
});
```

## Ticket 8

### Title

Hardening, observability, and ship validation

### Priority

P2

### Goal

Make the feature operationally safe enough to ship by covering install, startup, crash, ordering, runtime drift, and UX edge cases with tests and diagnostics.

### Approach

Use focused logs and activity states around consent, install, service start, prepare, active, stopping, and failed phases. Add end-to-end and integration coverage for the critical paths rather than over-mocking the session.

### Scope files

- `src/main/services/*logger*`
- `src/main/services/activity-publisher.ts`
- `test/e2e/*`
- `test/integration/*`
- `docs/e2e-playwright.md`
- `docs/release-checklist.md`
- `specs/spec.md`

### Checklist

- consent, install, service start, active, stop, fail states are observable
- runtime crash and version mismatch are diagnosable
- Apple Silicon-only exposure is verified
- e2e coverage exists for raw and transformed streaming
- docs are updated for release and test workflow

### Tasks

- add correlation ids for local sessions and chunk sequences
- add integration tests for runtime crash, startup failure, and cancel during install/start
- add Playwright coverage for settings gating and locked output UI
- add manual validation steps for first-run install and warm-up UX
- update release/testing docs for local runtime install/update/remove checks

### Gates

- failures identify phase, runtime version, model, and session id
- end-to-end coverage exists for raw dictation and transformed chunk mode
- release checklist covers runtime install and localhost service smoke checks

### Trade-offs

- more instrumentation adds code surface, but a managed localhost runtime is too opaque to ship without it
- full live-runtime e2e will be slower and more brittle, so keep most cases at integration level and reserve e2e for core user flows

### Code shape

```ts
logger.info("local_runtime_session_failed", {
  sessionId,
  phase,
  runtimeVersion,
  model,
});
```

## Risks Across Tickets

- runtime install/update flow introduces more failure modes than the base app alone would have
- localhost service hardening must be treated as product scope, not infra trivia
- ordered output can mask throughput issues if transform backpressure is not bounded
- app/runtime version drift becomes a first-class failure mode

## Recommended PR Sequence

- PR 1: Ticket 1 only
- PR 2: Ticket 2 only
- PR 3: Ticket 3 only
- PR 4: Ticket 4 only
- PR 5: Ticket 5 only
- PR 6: Ticket 6 only
- PR 7: Ticket 7 only
- PR 8: Ticket 8 only
