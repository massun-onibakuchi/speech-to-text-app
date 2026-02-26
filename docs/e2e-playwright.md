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

## Coverage included
- App launch smoke test (Home/Settings navigation).
- Settings save flow behavior assertion.
- Provider API key input visibility in Settings.
- macOS-only provider API key positive save/status path (`@macos` tagged).
- macOS fake microphone recording flow using Chromium fake-media flags + fixture WAV, including deterministic success-path toast assertion (`@macos` tagged).
- Cross-platform deterministic recording flow using an in-page synthetic microphone stream (mocked `getUserMedia`) with strict success-path assertions.
- Transform preflight blocking when Google API key is missing.

## Config
- `playwright.config.ts`
- Artifacts:
  - trace: `on-first-retry`
  - screenshot: `only-on-failure`
  - video: `retain-on-failure`

## Fake Audio Recording Test (`#95`)
- Fixture WAV: `e2e/fixtures/test-recording.wav` (resolved + existence-checked to an absolute path at runtime in the spec).
- Electron/Chromium launch flags used by the test:
  - `--use-fake-ui-for-media-stream`
  - `--use-fake-device-for-media-stream`
  - `--use-file-for-fake-audio-capture=<absolute fixture path>`
- The test validates recording start/stop UI behavior, asserts the renderer submits a recorded payload under fake-media flags, and deterministically simulates a succeeded history record so the asynchronous `Transcription complete.` toast path is covered without live STT calls.
- Strategy choice:
  - Keep a macOS fake-media smoke/integration test to verify Chromium fake-media flags + WAV fixture wiring.
  - Add a deterministic synthetic-mic test to provide stable CI/headless verification of the recording submission + success-toast path without depending on runner audio-device quirks.
- Retry/timeout policy:
  - Uses global Playwright retries from `playwright.config.ts` (`CI=2`, local `0`).
  - Uses an explicit ~1000ms capture window before stop to reduce empty-chunk flake while exercising the recording path.
- CI fallback:
  - If fake-media flags regress on a macOS runner image, inspect Playwright trace/video artifacts and temporarily quarantine the test with a documented `test.skip(...)` guard until the runner/browser issue is resolved.
