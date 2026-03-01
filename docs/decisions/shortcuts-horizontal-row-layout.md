<!--
Where: docs/decisions/shortcuts-horizontal-row-layout.md
What: Decision record for shortcut editor row alignment.
Why: Issue #298 requires shortcut title and keybind input to appear side-by-side for faster editing.
-->

# Decision: Horizontal Shortcut Edit Rows

## Status
Accepted - March 1, 2026

## Context
Shortcut editor rows were vertically stacked (title above input), which reduced scan efficiency while editing multiple shortcuts.

Issue #298 requires each row to place:
- Shortcut title on the left
- Keybind input on the right

with stable alignment on normal desktop widths.

## Decision
- Use a two-column grid row per shortcut field:
  - left column: bounded title width (`minmax(14rem, 20rem)`)
  - right column: input (`minmax(0, 1fr)`)
- Preserve all existing capture/validation behavior and selectors.
- Add regression test for horizontal row structure.

## Consequences
- Shortcut editing is easier to scan and compare across rows.
- Existing keyboard capture flow and IDs remain intact.
