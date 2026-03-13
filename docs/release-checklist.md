# Release Checklist

- Bump `package.json` version to the release version before tagging.
- Push a tag in the form `vX.Y.Z` to trigger `.github/workflows/release-macos.yml`.
- Verify the workflow uploaded the unsigned `.dmg` and/or `.zip` assets to the GitHub Release.
- Download a release artifact on macOS and confirm the app bundle launches after the expected Gatekeeper prompt.
