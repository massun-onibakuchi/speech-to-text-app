# GitHub Releases Auto-Update

## Context

The app did not have any updater logic, release metadata publishing, or operator docs for Electron auto-updates. The requested behavior is prompt-based updates on macOS using GitHub Releases.

## Decision

Use `electron-updater` in the main process with the electron-builder GitHub publish provider. Configure the updater with `autoDownload = false` so the app prompts before downloading, then prompt again after download completes before restarting to install.

## Why

- GitHub Releases is the simplest hosted update source for this app's current distribution model.
- `electron-updater` matches the existing electron-builder packaging flow and generates the release metadata the client consumes.
- Prompt-before-download is the least surprising UX for a utility that typically lives in the tray and may restart background behavior.

## Trade-Offs

- This assumes public GitHub Releases. Private-release update flows are not a good default because they push GitHub auth handling onto end-user clients.
- Auto-update will only work from signed packaged macOS builds, so local dev and unsigned artifacts intentionally skip update checks.
