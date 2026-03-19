# Release Checklist

- Bump `package.json` version to the release version before tagging.
- Confirm `package.json#build.files` only ships `out/**` and `package.json`; runtime sounds and tray icons must stay in `extraResources`.
- Confirm `package.json#build.mac.icon` still points at `resources/icon/dock-icon.png`; it is a build-time input for electron-builder, not a packaged runtime asset.
- Push a tag in the form `vX.Y.Z` to trigger `.github/workflows/release-macos.yml`.
- Inspect the workflow log output from `scripts/report-release-artifacts.mjs` and record the produced `.dmg`/`.zip` sizes plus any discovered app executable architecture metadata.
- Verify the workflow uploaded the unsigned `.dmg` and/or `.zip` assets to the GitHub Release.
- Download a release artifact on macOS and confirm the app bundle launches after the expected Gatekeeper prompt.
- On Apple Silicon macOS, confirm Settings exposes `Local WhisperLiveKit` and the `Voxtral Mini 4B Realtime [streaming]` model.
- With the local provider selected, confirm Settings locks output to paste-at-cursor and explains why clipboard-copy is disabled.
- Validate first-run local runtime consent, install, and cancel flows from Settings > Speech-to-Text.
- Validate local runtime update and uninstall flows while no local session is active.
- Start a local streaming session and confirm localhost service startup succeeds, finalized chunks reach output, and Activity shows correlated `sessionId` plus chunk `sequence` state.
- Force a local runtime failure path and confirm diagnostics identify `sessionId`, phase, model, and runtime version in structured logs.
