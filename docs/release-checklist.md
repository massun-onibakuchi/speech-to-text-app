# Release Checklist

- Bump `package.json` version to the release version before tagging.
- Confirm the macOS signing secrets are configured in GitHub Actions:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
- Push a tag in the form `vX.Y.Z` to trigger `.github/workflows/release-macos.yml`.
- Verify the workflow uploaded the DMG, ZIP, and `latest-mac.yml` assets to the GitHub Release.
- Install the signed build on macOS and confirm the app prompts when a newer release is published.
