# Delivery Plan (Spec Gap Pass)

Status legend: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`
Priority legend: `P1` (highest), `P2` (high), `P3` (normal)

## Constraints
- Menu bar mode is out of scope for current delivery pass.
- Focus on `standard_app` mode only.

## Prioritized Backlog
1. `#13` `P1` `DONE` Implement main-process global hotkeys (HotkeyService).
2. `#14` `P1` `DONE` Align Home Transform card with prerequisite and status requirements.
3. `#15` `P1` `TODO` Implement global toast notifications for blocked/failure UX.
4. `#19` `P2` `TODO` Emit Groq split-tunnel diagnostics on transcription network failures.
5. `#16` `P2` `TODO` Complete API key settings UX (show/hide + test connection).
6. `#18` `P3` `TODO` Complete remaining Settings actions.
7. `#1` `P3` `TODO` Evaluate closure/merge with already-delivered Playwright work.

## Execution Plan
### Phase A (P1 Core Runtime + UX)
- `#13`: move shortcut execution from renderer-only keydown to main-process global shortcut registration and action dispatch. `DONE`
- `#14`: enforce transform prerequisites in Home card (disabled reasons + deep-link + last status summary). `DONE`
- `#15`: add global toast layer and route key blocked/failure events through it.

### Phase B (P2 Reliability + Settings UX)
- `#19`: surface split-tunnel diagnostics in Groq network failure paths.
- `#16`: add per-key show/hide and test connection controls with provider-specific feedback.

### Phase C (P3 Cleanup)
- `#18`: add run-selected action, restore defaults action, and recording roadmap info link.
- `#1`: close/merge legacy Playwright setup issue if fully covered.

## Current Execution
- Active issue: `#15`
- Status: `IN_PROGRESS`
- Validation target for this step:
  - `npm run test`
  - `npm run test:e2e`
