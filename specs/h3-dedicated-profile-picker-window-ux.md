<!--
Where: specs/h3-dedicated-profile-picker-window-ux.md
What: Behavior contract for dedicated transformation profile picker window UX.
Why: Align #71 implementation with predictable pick-and-run shortcut behavior.
-->

# H3 — Dedicated Profile Picker Window UX

**Status:** Accepted  
**Date:** 2026-02-19  
**Issue:** #71

## Goal

When `pickTransformation` shortcut fires, open a dedicated picker window, let user choose a profile, then run transformation with that profile.

## UX Contract

1. Picker opens in a dedicated always-on-top BrowserWindow.
2. Picker displays all transformation profiles with active-state hinting.
3. Keyboard controls:
  - Up/Down selects profile.
  - Enter confirms selected profile.
  - Escape cancels and closes picker.
4. Mouse click on a profile confirms selection.
5. On confirm:
  - `transformation.activePresetId` is updated to chosen profile.
  - shortcut flow runs clipboard transformation using selected profile.
6. On cancel:
  - no settings write.
  - no transformation run.

## Non-Blocking Requirements

- Shortcut callback remains async and does not block recording flows.
- In-flight transform requests keep their own snapshot semantics.

## Test Coverage

- Unit: picker window selection/cancel behavior.
- Unit: hotkey pick-and-run semantics remain stable.
- E2E: pick shortcut opens picker window and selection updates active preset.
