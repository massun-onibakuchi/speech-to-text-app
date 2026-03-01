<!--
Where: docs/decisions/shortcuts-dedicated-tab.md
What: Decision record for moving the global-shortcuts editor to a dedicated Shortcuts tab.
Why: Reduces Settings tab length and groups keyboard configuration in one focused place.
-->

# Shortcuts Dedicated Tab — Decision Record

**Issue:** #200
**Date:** 2026-02-28
**Status:** Implemented

## Context

The Settings tab was growing long. It contained four unrelated categories:

1. Output matrix
2. Speech-to-text provider config
3. LLM transformation provider credentials
4. Audio input device
5. **Global keyboard shortcuts** (historical pre-#203 scope: start/stop/toggle recording, run transform, etc.)

The shortcuts section is conceptually distinct from the per-session tuning options above it. Users configure shortcuts infrequently and separately from provider credentials or output routing. Having it at the bottom of a long scrollable Settings panel made it easy to overlook.

## Decision

Add a dedicated **Shortcuts** tab (between Profiles and Settings) that hosts:

- `SettingsShortcutEditorReact` — per-shortcut text inputs with inline validation
- (historical) `SettingsShortcutsReact` contract display, later removed in #245

Remove the `<section data-settings-section="global-shortcuts">` block and the preceding `<hr>` from the Settings tab.

## Rationale

- Settings tab length is reduced by moving shortcut controls to a dedicated tab.
- Shortcut discoverability improves because the tab label is always visible.
- Keyboard navigation behavior remains unchanged (`Enter` save behavior preserved).
- IDs and callback contracts remain unchanged (no breaking selector or callback change).
- Test coverage remains explicit through app-shell placement and navigation assertions.

## Alternatives Considered

**Keep shortcuts in Settings, collapse behind disclosure widget**: Adds complexity; still hidden by default. Rejected — tab is simpler.

**Add shortcuts to a modal/overlay**: Over-engineered; tab rail already supports this split naturally.

## Impact

- `AppTab` includes `'shortcuts'`; after #251 tab model is `'activity' | 'profiles' | 'shortcuts' | 'audio-input' | 'settings'`
- All `#settings-shortcut-*` element IDs are **preserved unchanged** (no downstream breakage)
- `onChangeShortcutDraft` / `handleSettingsEnterSaveKeydown` callbacks remain on `AppShellCallbacks` unchanged
- E2E tests updated: shortcut-editor assertions navigate to `[data-route-tab="shortcuts"]`; autosave test navigates to Shortcuts tab before filling shortcut inputs
