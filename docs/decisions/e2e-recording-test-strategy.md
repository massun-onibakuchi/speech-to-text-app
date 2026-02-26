<!-- Where: docs/decisions/e2e-recording-test-strategy.md | What: E2E recording test strategy decision | Why: explain why we use both fake-media and synthetic-mic tests -->

# Decision: E2E Recording Test Strategy

## Context
- Chromium fake-media flags (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-audio-capture=...`) are useful for integration coverage.
- GitHub macOS runners intermittently fail to emit recorder chunks with fake media, which can make a strict payload-path test flaky.
- We still need deterministic CI/headless verification of the recording submission and success-processing flow.

## Options considered
- Fake-media only:
  - Pros: exercises Chromium flag path and WAV fixture end-to-end.
  - Cons: runner/browser flake can weaken CI signal or force fragile workarounds.
- Synthetic in-page microphone only (mock `getUserMedia`):
  - Pros: deterministic and fast in CI/headless.
  - Cons: does not validate fake-media flag wiring or fixture path.
- Hybrid (chosen):
  - Keep fake-media test as platform smoke/integration coverage.
  - Add deterministic synthetic-mic test for strict payload + success-path verification.

## Decision
- Use the hybrid strategy.

## Consequences
- CI gets stronger signal from the deterministic synthetic-mic test.
- The fake-media flag path remains covered without being the only proof of recording correctness.
- Test maintenance is slightly higher because there are two recording-flow tests with different goals.
