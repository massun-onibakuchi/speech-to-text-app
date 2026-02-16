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

## Config
- `playwright.config.ts`
- Artifacts:
  - trace: `on-first-retry`
  - screenshot: `only-on-failure`
  - video: `retain-on-failure`
