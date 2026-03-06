<!--
Where: docs/decisions/remove-header-legacy-icon.md
What: Decision record for removing the remaining header icon near macOS traffic lights.
Why: Prevent visual conflict with native titlebar controls and align with issue request.
-->

# Decision: Remove Legacy Header Icon Near Traffic Lights

Date: 2026-03-06

## Context

The renderer header still rendered a left icon container at `#app > div > header > div:first-child`.
On macOS this appears close to traffic lights and looks like a legacy titlebar icon.

## Decision

- Remove the left icon container from `ShellChromeReact`.
- Keep only the recording status indicator in header.
- Keep drag-region behavior and platform-specific titlebar clearances.

## Scope

- `src/renderer/shell-chrome-react.tsx`
- `src/renderer/shell-chrome-react.test.tsx`

## Trade-off

- Pros: removes unwanted visual icon and keeps layout simple.
- Cons: header has less branding affordance.
