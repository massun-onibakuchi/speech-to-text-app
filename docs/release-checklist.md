# Release Checklist

- Bump `package.json` version to the release version before tagging.
- Confirm the macOS signing secrets are configured in GitHub Actions:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
- Push a tag in the form `vX.Y.Z` to trigger `.github/workflows/release-macos.yml`.
- Verify the workflow uploaded the signed `.pkg` installer to the GitHub Release.
- Download and install the `.pkg` on macOS to confirm the release artifact is usable.
