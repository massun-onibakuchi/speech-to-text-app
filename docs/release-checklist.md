# Release Checklist (v1)

## Scope
This checklist defines the minimum release workflow for direct macOS distribution.

## 1. Versioning and Branch Hygiene
- [ ] Confirm release branch is up to date with mainline.
- [ ] Confirm version bump in `package.json`.
- [ ] Confirm `PLAN.md` and `CONTINUITY.md` are consistent with release state.

## 2. Local Quality Gates
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `pnpm run build`
- [ ] `pnpm run contract:smoke`
- [ ] Confirm transformation shortcut behavior matrix tests pass (default-target, pick-and-run, change-default, selection-target).

## 3. Packaging
- [ ] `pnpm run dist:mac`
- [ ] Run packaging on macOS runner/host (v1 target is macOS direct distribution).
- [ ] Verify macOS artifacts generated (`dmg`, `zip`) under distribution output.
- [ ] Verify app launch from packaged artifact on target macOS.

## 4. Code Signing (Placeholder)
- [ ] Configure Apple Developer signing identity in CI/local keychain.
- [ ] Confirm `electron-builder` mac signing configuration is enabled for release profile.
- [ ] Validate signed app with `codesign --verify --deep --strict`.

## 5. Notarization (Placeholder)
- [ ] Configure notarization credentials (App Store Connect API key or Apple ID flow).
- [ ] Submit artifact for notarization and wait for success.
- [ ] Staple notarization ticket to app artifact.
- [ ] Validate with `spctl --assess --type execute`.

## 6. Release Notes and Artifacts
- [ ] Document release notes: features, fixes, known limitations.
- [ ] Include migration notes (if any configuration/state changes).
- [ ] Attach `dmg` and `zip` artifacts.

## 7. Post-Release Verification
- [ ] Smoke test recording/transcription/transform/output on clean macOS machine.
- [ ] Verify accessibility flow and paste behavior.
- [ ] Verify provider diagnostics and error guidance surfaces.
- [ ] Verify transformation shortcut text normalization and no-selection feedback (`clipboard` and `selection` paths).
