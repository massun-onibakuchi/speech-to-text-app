<!--
Where: docs/decisions/transformation-picker-style-alignment.md
What: Decision record for transformation picker pop-up style alignment.
Why: Keep pick/change-default profile menu visuals consistent with app tokens while preserving behavior (#252).
-->

# Decision: Align transformation picker pop-up styling with app token patterns

- Date: 2026-03-01
- Status: Accepted
- Related issue: #252

## Context
- The transformation picker pop-up used a light-theme card/menu style that diverged from the app's dark token system.
- Behavior (pick profile / cancel) was correct; only visual consistency and focus/selection treatment needed alignment.

## Decision
- Keep picker behavior and navigation flow unchanged.
- Update `buildPickerHtml` style tokens to app-aligned dark surfaces, border, muted text, accent hover/selected state, and explicit focus-visible ring.
- Keep existing keyboard behavior (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`) and ARIA roles (`listbox`, `option`).

## Consequences
- Pick and change-default pop-up flows retain existing business logic and side effects.
- Pop-up menu visual states now match app spacing and token direction.
- Style regressions are covered by picker HTML assertions in `profile-picker-service.test.ts`.
