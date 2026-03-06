<!--
Where: docs/decisions/issue-400-dock-icon-and-titlebar-icon.md
What: Decision record for issue #400 title bar icon removal and dock icon wiring.
Why: Capture scope, trade-offs, and the current source-of-truth icon path to prevent regressions.
-->

# Decision: Issue #400 Dock Icon + Title Bar Icon

Date: 2026-03-06  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/400

## Context

Issue #400 requests:
- remove the upper-left title bar icon
- set dock icon branding to provided microphone/document artwork

Current repository state at implementation time:
- latest `main` includes canonical dock icon at `resources/icon/dock-icon.png`

## Decision

1. macOS window title bar style is changed from `hiddenInset` to `hidden` in `WindowManager`.
2. mac packaging config now explicitly uses `resources/icon/dock-icon.png` from main branch.

## Scope

- `src/main/core/window-manager.ts`
- `src/main/core/window-manager.test.ts`
- `package.json`
- `resources/icon/dock-icon.png`

## Trade-offs

- Chosen: use the canonical dock icon file already introduced on `main`.
  - Pros: matches latest repository source-of-truth, no generated placeholders, deterministic build path.
  - Cons: still requires manual visual confirmation on macOS dock after packaging.

## Follow-up Trigger

If icon branding changes again, replace `resources/icon/dock-icon.png` while keeping the same build path so no code changes are required.
