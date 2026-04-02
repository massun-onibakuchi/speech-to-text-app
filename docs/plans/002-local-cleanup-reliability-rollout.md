---
title: Fix local cleanup reliability and observability
description: Break local cleanup bug fixes into small PR-sized tickets covering diagnostics, gating, fallback visibility, and Ollama model installation.
date: 2026-04-02
status: active
review_by: 2026-04-09
links:
  decision: "0003"
tags:
  - plan
  - local-llm
  - cleanup
  - ollama
  - renderer
  - ipc
---

# Fix local cleanup reliability and observability

## Context

Research in `docs/research/006-local-cleanup-silent-failure.md` confirmed five bugs in the current local cleanup flow:

- cleanup can be enabled even when Dicta already knows it cannot run
- cleanup failures are silently downgraded to a normal success path
- the common "supported model not installed" case has no in-app recovery path
- the refresh action is wired but gives too little feedback to prove anything happened
- runtime diagnostics collapse distinct failure modes into weak UI guidance

The rollout goal is to fix those issues without turning this into one large risky PR.

## Curated supported models for this rollout

Add the following models to the supported local cleanup catalog as part of the implementation work:

- `sorc/qwen3.5-instruct-uncensored:2b`
- `sorc/qwen3.5-instruct:0.8b`

## Planning principles

- One ticket maps to one PR.
- Each PR should be reviewable in isolation.
- Backward compatibility matters for persisted settings and history records.
- If a ticket changes durable behavior or a cross-cutting contract, update `specs/spec.md` in that same PR.
- If implementation confidence drops below 80, call it out explicitly before coding.

## Dependency graph

```text
LC-001 -> LC-002
LC-001 -> LC-004
LC-001 -> LC-005
LC-002 -> LC-004
LC-003a -> LC-003b

LC-003a can run in parallel with LC-001
LC-005 can start after LC-001 because it depends on the readiness contract, not on cleanup outcome plumbing
LC-004 should wait for LC-001 and LC-002
LC-003b should wait for LC-003a
```

## Priority order

| ID | Title | Priority | Confidence | Depends on | Parallelizable |
| --- | --- | --- | --- | --- | --- |
| LC-001 | Replace the coarse cleanup status contract with a required readiness snapshot | P0 | 90 | — | Yes |
| LC-002 | Prevent impossible cleanup enablement in Settings | P0 | 92 | LC-001 | No |
| LC-003a | Record cleanup outcome in capture and history contracts | P1 | 87 | — | Yes |
| LC-003b | Render cleanup fallback as degraded success in the UI | P1 | 89 | LC-003a | No |
| LC-004 | Add minimal in-app Ollama install flow for curated models | P1 | 76 | LC-001, LC-002 | No |
| LC-005 | Polish refresh UX and regression coverage around cleanup states | P2 | 88 | LC-001 | Yes |

## Cleaner option considered

There are two broad rollout shapes:

1. One large PR that rewires diagnostics, Settings gating, fallback status, model pull, and tests together.
2. Several narrow PRs that each change one layer of behavior.

This plan chooses option 2. It is cleaner operationally because it reduces review load, keeps failures easier to isolate, and avoids mixing UI, IPC, runtime, and capture-history contract changes in one diff.

Trade-off:

- Total ticket count increases.
- Some temporary intermediate states will exist between PRs.

That trade-off is acceptable because the user-visible failure today is already severe, and smaller PRs lower regression risk.

## Ticket details

## LC-001 - Replace the coarse cleanup status contract with a required readiness snapshot

**Priority**: P0
**Confidence**: 90
**PR size target**: medium

### Goal

Stop collapsing distinct cleanup failure modes into generic warnings so the UI can distinguish:

- Ollama not installed
- Ollama installed but daemon not reachable
- supported models absent
- selected model missing
- diagnostics fetch failed unexpectedly

### Proposed approach

Replace `LocalCleanupStatusSnapshot` with an explicit readiness contract instead of reusing the coarse `health` snapshot as the only UI signal.

Keep the existing health check, but return structured readiness data that separates:

- runtime reachability
- available supported models
- selected model availability
- actionable status code

This is cleaner than bolting more string parsing into the renderer because the main process already owns the runtime knowledge.

Guard rail:

- keep this ticket limited to the diagnostics contract and warning rendering
- do not add install actions, refresh polish, or cleanup outcome history changes here
- diagnostics must treat the expanded curated catalog as first-class supported choices

### Files in scope

- `src/main/services/local-llm/types.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- `src/main/ipc/register-handlers.ts`
- `src/shared/ipc.ts`
- `src/renderer/settings-output-react.tsx`
- `src/main/services/local-llm/ollama-local-llm-runtime.test.ts`
- `src/main/test-support/ipc-round-trip.test.ts`
- `src/renderer/settings-output-react.test.tsx`
- `specs/spec.md`

### Checklist

- [ ] Replace `LocalCleanupStatusSnapshot` with a single readiness snapshot type across preload, IPC, and renderer consumers
- [ ] Make `getLocalCleanupStatus` required in `IpcApi` instead of optional
- [ ] Define richer cleanup status codes and readiness shape in shared IPC types
- [ ] Preserve model-specific failure signals instead of flattening to `unknown`
- [ ] Return selected-model-installed state directly from main rather than recomputing everything in the renderer
- [ ] Use one consistent field name for installed-and-supported model choices; prefer `availableModels`
- [ ] Update Settings warnings to use the richer contract
- [ ] Add tests for each major diagnostic state
- [ ] Update the spec if the Settings diagnostics contract changes durably

### Tasks

1. Extend the local cleanup IPC snapshot with explicit status fields.
2. Refactor `getLocalCleanupStatus` to report structured readiness instead of only `health + supportedModels`.
3. Update the renderer to consume the new status directly.
4. Add focused main-process and renderer tests for each state.
5. Update the spec section for local cleanup diagnostics.

### Definition of Done

- Settings can distinguish runtime unavailable, daemon unreachable, no supported models, and selected model missing without renderer-side guesswork.
- Tests cover those states.
- The spec matches the shipped behavior.

### Trade-offs

- Pros: cleaner ownership, less renderer guesswork, better future compatibility for additional runtimes.
- Cons: shared IPC contract changes; renderer and tests must move in lockstep.

### Example snippet

```ts
type LocalCleanupReadiness =
  | { kind: 'ready'; selectedModelInstalled: true }
  | { kind: 'runtime_unavailable' }
  | { kind: 'server_unreachable' }
  | { kind: 'no_supported_models' }
  | { kind: 'selected_model_missing'; availableModels: Array<{ id: string; label: string }> }
```

## LC-002 - Prevent impossible cleanup enablement in Settings

**Priority**: P0
**Confidence**: 92
**PR size target**: small

### Goal

Do not let users enable local cleanup when Dicta already knows cleanup cannot run.

### Proposed approach

Gate the cleanup toggle off the readiness data from LC-001.

Preferred behavior:

- disable the toggle when runtime is unavailable
- disable the toggle when no supported model is installed
- keep the toggle enabled when the runtime is healthy and at least one supported model is installed
- if persisted settings already have `cleanup.enabled = true` in a broken state, show that state clearly and let autosave turn it off when the user changes it

This is cleaner than allowing impossible enablement plus a warning, because the UI should not imply readiness where none exists.

### Files in scope

- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-output-react.test.tsx`
- `src/renderer/renderer-app.test.ts`
- `specs/spec.md`

### Checklist

- [ ] Disable the cleanup toggle for impossible states
- [ ] Add disabled-state copy that explains why the control is unavailable
- [ ] Preserve visibility of persisted broken states instead of hiding them
- [ ] Allow `selected_model_missing` only when at least one `availableModel` exists
- [ ] Add renderer tests for disabled and enabled paths
- [ ] Update the spec if the gating rule becomes durable behavior

### Tasks

1. Compute `canEnableCleanup` from the diagnostics snapshot.
2. Disable the card and switch when cleanup is impossible.
3. Add copy explaining the blocker.
4. Extend renderer tests for disabled toggle scenarios.
5. Update spec wording if necessary.

### Definition of Done

- Users cannot newly enable cleanup when Ollama or a supported model is unavailable.
- Existing broken persisted states remain visible and understandable.
- Tests cover the gating behavior.

### Trade-offs

- Pros: removes the most misleading UX immediately.
- Cons: stricter gating may surprise users who expect to pre-enable cleanup before finishing setup.

### Example snippet

```tsx
const canEnableCleanup =
  cleanupStatus.kind === 'ready' ||
  (cleanupStatus.kind === 'selected_model_missing' && cleanupStatus.availableModels.length > 0)

<Switch
  checked={settings.cleanup.enabled}
  disabled={!canEnableCleanup}
  onCheckedChange={(checked) => onChangeCleanupSettings({ ...settings.cleanup, enabled: checked })}
/>
```

## LC-003a - Record cleanup outcome in capture and history contracts

**Priority**: P1
**Confidence**: 87
**PR size target**: small to medium

### Goal

Preserve cleanup outcome in main-process contracts so later UI work can distinguish cleanup success from cleanup fallback without guessing.

### Proposed approach

Add explicit cleanup outcome metadata to the capture result and history record.

Canonical shape:

- `{ kind: 'not_requested' }`
- `{ kind: 'applied'; modelId: LocalCleanupModelId }`
- `{ kind: 'fallback'; reason: 'runtime_failed' | 'invalid_output' | 'model_missing' }`

Keep this PR main-process only. That is cleaner than mixing history-contract work with renderer messaging in one diff.

### Files in scope

- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `src/main/services/history-service.ts`
- `src/shared/ipc.ts`
- `src/main/services/history-service.test.ts`
- `specs/spec.md`

### Checklist

- [ ] Record cleanup outcome in the capture pipeline
- [ ] Persist cleanup outcome in history
- [ ] Expose cleanup outcome through IPC history snapshots
- [ ] Default missing `cleanupOutcome` in old records to `{ kind: 'not_requested' }` at the consumer boundary
- [ ] Evaluate whether `HistoryStore.version` needs a bump or whether additive field tolerance is sufficient
- [ ] Add tests for applied vs fallback outcomes
- [ ] Update spec language for the durable history contract if needed

### Tasks

1. Introduce cleanup outcome metadata in the capture pipeline.
2. Persist the new field in history records and snapshots.
3. Add main-process tests and history compatibility handling.
4. Update the spec if the durable contract changes.

### Definition of Done

- Cleanup outcome is available in history and IPC snapshots.
- Transcript delivery remains non-blocking.
- Existing history consumers remain backward compatible.

### Trade-offs

- Pros: isolates the contract change from the later UI change.
- Cons: user-visible benefit arrives in the follow-up PR rather than immediately.

### Potential risks

- Backward compatibility: old history records will not contain the new field, so the renderer must default safely.
- Forward compatibility: leave room for future outcomes like timeout or model-missing without a second schema rewrite.

### Example snippet

```ts
type CleanupOutcome =
  | { kind: 'not_requested' }
  | { kind: 'applied'; modelId: LocalCleanupModelId }
  | { kind: 'fallback'; reason: 'runtime_failed' | 'invalid_output' | 'model_missing' }
```

## LC-003b - Render cleanup fallback as degraded success in the UI

**Priority**: P1
**Confidence**: 89
**PR size target**: small

### Goal

Keep transcript delivery best-effort, but stop presenting cleanup fallback as indistinguishable from a normal successful cleanup path.

### Proposed approach

Consume the new `cleanupOutcome` field from LC-003a in renderer activity and toast projection.

Recommended behavior:

- `applied`: current success message stays
- `fallback`: success remains non-blocking, but add a degraded-success note
- `not_requested`: current success path stays

This is cleaner than converting fallback into a hard error, because the product requirement is still "deliver transcript even when cleanup fails."

Guard rail:

- keep the UI change limited to terminal activity and toast wording
- do not redesign the broader activity feed in this PR

### Files in scope

- `src/renderer/native-recording.ts`
- `src/renderer/native-recording.test.ts`
- `src/shared/ipc.ts`
- `specs/spec.md`

### Checklist

- [ ] Adjust renderer activity and toast behavior for degraded-success outcomes
- [ ] Keep fallback non-blocking and non-error
- [ ] Add renderer tests for applied vs fallback vs not-requested outcomes
- [ ] Update spec language for user-visible fallback signaling

### Tasks

1. Update terminal activity projection.
2. Add degraded-success copy for fallback outcomes.
3. Add renderer tests.
4. Update the spec.

### Definition of Done

- A cleanup runtime failure no longer looks identical to cleanup success in the UI.
- Transcript delivery remains non-blocking.
- Renderer behavior is covered by tests.

### Trade-offs

- Pros: addresses the "it did nothing" complaint directly.
- Cons: introduces one more success-like state that the UI must message clearly.

### Example snippet

```ts
if (record.terminalStatus === 'succeeded' && record.cleanupOutcome?.kind === 'fallback') {
  addTerminalActivity('Transcription complete. Local cleanup did not apply; original transcript was kept.', 'info')
}
```

## LC-004 - Add minimal in-app Ollama install flow for curated models

**Priority**: P1
**Confidence**: 76
**PR size target**: small to medium

### Goal

Allow users to install a curated supported model from Settings instead of leaving the app to run Ollama commands manually.

### Proposed approach

Add a narrow main-process runtime method for installing only curated supported models.

Do not start with arbitrary model names. Restricting the operation to the curated catalog is the cleaner path because it matches the existing support policy and reduces validation burden.

The curated set for this rollout is:

- existing `qwen3.5:2b`
- existing `qwen3.5:4b`
- new `sorc/qwen3.5-instruct-uncensored:2b`
- new `sorc/qwen3.5-instruct:0.8b`

Explicit non-goals for this ticket:

- no streaming progress UI
- no cancel or pause support
- no arbitrary user-entered model ids
- no background download manager

Those exclusions are what make this ticket small enough for one PR.

Confidence note:

- install duration and timeout behavior still need explicit handling
- keep the first slice fire-and-forget with final success or failure only

### Files in scope

- `src/main/services/local-llm/types.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.test.ts`
- `src/main/ipc/register-handlers.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-output-react.test.tsx`
- `specs/spec.md`
- `docs/adr/0003-local-llm-cleanup-runtime-and-fallback.md` if the runtime responsibility changes materially

### Checklist

- [ ] Add a runtime method to pull a curated supported model
- [ ] Add an IPC action for model pull
- [ ] Show a pull/install action in Settings when the selected or default supported model is missing
- [ ] Wrap the pull operation in a configurable timeout
- [ ] Refresh cleanup diagnostics after install completes
- [ ] Add runtime, preload, IPC, and renderer tests
- [ ] Update the spec and ADR only if the runtime responsibility becomes a durable architecture change

### Tasks

1. Add `pullModel(modelId)` to the runtime adapter.
2. Expand the curated local cleanup catalog to include the two new `sorc/*` models.
3. Limit pulls to models from the curated local cleanup catalog.
4. Add IPC handler and preload exposure.
5. Add timeout handling around the pull operation.
6. Add Settings install action and simple success or failure feedback.
7. Re-fetch the full readiness snapshot via `getLocalCleanupStatus` after the pull finishes.
8. Add tests.

### Definition of Done

- A user can install a supported missing model from Settings.
- The UI refreshes and exposes the newly installed model without app restart.
- Unsupported arbitrary model names are rejected.

### Trade-offs

- Pros: closes the largest setup gap without introducing a download-manager subsystem.
- Cons: long-running install operations still need careful timeout and error handling.

### Potential risks

- Backward compatibility: low risk.
- Forward compatibility: keep the API general enough for future runtimes, but do not over-abstract on the first PR.
- Maintainability: avoid embedding pull-progress state in too many layers if the first slice does not need it.

### Example snippet

```ts
ipcMain.handle(IPC_CHANNELS.pullLocalCleanupModel, async (_event, modelId: LocalCleanupModelId) => {
  await svc.localLlmRuntime.pullModel(modelId)
  return
})
```

## LC-005 - Polish refresh UX and regression coverage around cleanup states

**Priority**: P2
**Confidence**: 88
**PR size target**: small

### Goal

Make the diagnostics refresh flow observable and regression-resistant after the higher-priority behavior fixes land.

### Proposed approach

Add lightweight UX affordances rather than turning refresh into a large async workflow:

- pending state
- disabled while in flight
- success or failure toast
- optional "last checked" timestamp if the UI still feels too opaque

Keep this ticket separate so the earlier tickets can land without being blocked by polish work.

### Files in scope

- `src/renderer/settings-output-react.tsx`
- `src/renderer/settings-output-react.test.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/renderer-app.test.ts`

### Checklist

- [ ] Add loading state to refresh
- [ ] Disable repeated clicks while the request is in flight
- [ ] Add a user-visible completion signal
- [ ] Cover the flow with renderer tests

### Tasks

1. Add local pending state for cleanup refresh.
2. Disable the refresh button while loading.
3. Emit success and failure feedback using the existing renderer toast path.
4. Add tests for pending and completion behavior.

### Definition of Done

- Users can tell refresh is running and when it finishes.
- Repeated clicks do not queue overlapping refreshes.
- Tests cover the UX contract.

### Trade-offs

- Pros: directly addresses the "refresh doesn't work" perception.
- Cons: small amount of extra transient UI state.

### Example snippet

```tsx
const [refreshPending, setRefreshPending] = useState(false)

const refreshCleanupStatus = async () => {
  setRefreshPending(true)
  try {
    setCleanupStatus(await fetchCleanupStatus(settings.cleanup.runtime))
    addToast('Local cleanup diagnostics refreshed.', 'success')
  } finally {
    setRefreshPending(false)
  }
}
```

## Risks and compatibility notes

### Backward compatibility

- History schema changes in LC-003 must tolerate old records with no cleanup outcome.
- Persisted settings with `cleanup.enabled = true` in a broken runtime state must remain readable even if new gating prevents re-enabling that state from the UI.

### Forward compatibility

- Do not hardcode the renderer around Ollama-only assumptions where the shared contract can stay runtime-agnostic.
- Leave room for more cleanup outcome reasons and more local runtimes later.

### Maintainability

- Keep runtime knowledge in main, not duplicated across renderer helpers.
- Avoid mixing model-pull orchestration into unrelated capture logic.
- Prefer shared typed contracts over renderer string matching.

## Recommended execution order

### Sequential

1. LC-001
2. LC-002
3. LC-004

### Parallel

1. LC-003a can proceed alongside LC-001 because it touches capture and history rather than Settings diagnostics.
2. LC-005 can proceed after LC-001 because it only needs the readiness contract.

### After both tracks land

1. LC-003b

Note:

- LC-003a can be developed in parallel with LC-001, but both tickets touch `specs/spec.md`; merge order should account for a likely doc rebase.

## Review request

Before implementation begins, review each ticket against:

- cleaner alternatives
- any confidence score below 80
- PR size discipline
- dependency correctness
- backward and forward compatibility
- maintainability of the resulting contracts
