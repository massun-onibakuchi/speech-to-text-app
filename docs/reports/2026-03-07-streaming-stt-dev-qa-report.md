<!--
Where: docs/reports/2026-03-07-streaming-stt-dev-qa-report.md
What: Standalone QA report for the streaming STT work merged into dev.
Why: Provide a shareable validation snapshot for readers who do not know the
     implementation history, ticket breakdown, or prior review context.
-->

# Streaming STT QA Report

Date: 2026-03-07

## Goal

Validate that the streaming STT work merged into `dev` is internally consistent, builds successfully, and passes the targeted automated regression suite for:

- raw streaming dictation
- transformed streaming with ordered commit
- per-segment raw fallback on transform failure
- preserved batch-mode behavior

This report is intended to be shareable with readers who do not already know the project history.

## Assumptions

- Target branch under validation is `origin/dev` at commit `09962a0ea5f5f82c95e5980b139fd3b5cb2d441f`.
- The feature merged into `dev` came from PR [#422](https://github.com/massun-onibakuchi/speech-to-text-app/pull/422).
- This QA run was executed in a headless development environment, not on a live macOS desktop with microphone input, Accessibility permissions, or Apple Silicon hardware.
- Automated verification can prove contract integrity, ordering behavior, fallback behavior, and build health, but it cannot replace manual validation for live audio capture, paste automation into real apps, or packaged-app hardware behavior.

## Definition

For this report:

- `default mode` means the existing batch capture path that records one blob, submits it after stop, and supports both raw and transformed batch output.
- `streaming mode` means the session-based audio ingress path that stays active until explicit stop or cancel.
- `stream_raw_dictation` means finalized raw STT segments are committed in source order.
- `stream_transformed` means finalized raw STT segments are transformed concurrently, committed in source order, and fall back to raw text on per-segment transform failure.
- `QA passed in this environment` means the listed automated checks completed successfully without local diffs or build/type errors.
- `manual QA still required` means validation that depends on real UI focus, microphone capture, OS permissions, cloud credentials, or hardware-specific runtime behavior.

## Contexts

### What was validated

- Branch target:
  - `origin/dev` at `09962a0ea5f5f82c95e5980b139fd3b5cb2d441f`
- Merge state:
  - PR [#422](https://github.com/massun-onibakuchi/speech-to-text-app/pull/422) is merged into `dev`
- Primary implementation areas covered by this QA run:
  - streaming session routing and lifecycle
  - transformed streaming execution lane
  - bounded transform worker pool
  - ordered output commit
  - raw fallback behavior
  - renderer settings enablement for transformed streaming
  - provider/runtime contract compatibility for local `whisper.cpp` and Groq rolling upload

### Sources consulted for QA scope

- `docs/qa/streaming-raw-dictation-manual-checklist.md`
- `specs/spec.md`
- `docs/decisions/2026-03-07-streaming-transformed-lane-fallback-routing-decision.md`

### Executed checks

1. Branch verification
   - `git fetch origin dev && git rev-parse origin/dev`
   - Result: `origin/dev` resolved to `09962a0ea5f5f82c95e5980b139fd3b5cb2d441f`

2. Static validation
   - `pnpm typecheck`
   - Result: passed

3. Build validation
   - `pnpm build`
   - Result: passed for main, preload, and renderer bundles

4. Targeted streaming regression suite
   - `pnpm vitest run src/main/services/streaming/segment-transform-worker-pool.test.ts src/main/services/streaming/streaming-segment-router.test.ts src/main/services/streaming/streaming-session-controller.test.ts src/main/core/command-router.test.ts src/shared/domain.test.ts src/renderer/settings-streaming-react.test.tsx src/renderer/settings-output-react.test.tsx src/renderer/settings-mutations.test.ts src/main/services/transformation/gemini-transformation-adapter.test.ts src/main/services/output-service.test.ts src/main/ipc/register-handlers.test.ts src/main/services/streaming/cloud-streaming-provider-registry.test.ts src/main/services/streaming/groq-rolling-upload-adapter.test.ts src/main/services/streaming/whispercpp-streaming-adapter.test.ts src/renderer/app-shell-react.test.tsx`
   - Result: 15 test files passed, 164 tests passed

### Validated behaviors covered by the automated suite

- `stream_transformed` startup is independent from batch output selection
- finalized transformed segments commit in source order even when transforms finish out of order
- per-segment transform failure falls back to raw text and does not end the session
- normal stop/dispose does not emit false fallback errors for queued transform work
- rolling summary context is refreshed so older segments are not dropped forever
- provider adapters no longer reject `stream_transformed` at the STT layer
- renderer settings allow transformed streaming selection while keeping batch output behavior intact
- existing batch-mode paths remain covered by regression tests that still pass

### Manual QA still required

The following items were not executed in this environment and still need operator validation on macOS:

- live microphone capture start/stop behavior
- pause chunking while keeping the session active until explicit stop
- Accessibility-permission failure handling with real paste automation
- focus-sensitive paste ordering into real target apps
- Groq credential/auth/network behavior with live API access
- local `whisper.cpp` + Core ML behavior on supported Apple Silicon hardware
- packaged-app validation and the hardware/package follow-up tracked in issue [#421](https://github.com/massun-onibakuchi/speech-to-text-app/issues/421)

### Summary

Status in this environment: pass.

Interpretation:

- The merged `dev` branch passed the targeted automated QA bundle for the streaming STT implementation, including the transformed streaming lane.
- The code is ready for manual desktop QA on `dev`.
- Promotion beyond `dev` should wait for the outstanding manual/macOS/hardware checks listed above.
