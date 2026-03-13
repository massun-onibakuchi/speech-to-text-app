<!--
Where: docs/decision/12032026-manual-macos-release-without-autoupdate.md
What: Decision record for releasing unsigned macOS artifacts without GitHub auto-update integration.
Why: Keep release automation aligned with the product requirement to distribute direct-download artifacts without Apple Developer dependencies.
-->

# Decision: Manual macOS Releases Without Auto-Update

## Status

Accepted on March 12, 2026.

## Decision

- macOS releases are distributed as unsigned `.dmg` and `.zip` assets uploaded to GitHub Releases.
- The app no longer checks GitHub Releases for updates at runtime.
- The release workflow no longer publishes Electron auto-update metadata.
- The release workflow does not require Apple signing or notarization credentials.

## Why

- The current release need is downloadable app packaging, not in-app update orchestration.
- Shipping explicit `.dmg` and `.zip` assets avoids confusing GitHub Releases where the visible download was just the default source archive.
- The team does not use Apple Developer, so signed and notarized releases are not part of the supported flow.
- Removing the updater path also removes the requirement to publish `latest-mac.yml` and related GitHub release metadata.

## Consequences

- Users install new versions by downloading the latest `.dmg` or `.zip` from GitHub Releases.
- The app lifecycle no longer performs update checks on startup.
- The release workflow must always upload the built `.dmg` and `.zip` assets explicitly to the tagged GitHub Release.
- Users should expect the usual macOS Gatekeeper warning path for unsigned downloads.
