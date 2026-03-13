# Release Checklist

- Bump `package.json` version to the release version before tagging.
- Confirm `package.json#build.files` only ships `out/**` and `package.json`; runtime sounds and tray icons must stay in `extraResources`.
- Confirm `package.json#build.mac.icon` still points at `resources/icon/dock-icon.png`; it is a build-time input for electron-builder, not a packaged runtime asset.
- Push a tag in the form `vX.Y.Z` to trigger `.github/workflows/release-macos.yml`.
- Inspect the workflow log output from `scripts/report-release-artifacts.mjs` and record the produced `.dmg`/`.zip` sizes plus any discovered app executable architecture metadata.
- Verify the workflow uploaded the unsigned `.dmg` and/or `.zip` assets to the GitHub Release.
- Download a release artifact on macOS and confirm the app bundle launches after the expected Gatekeeper prompt.
