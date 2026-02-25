<!--
Where: docs/decisions/sound-asset-packaging.md
What: Decision record for where sound assets live in repo and how they are packaged.
Why: Ensure macOS `afplay` can read real files at runtime without asar indirection.
-->

# Decision: Sound Asset Packaging and Paths

## Context
- Dedicated MP3 cues are played via macOS `afplay` in the main process.
- `afplay` expects a real filesystem path; it cannot read files inside an ASAR archive.
- We need a stable dev path and a stable packaged path for these assets.

## Decision
- Store MP3 assets under `resources/sounds/` in the repo.
- Configure electron-builder `extraResources` to copy `resources/sounds` into the app
  resources directory at `sounds/`.
- Resolve packaged paths via `process.resourcesPath/sounds` and dev paths via
  `<project-root>/resources/sounds`.

## Rationale
- `extraResources` keeps binary-readable files outside the ASAR while remaining
  colocated with the app bundle.
- A single resolver function keeps dev/prod paths consistent and testable.
- Avoids introducing new runtime dependencies for audio playback.

## Consequences
- Build config must keep `extraResources` in sync with asset locations.
- Audio assets are excluded from ASAR and shipped as separate files.
- Any new audio files must be added under `resources/sounds` to be packaged.
