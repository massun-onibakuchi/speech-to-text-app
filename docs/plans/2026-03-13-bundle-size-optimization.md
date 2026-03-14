---
type: plan
status: completed
review_by: 2026-03-20
tags:
  - performance
  - packaging
---

# Bundle Size Optimization Plan

## Context

- Repository baseline is an Electron macOS app defined in [specs/spec.md](/workspace/.worktrees/plan-bundle-size-optimization/specs/spec.md).
- Current packaging config in [package.json](/workspace/.worktrees/plan-bundle-size-optimization/package.json) still includes `resources/**` in `build.files`, while `resources/sounds` and `resources/tray` are also shipped through `extraResources`.
- Current release workflow in [.github/workflows/release-macos.yml](/workspace/.worktrees/plan-bundle-size-optimization/.github/workflows/release-macos.yml) already builds `dmg` and `zip`, not `pkg`.
- Current renderer font imports in [src/renderer/styles.css](/workspace/.worktrees/plan-bundle-size-optimization/src/renderer/styles.css) pull full `@fontsource` CSS entrypoints for Inter and Geist Mono.

## Measured Findings

- `resources/` is `12 MB` before packaging.
- The largest packaged candidate files under `resources/` are:
  - `resources/references/epicenter-main.zip` at about `10.1 MB`
  - `resources/icon/dock-icon.png` at about `1.6 MB`
  - `resources/references/WhiskrIO-master.zip` at about `0.5 MB`
- The `references/` archives are not runtime assets.
- Earlier clean-build inspection in the main workspace showed the compiled app payload itself is relatively small:
  - `out/` around `1.8 MB`
  - renderer JS around `773 KB`
  - emitted font assets around `775 KB`
- Conclusion: the immediate win is removing non-runtime packaged resources. After that, renderer fonts are the next clear code-level reduction. Release artifact strategy needs measurement before changing behavior.

## Worth Doing Assessment

### 1. Remove non-runtime packaged assets

**Worth doing now:** Yes.

- Benefit: immediate, low-risk reduction by removing `references/` archives and duplicated `sounds`/`tray` copies from the app bundle payload.
- Risk: low, because runtime sound and tray resolution already targets `process.resourcesPath` via `extraResources`.
- Confidence: high.

### 2. Trim renderer font payload

**Worth doing now:** Yes, after packaging cleanup.

- Benefit: modest but real reduction in emitted assets and renderer startup payload.
- Risk: medium, because reducing subsets too aggressively can break non-Latin glyph rendering.
- Confidence: medium-high if we limit the first pass to known-supported subsets and keep screenshots or DOM assertions.

### 3. Force single-arch release artifacts

**Worth doing now:** Not as a blind code change.

- Benefit: potentially large, but only if current artifacts are universal or if release policy allows separate Intel and Apple Silicon downloads.
- Risk: high product and distribution impact if Intel support is accidentally dropped.
- Confidence: low until we measure current artifact architecture from macOS output.

### 4. Change installer format / release targets

**Worth doing now:** No direct change planned.

- Main already uses `dmg` and `zip`.
- We should measure actual artifact sizes first and only change targets if data shows a clear payoff.
- This becomes a validation and observability ticket, not an immediate release-format PR.

## Priority Order

1. **Ticket 1:** Remove non-runtime packaged resources.
2. **Ticket 2:** Trim renderer font payload.
3. **Ticket 3:** Add macOS artifact measurement and decide whether arch strategy needs a follow-up PR.

## Ticket 1: Remove Non-Runtime Packaged Resources

**Priority:** P0  
**Dependency:** None  
**PR:** 1 ticket = 1 PR

### Goal

Reduce packaged app size by shipping only compiled app code in `build.files` and keeping runtime assets exclusively in `extraResources`.

### Expected Outcome

- Remove about `10.6 MB` of `resources/references/*` from packaged app inputs.
- Remove packaged-copy inclusion of non-runtime icon assets from `build.files`.
- Avoid duplicated packaged copies of `sounds` and `tray` assets by relying on `extraResources` only.

### Why This Ticket First

- It removes the most obvious waste in the current config.
- It has the best benefit-to-risk ratio.
- It creates a cleaner baseline for later size measurements.

### Scope Files

- [package.json](/workspace/.worktrees/plan-bundle-size-optimization/package.json)
- [src/main/infrastructure/sound-asset-paths.ts](/workspace/.worktrees/plan-bundle-size-optimization/src/main/infrastructure/sound-asset-paths.ts)
- [src/main/infrastructure/tray-icon-path.ts](/workspace/.worktrees/plan-bundle-size-optimization/src/main/infrastructure/tray-icon-path.ts)
- [site/src/app.tsx](/workspace/.worktrees/plan-bundle-size-optimization/site/src/app.tsx)
- New regression test file under `src/main/core/` or another existing testable location
- [docs/release-checklist.md](/workspace/.worktrees/plan-bundle-size-optimization/docs/release-checklist.md)

### Approaches

**Approach A: Minimal packaging fix**

- Change `build.files` from:

```json
"files": ["out/**", "resources/**", "package.json"]
```

- To:

```json
"files": ["out/**", "package.json"]
```

- Keep `extraResources` as the only packaged source for tray and sound assets.

**Approach B: Resource tree reorganization**

- Move runtime resources out of `resources/` into a more explicit runtime-only directory.
- Update electron-builder config and runtime resolvers together.

### Chosen Approach

Approach A.

- It solves the current waste without unnecessary file moves.
- It preserves the runtime contract already used by sound and tray loaders.
- It keeps the diff small and reviewable.

### Trade-Offs

- Pro: minimal risk, immediate reduction, fast to verify.
- Con: keeps the broader `resources/` directory structure intact, which may still confuse future contributors unless documentation is updated.
- Con: config-level regression tests will not prove final packaged contents by themselves, so this ticket still needs a packaging verification gate.

### Checklist

- [ ] Remove broad `resources/**` packaging from `build.files`.
- [ ] Confirm runtime sound and tray paths still match `extraResources`.
- [ ] Confirm `build.mac.icon` still resolves correctly as a build-time asset.
- [ ] Add regression test that fails if broad resource packaging returns.
- [ ] Update release docs with the packaging rule.
- [ ] Verify production build still succeeds.

### Tasks

1. Edit `package.json` packaging inputs.
2. Re-read sound and tray path resolvers to confirm no runtime dependency on `resources/**` inside the app bundle.
3. Re-read `build.mac.icon` usage and verify the implementer understands it is a build-time input, not a runtime packaged asset.
4. Add a test that reads `package.json` and asserts:
   - `files` is limited to compiled outputs and manifest.
   - `extraResources` still includes `sounds` and `tray`.
5. Update release checklist with a guardrail around package inputs and icon handling.
6. Run targeted tests and a production build or packaging dry run that proves the icon still resolves.

### Gates

- Build passes.
- Test passes.
- No code path reads `resources/references` or packaged `resources/icon/*` at runtime.
- `build.mac.icon` continues to resolve during packaging.
- Measured packaged-input reduction removes at least the `references/` payload from the app bundle inputs.
- Diff is limited to packaging config, regression coverage, and docs.

## Ticket 2: Trim Renderer Font Payload

**Priority:** P1  
**Dependency:** None for implementation, but should be measured against the Ticket 1 baseline before merge if possible  
**PR:** 1 ticket = 1 PR

### Goal

Reduce renderer asset size by replacing broad `@fontsource` imports with narrower subset imports that match actual product language requirements.

### Expected Outcome

- Reduce emitted renderer font assets from the current `~775 KB` baseline by at least `25%`.
- Keep app UI text rendering intact for the supported language set.

### Why This Ticket Second

- It is smaller impact than Ticket 1 but still worthwhile.
- It is isolated to the renderer and can be reviewed independently.
- It should be measured after Ticket 1 so renderer savings are not obscured by packaging waste.

### Scope Files

- [src/renderer/styles.css](/workspace/.worktrees/plan-bundle-size-optimization/src/renderer/styles.css)
- [site/src/styles.css](/workspace/.worktrees/plan-bundle-size-optimization/site/src/styles.css)
- Relevant renderer tests if font-dependent snapshots exist
- Release or plan docs if we need to document supported language subset assumptions

### Approaches

**Approach A: Use `latin` and `latin-ext` fontsource subsets**

Illustrative direction only. Exact import paths must be validated against the installed package exports before coding:

```css
@import "@fontsource/inter/<validated-subset-entry>.css";
@import "@fontsource/geist-mono/<validated-subset-entry>.css";
```

**Approach B: Self-host only selected `.woff2` files**

- Copy only the exact `.woff2` assets needed into the app source tree.
- Replace package imports with direct `@font-face` declarations.

### Chosen Approach

Approach A first.

- It keeps the current dependency model.
- It avoids introducing custom font asset management unless the subset imports are still too large.
- It is easy to revert if glyph coverage is insufficient.

### Trade-Offs

- Pro: small diff, low operational overhead, straightforward measurement.
- Con: requires an explicit decision on supported scripts; if the app must fully support Greek/Cyrillic/Vietnamese UI text, this ticket may need to retain more subsets than desired.
- Con: the marketing site also imports the same fonts, so the plan must either keep those imports aligned or explain why app and site differ.

### Checklist

- [ ] Inventory current emitted font files.
- [ ] Replace broad imports with narrower subset imports.
- [ ] Keep site and app styling decisions aligned, or explicitly document why they differ.
- [ ] Verify renderer build succeeds.
- [ ] Verify no visible glyph regressions in core UI copy.

### Tasks

1. Inspect available `@fontsource` subset entrypoints for Inter and Geist Mono.
2. Choose the minimal supported subset set for the app UI.
3. Update `src/renderer/styles.css`.
4. Decide whether `site/src/styles.css` should mirror the same subset strategy.
5. Run build and compare emitted font asset count and total size.
6. Run targeted UI smoke coverage if available.

### Gates

- Renderer build passes.
- Emitted font asset total decreases by at least `25%` from the measured baseline, or the PR documents why a smaller reduction is the practical limit.
- Core UI text renders correctly in the app.
- The subset decision is documented in the PR description or plan notes.

## Ticket 3: Measure macOS Artifact Size and Decide Arch Strategy

**Priority:** P2  
**Dependency:** Baseline measurement can start immediately; final arch decision should use post-Ticket-1 and post-Ticket-2 measurements  
**PR:** 1 ticket = 1 PR

### Goal

Make release size decisions from measured macOS artifacts instead of assumptions, then document whether a follow-up single-arch split ticket is justified.

### Expected Outcome

- Every macOS release run prints artifact names, sizes, and architecture metadata.
- The team has evidence to decide whether a single-arch split ticket is worth opening.

### Why This Ticket Exists

- The repo already targets `dmg` and `zip`, so changing formats blindly is not grounded.
- The first value of this ticket is a trustworthy baseline, not an immediate size reduction.
- The remaining large size may come mostly from Electron runtime and architecture choices.
- We need artifact-level evidence before changing release distribution policy.

### Scope Files

- [.github/workflows/release-macos.yml](/workspace/.worktrees/plan-bundle-size-optimization/.github/workflows/release-macos.yml)
- [scripts/release-dry-run.sh](/workspace/.worktrees/plan-bundle-size-optimization/scripts/release-dry-run.sh)
- New measurement script if needed
- `docs/decision/` ADR if the ticket makes a release-policy decision
- [docs/release-checklist.md](/workspace/.worktrees/plan-bundle-size-optimization/docs/release-checklist.md)

### Approaches

**Approach A: Add release artifact reporting only**

- Emit file sizes, artifact names, and architecture metadata in CI logs.
- Document findings and stop there unless the data justifies another PR.

Possible shell direction:

```bash
find dist -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.zip' \) -exec du -h {} \;
```

**Approach B: Add reporting plus a soft size budget**

- Report sizes in CI.
- Warn, but do not fail, when an artifact exceeds a documented threshold.

**Approach C: Immediate single-arch split**

- Change release outputs to separate Intel and Apple Silicon artifacts now.

### Chosen Approach

Approach A, possibly extended to B if the reporting step is easy and non-disruptive.

- It is feasible in one PR.
- It reduces decision risk.
- It respects the product risk around Intel support and distribution UX.

### Trade-Offs

- Pro: evidence-based, low-risk, creates durable visibility.
- Con: may not reduce size directly in the same PR.

### Checklist

- [ ] Add a reproducible artifact-size measurement step for macOS release outputs.
- [ ] Capture architecture metadata for produced app artifacts.
- [ ] Document findings in release docs or an ADR if policy changes are proposed.
- [ ] Decide whether a follow-up ticket for single-arch distribution is justified.

### Tasks

1. Review current release workflow and dry-run script.
2. Add a script or workflow step that prints artifact sizes.
3. Add architecture inspection for the produced `.app` or packaged artifact.
4. Record measured outputs in docs.
5. Decide:
   - Capture a baseline before the earlier tickets if available.
   - If artifacts are already single-arch and size remains acceptable after Tickets 1 and 2, stop here.
   - If artifacts are universal and the product can support split downloads, create a new implementation ticket for single-arch distribution.

### Gates

- CI or documented local macOS run produces artifact size data.
- Architecture of release artifacts is explicit, not assumed.
- Any release-policy change has an ADR or equivalent documented decision.
- No release behavior changes are merged without measured evidence.

## Dependency Graph

- Ticket 1 unlocks a clean packaging baseline.
- Ticket 2 can proceed independently, but its success should be compared against the Ticket 1 baseline if possible.
- Ticket 3 starts with baseline measurement and ends with a post-change decision; only the final arch-policy recommendation depends on later ticket outcomes.

## Proposed Execution Chunks

### Chunk A: Packaging Baseline

- Complete Ticket 1.
- Measure build output and confirm packaging inputs are reduced.

### Chunk B: Renderer Asset Trim

- Complete Ticket 2.
- Re-measure emitted renderer assets and note the delta.

### Chunk C: Release Artifact Evidence

- Complete Ticket 3.
- Decide whether a separate arch-policy PR is warranted.

## Risks to Watch

- Hidden runtime dependency on packaged `resources/**` beyond `extraResources`.
- Font subset changes silently breaking non-Latin UI copy.
- Making release-policy changes without verifying audience and support expectations.
- Confusion between build-time icon inputs and runtime packaged assets.

## Not Planned In This Sequence

- Electron major-version changes purely for size.
- Release target changes without artifact data.
- Deep asset pipeline refactors before the packaging baseline is corrected.
- Marketing-site-specific image optimization for `site/src/app.tsx` is noted but not prioritized here because it affects web payload more than packaged app bundle size.
