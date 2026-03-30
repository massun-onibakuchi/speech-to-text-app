# Release Checklist

- Bump `package.json#version` on `main`; the release workflow creates the matching `vX.Y.Z` tag before building.
- Confirm `package.json#build.files` only ships `out/**` and `package.json`; runtime sounds and tray icons must stay in `extraResources`.
- Confirm `package.json#build.mac.icon` still points at `resources/icon/dock-icon.png`; it is a build-time input for electron-builder, not a packaged runtime asset.
- Use `workflow_dispatch` only on an existing `vX.Y.Z` tag when you need to backfill or re-run a release from that exact tagged commit.
- Inspect the workflow log output from `scripts/report-release-artifacts.mjs` and record the produced `.dmg`/`.zip` sizes plus any discovered app executable architecture metadata.
- Verify the workflow uploaded the unsigned `.dmg` and/or `.zip` assets to the GitHub Release.
- Download a release artifact on macOS and confirm the app bundle launches after the expected Gatekeeper prompt.
