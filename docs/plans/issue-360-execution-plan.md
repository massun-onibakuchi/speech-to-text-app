# Issue 360 Execution Plan

## Context
- Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/360
- Problem: Recording remains enabled when `output.selectedTextSource = transformed` and Google key is missing.
- Additional requirement: Shortcut-triggered blocked attempts must not play recording sounds.

## Delivery Model
- 1 ticket = 1 PR.
- Tickets are sorted by priority and should merge in order.
- Keep each PR small, reversible, and independently testable.

## Ticket Priority Order
1. P0 - Ticket T360-1: Functional fix for all recording entry points (UI + shortcut/native)
2. P1 - Ticket T360-2: Regression coverage (unit + integration tests)
3. P2 - Ticket T360-3: Decision documentation

---

## Ticket T360-1 (P0)
### Goal
Disable all recording entry points (Home button and shortcut/native command start paths) when transformed output is selected and Google key is missing, while preserving STT-key precedence behavior.

### Approach
- Introduce a shared recording preflight guard in renderer logic used by both:
  - Home disabled/blocked state rendering.
  - Native recording start branches (`startRecording` and `toggleRecording` when idle).
- Guard before any start side effects to avoid silent-but-started bugs:
  - before recording start call
  - before success activity messages
  - before sound events
- Preserve precedence:
  - If STT key missing for selected STT provider, return STT blocked reason.
  - Else if output source is `transformed` and Google key missing, return transform blocked reason.
  - Else allow start.

### Scope Files
- `src/renderer/blocked-control.ts`
- `src/renderer/home-react.tsx`
- `src/renderer/native-recording.ts`
- `src/renderer/renderer-app.tsx` (only if guard wiring needs lightweight state plumb)

### Checklist
- [ ] Shared recording preflight guard implemented and reused.
- [ ] Home recording button disabled for transformed-output + missing Google key.
- [ ] Shortcut/native blocked attempts do not start recording.
- [ ] Shortcut/native blocked attempts do not play recording sounds.
- [ ] STT-key-missing behavior remains unchanged.

### Tasks (Chunked)
1. Add/refactor shared preflight function for recording availability.
2. Apply guard in Home blocked message/disabled flow.
3. Apply same guard at native recording start and toggle-start branches.
4. Ensure blocked path exits before start/sound side effects.
5. Run focused smoke tests for renderer recording flows.

### Gates
- Gate A (Functional): Home button disabled when transformed output selected + Google key missing.
- Gate B (Functional): Shortcut blocked attempt does not start recording and does not emit recording sounds.
- Gate C (Parity): STT-key-missing blocked behavior still matches current UX.
- Gate D (Quality): Targeted tests for touched areas pass.

### Trade-offs
- Shared guard reduces drift between UI state and command execution behavior.
- Small refactor cost now prevents recurring mismatches between button state and shortcut behavior.
- Guard stays renderer-local for minimal scope; runtime preflight remains a separate defense layer.

### Code Snippet (Target)
```ts
const blocked = resolveRecordingBlockedMessage(settings, apiKeyStatus)
if (blocked) {
  // Block before any start side effects
  return
}

await startRecordingFlow()
await playSound('recording_started')
```

### PR Linkage
- PR: `fix/issue-360-recording-preflight-all-entry-points`

---

## Ticket T360-2 (P1)
### Goal
Lock regressions with unit and integration tests across Home, native recording, and IPC shortcut seams.

### Approach
- Add matrix-style tests for preflight result permutations.
- Add integration coverage where recording command dispatch arrives via `onRecordingCommand` IPC listener.
- Verify both blocked and allowed paths for start/toggle commands and sound side effects.

### Scope Files
- `src/renderer/blocked-control.test.ts`
- `src/renderer/home-react.test.tsx`
- `src/renderer/native-recording.test.ts`
- `src/renderer/renderer-app.test.ts`

### Checklist
- [ ] Matrix covers STT providers (`groq`, `elevenlabs`).
- [ ] Matrix covers output source (`transcript`, `transformed`).
- [ ] Matrix covers commands (`startRecording`, `toggleRecording`).
- [ ] Blocked transformed+missing-google path asserts: no recording start, no sound.
- [ ] Unblocked control cases assert recording and sound behavior still work.

### Tasks (Chunked)
1. Add unit matrix tests for `resolveRecordingBlockedMessage`.
2. Add Home component assertion for transformed-output disable state.
3. Add native recording tests for blocked no-start/no-sound.
4. Add `renderer-app` integration test for IPC shortcut blocked-start parity.
5. Run targeted renderer tests and stabilize assertions.

### Gates
- Gate A (Coverage): Required matrix scenarios are asserted.
- Gate B (Integration): IPC shortcut blocked path is tested end-to-end in renderer layer.
- Gate C (Quality):
  - `pnpm test -- src/renderer/blocked-control.test.ts`
  - `pnpm test -- src/renderer/home-react.test.tsx`
  - `pnpm test -- src/renderer/native-recording.test.ts`
  - `pnpm test -- src/renderer/renderer-app.test.ts`

### Trade-offs
- More test permutations increase maintenance cost slightly.
- Integration test adds runtime, but closes the highest-risk seam.

### Code Snippet (Test Matrix Sketch)
```ts
const cases = [
  { provider: 'groq', source: 'transcript', stt: true, google: false, blocked: false },
  { provider: 'groq', source: 'transformed', stt: true, google: false, blocked: true },
  { provider: 'elevenlabs', source: 'transformed', stt: false, google: true, blocked: true }
]
```

### PR Linkage
- PR: `test/issue-360-recording-block-regression-coverage`

---

## Ticket T360-3 (P2)
### Goal
Document the architecture decision so future refactors preserve preflight UX consistency.

### Approach
- Add decision record describing why transformed output mode requires Google-key availability for recording start eligibility.
- Document alternatives considered and why they were rejected.

### Scope Files
- `docs/decisions/issue-360-recording-gate-for-transformed-output.md` (new)

### Checklist
- [ ] Decision document captures problem, decision, alternatives, and consequences.
- [ ] Trade-offs between strict pre-blocking and permissive fallback are explicit.
- [ ] PR references issue and prior functional/test PRs.

### Tasks (Chunked)
1. Draft decision context and constraints.
2. Capture selected approach and rejected alternatives.
3. Note operational risks and mitigations.
4. Link to tests/PRs that enforce the decision.

### Gates
- Gate A (Completeness): Decision record includes rationale + alternatives + consequences.
- Gate B (Traceability): Decision doc links back to issue/PR/test artifacts.

### Trade-offs
- Documentation overhead is small but improves long-term consistency and reviewer onboarding.

### Code Snippet (Decision Example)
```md
Decision: Gate recording start when selected output source cannot be produced.
Reason: Prevent user confusion and inconsistent command-side behavior.
```

### PR Linkage
- PR: `docs/issue-360-recording-gate-decision`

---

## Risks and Mitigations
- Risk: UI blocked state and native command path drift over time.
  - Mitigation: One shared preflight helper reused across both paths.
- Risk: Stale API key status during shortcut-triggered start decision.
  - Mitigation: Use latest `apiKeyStatus` snapshot and refresh when state changes materially.
- Risk: Sound suppression accidentally mutes valid starts.
  - Mitigation: Add positive-control tests for unblocked sound playback.

## Feasibility Assessment
- T360-1: Medium-high feasibility; limited files with one shared-guard refactor.
- T360-2: High feasibility; mostly test implementation with existing harnesses.
- T360-3: High feasibility; documentation-only.

## Start Workflow (Execution Sequence)
1. Implement T360-1 and open PR-1.
2. After PR-1 merge, implement T360-2 and open PR-2.
3. After PR-2 merge, complete T360-3 and open PR-3.
4. Sync default branch after each merge before starting next ticket.
