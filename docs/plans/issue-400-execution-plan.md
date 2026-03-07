<!--
Where: docs/plans/issue-400-execution-plan.md
What: Step-by-step execution plan for issue #400 (remove title bar icon, replace dock icon branding).
Why: Ensure implementation is scoped, testable, and blocked on clear acceptance gates before any code changes.
-->

# Execution Plan: Issue #400 — Replace Dock Icon and Remove Title Bar Icon

Date: 2026-03-06  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/400  
Status: Plan completed; implementation started on 2026-03-06

## Baseline Summary

Current relevant implementation:
- `src/main/core/window-manager.ts`
  - macOS window uses `titleBarStyle: 'hiddenInset'`.
  - no explicit app dock icon wiring in main-process runtime.
- `src/main/core/window-manager.test.ts`
  - asserts darwin config uses `hiddenInset`.
- `package.json`
  - `build.mac.icon` is not configured.
  - `resources/**` are included in packaged app.
- `resources/tray/*`
  - tray icon assets exist, but no dedicated dock app icon pipeline is defined.

Observed gap against issue #400:
- No deterministic app dock branding source/config in build.
- macOS title bar currently uses style that can surface native title elements; requested behavior is to remove upper-left icon from title bar.
- Provided reference artwork is not currently present in repo and must be sourced before implementation.

## External API Notes (Verified)

- Electron Dock API supports `dock.setIcon(image)` on macOS (`app.dock`).
- Electron `BrowserWindow` window-icon APIs are platform-scoped (e.g., `setIcon` is Windows/Linux), so macOS dock branding should be handled via app icon build config and/or `app.dock.setIcon` runtime path.
- electron-builder icon docs: mac app icon should be explicitly provided (`.icon`, `.icns`, or `.png`) to avoid default Electron branding.

## Ticket Priority and Granularity

| Priority | Ticket | Goal | Feasibility | Risk |
|---|---|---|---|---|
| P0 | T400-0: Asset readiness and canonical source | Ensure reference artwork is available and normalized into one canonical source asset. | Medium (blocked by asset availability) | Medium |
| P1 | T400-1: Remove title bar icon surface | Adjust macOS BrowserWindow title-bar config so upper-left icon no longer appears. | High | Low-Medium |
| P1 | T400-2: Dock icon build/runtime wiring | Wire new icon into packaged app (and optionally runtime dock update) with deterministic paths. | High once asset exists | Medium |
| P2 | T400-3: Verification, regression tests, and docs | Lock behavior with tests + docs so branding doesn’t regress. | High | Low |

Priority rationale:
- P0 is a hard dependency; implementation quality is impossible without the reference image.
- P1 tickets directly satisfy the acceptance criteria.
- P2 ensures durability and release confidence.

---

## Ticket: T400-0 — Asset Readiness and Canonical Source

### Goal
Establish a single source-of-truth dock icon asset derived from the provided microphone/document artwork.

### Approach
- Locate/download the exact artwork referenced in issue #400.
- Normalize to a canonical source file for repository storage.
- Decide whether to commit generated platform derivatives (e.g., `.icns`) or generate at build/release time.

### Scope Files
- `resources/icons/` (new directory or agreed existing path)
- `docs/plans/issue-400-execution-plan.md` (this file, update status notes during implementation)
- optional script path if generation is scripted:
  - `scripts/` (new small utility, only if needed)

### Trade-offs

Option A (recommended): Commit canonical PNG + commit generated `.icns`
- Pros: deterministic builds, no local tooling requirement during packaging.
- Cons: binary asset duplication in repo.

Option B: Commit canonical PNG only and generate `.icns` in release workflow
- Pros: less binary footprint.
- Cons: adds tool dependency/step risk during packaging.

### Proposed Snippet (non-applied)
```text
resources/icons/
  app-dock-source.png
  app-dock.icns
```

### Checklist
- [ ] Reference artwork is retrieved and verified against issue request.
- [ ] Canonical source asset path is finalized.
- [ ] Asset dimensions/quality meet macOS icon needs (>= 512x512 baseline).
- [ ] Strategy for generated derivatives is decided and documented.

### Tasks
1. Confirm exact artwork file from issue context (or request from reporter if missing).
2. Add canonical asset into repo path.
3. (If needed) generate `.icns` derivative from canonical source.
4. Record chosen asset strategy in plan/decision notes.

### Gates
- Gate A: Asset is visually confirmed against provided artwork.
- Gate B: Canonical file path is stable and referenced by implementation.
- Gate C: No placeholder/default Electron icon assets remain in proposed wiring.

### Potential Risks
- Artwork not available from issue payload.
- Incorrectly scaled/compressed icon causing blurry dock rendering.

---

## Ticket: T400-1 — Remove Title Bar Icon Surface

### Goal
Ensure window title bar no longer shows the existing upper-left app icon.

### Approach
- Update macOS title bar style from current `hiddenInset` flow to a style that removes the icon surface while preserving required window controls.
- Keep change isolated to `WindowManager` window options.

### Scope Files
- `src/main/core/window-manager.ts`
- `src/main/core/window-manager.test.ts`

### Trade-offs

Option A (recommended): switch darwin `titleBarStyle` to `hidden`
- Pros: minimal code change, directly targets visible native title elements.
- Cons: slight visual shift in traffic light placement compared with `hiddenInset`.

Option B: keep `hiddenInset` and attempt targeted macOS icon suppression APIs
- Pros: preserves current inset appearance.
- Cons: higher complexity and brittle behavior; less deterministic.

### Proposed Snippet (non-applied)
```ts
const titlebarOptions = process.platform === 'darwin'
  ? {
      titleBarStyle: 'hidden' as const,
      backgroundColor: '#1a1a1f'
    }
  : { /* unchanged */ }
```

### Checklist
- [ ] macOS window config no longer uses icon-showing style.
- [ ] Existing window lifecycle behavior (hide-on-close, focus/show paths) remains unchanged.
- [ ] Unit tests updated to assert new darwin title bar config.

### Tasks
1. Update darwin title bar options.
2. Adjust darwin option assertions in `window-manager.test.ts`.
3. Re-run targeted tests.

### Gates
- Gate A: Automated test verifies expected darwin title bar option.
- Gate B: Manual macOS smoke confirms upper-left title icon is gone.

### Potential Risks
- Unintended visual regression in traffic light alignment.
- macOS-specific differences across versions.

---

## Ticket: T400-2 — Dock Icon Build/Runtime Wiring

### Goal
Ship the new dock icon branding correctly in desktop app builds and at launch.

### Approach
- Configure electron-builder mac icon explicitly to new asset path.
- Optionally set runtime `app.dock.setIcon(...)` for dev/runtime consistency if packaged icon is insufficient in local flows.
- Remove any obsolete/legacy icon path logic that becomes unnecessary.

### Scope Files
- `package.json`
- `src/main/core/app-lifecycle.ts` (only if runtime `app.dock.setIcon` is added)
- `src/main/core/app-lifecycle.test.ts` (if runtime path added)
- `resources/icons/*` (new assets)

### Trade-offs

Option A (recommended): Build-time icon wiring only (`build.mac.icon`)
- Pros: clean, standard packaging path, low runtime branching.
- Cons: dev-mode dock icon may not mirror packaged branding in all environments.

Option B: Build-time icon + runtime `app.dock.setIcon`
- Pros: consistent branding in more run modes.
- Cons: extra platform-conditional runtime code.

### Proposed Snippet (non-applied)
```json
{
  "build": {
    "mac": {
      "icon": "resources/icons/app-dock.icns",
      "target": ["dmg", "zip"],
      "hardenedRuntime": true
    }
  }
}
```

```ts
if (process.platform === 'darwin' && app.dock) {
  app.dock.setIcon(join(iconDir, 'app-dock.png'))
}
```

### Checklist
- [ ] mac build config explicitly points to new app icon asset.
- [ ] Legacy/default icon fallback paths are removed if no longer needed.
- [ ] Build output launches with updated dock icon branding.

### Tasks
1. Add icon config to build settings.
2. Add runtime dock icon set call only if needed after validation.
3. Clean obsolete icon code/paths.
4. Validate packaged app branding.

### Gates
- Gate A: `pnpm run dist:mac` (or CI equivalent) completes with explicit icon config.
- Gate B: Packaged app dock icon matches reference artwork.
- Gate C: No stale icon path constants remain in main process.

### Potential Risks
- Incorrect asset format/path breaks packaging.
- Dock icon cache on macOS causing false negatives during validation.

---

## Ticket: T400-3 — Tests, Docs, and Release Verification

### Goal
Prevent regressions by locking expectations with tests and concise documentation.

### Approach
- Update existing tests for title bar behavior and any new dock runtime logic.
- Add a short decision note if implementation uses non-trivial icon pipeline choices.
- Document verification steps for QA/release checklist.

### Scope Files
- `src/main/core/window-manager.test.ts`
- `src/main/core/app-lifecycle.test.ts` (if touched)
- `docs/decisions/issue-400-dock-icon-and-titlebar-icon.md` (new, only if needed)
- `readme.md` or release checklist docs (if icon packaging instructions are needed)

### Trade-offs

Option A (recommended): Extend existing tests only where behavior changed
- Pros: small diff, focused signal.
- Cons: less broad refactor coverage.

Option B: add new end-to-end visual assertions
- Pros: higher confidence.
- Cons: heavier and more brittle for icon/UI chrome checks.

### Proposed Snippet (non-applied)
```ts
expect(opts.titleBarStyle).toBe('hidden')
expect(buildConfig.mac.icon).toBe('resources/icons/app-dock.icns')
```

### Checklist
- [ ] At least one regression test added/updated per changed behavior.
- [ ] Documentation updated for icon source and packaging path.
- [ ] Manual validation steps recorded.

### Tasks
1. Update/extend unit tests.
2. Add/update docs (decision note if architecture choice is non-trivial).
3. Run targeted test commands and record results.

### Gates
- Gate A: `pnpm vitest run src/main/core/window-manager.test.ts` passes.
- Gate B: any touched lifecycle/build tests pass.
- Gate C: Manual smoke on macOS confirms acceptance criteria.

### Potential Risks
- Tests passing without true packaged-icon validation.
- Missing doc notes causing future icon regressions.

---

## Step-by-Step Execution Order

1. Complete T400-0 (asset readiness gate).  
2. Implement T400-1 (title bar icon removal).  
3. Implement T400-2 (dock icon wiring).  
4. Complete T400-3 (tests/docs/verification).  
5. Open PR with issue link and acceptance evidence.

## Feasibility Summary

- Overall feasibility: **High after asset is available**.
- Current blocker: reference artwork is not present in repository or issue comments payload.
- Confidence: **85%** for implementation once asset is provided/located.

## Risk Register

- R1: Missing/ambiguous artwork source.
  - Mitigation: hard gate before coding.
- R2: macOS dock icon cache obscures validation.
  - Mitigation: test on clean app bundle/version bump when validating.
- R3: UI chrome shift from `hiddenInset` to `hidden`.
  - Mitigation: focused manual smoke + test assertions for required options only.

## Proposed Approaches Summary

- Primary approach: small, direct updates in `window-manager` + explicit build icon config.
- Alternative approach: runtime dock override via `app.dock.setIcon` if build-only path is insufficient.
- Out of scope: tray icon redesign, unrelated UI refactors, cross-platform icon rebranding beyond issue #400.
