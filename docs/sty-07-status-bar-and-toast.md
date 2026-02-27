<!--
Where: docs/sty-07-status-bar-and-toast.md
What: STY-07 implementation notes for footer status bar and toast visual migration.
Why: Capture shipped metadata/connectivity/footer and toast tone contract.
-->

# STY-07 Status Bar and Toast Visual Migration

**Date**: 2026-02-27
**Scope**: Footer status bar + toast item visual migration only.

## Implemented Behavior

- Status bar footer keeps compact strip layout (`border-t bg-card/50 px-4 py-1.5`) with split clusters.
- Left metadata cluster shows:
  - STT provider/model (`provider/model`)
  - LLM provider (from default profile)
  - audio device id
- Right metadata cluster shows:
  - active profile name (`data-status-active-profile`)
  - connectivity icon + text pair (`data-status-connectivity`)
- Connectivity maps to existing readiness signal (`ping`):
  - `pong` -> `Ready` + Wifi icon
  - otherwise -> `Offline` + WifiOff icon
- Toast cards now include explicit tone label + icon (Info/Success/Error) and semantic border tint:
  - success: `border-success/20`
  - error: `border-destructive/30`
  - info: default border
- Toast items expose `data-toast-tone` and retain existing role semantics (`alert` for error, otherwise `status`).

## Validation

- `src/renderer/status-bar-react.test.tsx`
  - verifies metadata render and ready/offline connectivity text.
- `src/renderer/app-shell-react.test.tsx`
  - verifies toast tone labels and tone data attributes.

## Rollback

1. Revert STY-07 commit(s).
2. Run:
   - `pnpm -s vitest run src/renderer/status-bar-react.test.tsx src/renderer/app-shell-react.test.tsx`
3. Confirm footer and toast behavior still renders with existing callbacks/data sources.
