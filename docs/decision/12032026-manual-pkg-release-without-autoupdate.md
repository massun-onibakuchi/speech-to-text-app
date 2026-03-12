<!--
Where: docs/decision/12032026-manual-pkg-release-without-autoupdate.md
What: Decision record for releasing a signed macOS pkg without GitHub auto-update integration.
Why: Keep release automation aligned with the product requirement to distribute installer packages only.
-->

# Decision: Manual PKG Releases Without Auto-Update

## Status

Accepted on March 12, 2026.

## Decision

- macOS releases are distributed as signed `.pkg` installers uploaded to GitHub Releases.
- The app no longer checks GitHub Releases for updates at runtime.
- The release workflow no longer publishes Electron auto-update metadata.

## Why

- The current release need is installer delivery, not in-app update orchestration.
- Shipping only the `.pkg` avoids confusing GitHub Releases where the visible download was just the default source archive.
- Removing the updater path also removes the requirement to publish `latest-mac.yml` and related GitHub release metadata.

## Consequences

- Users install new versions by downloading the latest `.pkg` from GitHub Releases.
- The app lifecycle no longer performs update checks on startup.
- The release workflow must always upload the built `.pkg` explicitly to the tagged GitHub Release.
