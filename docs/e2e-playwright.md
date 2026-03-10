# Playwright E2E (Electron)

This project includes Electron UI E2E tests using Playwright.

## Commands
- `pnpm run test:e2e` (auto-uses `xvfb-run` when available)
- `pnpm run test:e2e:headed`

## Local prerequisites (Linux)
Electron requires desktop runtime libraries even for automated tests.

Install minimum dependencies:
- `xvfb`
- `libglib2.0-0`
- `libnss3`
- `libatk-bridge2.0-0`
- `libdrm2`
- `libgtk-3-0`
- `libgbm1`
- `libasound2` (or `libasound2t64` depending on distro)

Example (Ubuntu):
```bash
sudo apt-get update
sudo apt-get install -y \
  xvfb \
  libglib2.0-0 \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libgtk-3-0 \
  libgbm1 \
  libasound2t64
```

Run in virtual display when needed:
```bash
pnpm run build
xvfb-run -a pnpm exec playwright test
```

## CI
GitHub Actions workflow: `.github/workflows/e2e-playwright-electron.yml`

Artifacts are uploaded on every run:
- `playwright-report/`
- `test-results/`

Audio-specific CI coverage now runs on `ubuntu-latest` under Xvfb and executes
`e2e/electron-groq-streaming-recording.e2e.ts` with the `@fake-audio` and
`@synthetic-audio` tags so recording verification is pass/fail, not skip-only.
Manual workflow runs can disable that Linux lane with the `run_audio_linux`
dispatch input when only macOS smoke or live-provider checks are needed.

## Coverage included
- App launch smoke test (Home/Settings navigation).
- Settings save flow behavior assertion.
- Provider API key input visibility in Settings.
- macOS-only provider API key positive save/status path (`@macos` tagged).
- macOS fake microphone recording smoke using Chromium fake-media flags + fixture WAV (`@macos` tagged).
- Deterministic recording flow using an in-page synthetic microphone stream (mocked `getUserMedia`) with strict success-path assertions (`@macos` tagged in current CI workflow).
- Cross-platform Groq streaming browser-VAD recording using a synthetic `getUserMedia` microphone backed by the PR 461 WAV speech fixtures, with the main-process Groq upload fetch stubbed so the test exercises utterance IPC and rendered streamed text.
- Cross-platform Groq streaming browser-VAD recording using Chromium fake-media WAV capture from PR 461, with the main-process Groq upload fetch stubbed so the test verifies utterance IPC plus rendered streamed text (`@fake-audio` tagged).
- Transform preflight blocking when Google API key is missing.

## Config
- `playwright.config.ts`
- Artifacts:
  - trace: `on-first-retry`
  - screenshot: `only-on-failure`
  - video: `retain-on-failure`

## Fake Audio Recording Test (`#95`)
- Fixture WAV: `e2e/fixtures/test-recording.wav` (resolved + existence-checked to an absolute path at runtime in the spec).
- Streaming speech fixtures:
  - `e2e/fixtures/Recording-1-sentence-jp.wav`
  - `e2e/fixtures/Recording-2-sentences-jp.wav`
- Electron/Chromium launch flags used by the test:
  - `--use-fake-ui-for-media-stream`
  - `--use-fake-device-for-media-stream`
  - `--use-file-for-fake-audio-capture=<absolute fixture path>`
- The fake-media test validates recording start/stop UI behavior under Chromium fake-media flags and checks deterministic submission payload hooks; on macOS CI runner no-submission flakes it records a warning annotation instead of failing the full suite.
- Strategy choice:
  - Keep a cross-platform synthetic-WAV microphone test so Groq streaming recording can be validated on non-macOS hosts too.
  - Keep a macOS fake-media smoke/integration test to verify Chromium fake-media flags + WAV fixture wiring.
  - Keep a separate Groq streaming test that uses real speech WAV fixtures and checks that streamed text reaches the renderer without a capture-failure toast under both synthetic and Chromium fake-audio paths.
  - For CI determinism, the Groq streaming spec injects a fixture-derived utterance through the same renderer-to-main utterance IPC bridge after the recording session becomes active, so the test remains focused on the bug-bearing Groq handoff even when browser VAD itself is runner-sensitive.
  - Keep a deterministic synthetic-mic `@macos` test to provide stable CI/headless verification of the recording submission + success-toast path; CI-only synthetic chunk fallback remains in place for rare no-chunk runner behavior.
- Retry/timeout policy:
  - Uses global Playwright retries from `playwright.config.ts` (`CI=2`, local `0`).
  - The Groq streaming audio spec raises each test timeout to 90 seconds because Electron launch, settings reload, VAD startup, and streamed-text waits together exceed the default 60-second budget on slower CI runners.
  - The batch fake-media recording smoke still uses an explicit ~1000ms capture window before stop to reduce empty-chunk flake while exercising the recording path.
  - The cross-platform Groq synthetic-WAV spec uses the real speech fixtures and waits for rendered streamed text instead of a fixed capture window.
  - The Groq streaming spec waits for rendered streamed text instead of a fixed capture window.
- CI fallback:
  - If fake-media flags regress on a macOS runner image, inspect Playwright trace/video artifacts and temporarily quarantine the test with a documented `test.skip(...)` guard until the runner/browser issue is resolved.
