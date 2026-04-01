---
title: Keep menu bar output controls owned in the main process
description: Build macOS tray output mode and destination controls from persisted settings in the main process, while keeping renderer Settings as a synchronized full-control surface.
date: 2026-04-01
status: accepted
tags:
  - architecture
  - macos
  - menu-bar
  - settings
---

# Context

Dicta already has a macOS tray/menu-bar presence, but before this change the tray menu was static:

- `Settings...`
- `Quit`

At the same time, output configuration already existed as durable settings:

- `settings.output.selectedTextSource`
- `settings.output.transcript`
- `settings.output.transformed`

The new feature adds two quick controls to the macOS tray menu:

- output mode toggle between raw dictation and transformed text
- multi-select output destination toggles for copy and paste

The implementation needed to decide where those controls should live and how they should stay in sync with the existing Settings window.

# Decision

Menu-bar output controls are owned in the main process.

Specifically:

1. The tray menu is built from persisted settings in the main process.
2. Tray actions mutate persisted settings through `SettingsService`, not through renderer IPC.
3. The tray menu is refreshed after relevant settings changes so its checked state stays current.
4. The renderer remains the full configuration surface, but it observes external settings updates rather than owning tray state.
5. Shared output-selection helpers remain the single source of truth for synchronizing destination rules across transcript and transformed settings.

# Alternatives considered

## Alternative 1: Let the renderer own tray state indirectly

Shape:

- tray click sends an IPC message to a renderer window
- renderer computes the next output settings
- renderer sends a full settings payload back to main for persistence

Why it was rejected:

- the tray must work even when no focused renderer window is participating
- it creates an unnecessary round trip for a main-process-native control
- it couples native menu state to renderer lifecycle and tab state
- it increases the chance of stale or divergent tray checkmarks

## Alternative 2: Put all tray menu logic into `WindowManager`

Shape:

- `WindowManager` owns tray creation, settings reads, mutation logic, and menu refresh

Why it was rejected:

- it mixes window lifecycle and business-state mutation responsibilities
- it makes `WindowManager` harder to test and reason about
- it makes future tray growth more likely to accumulate unrelated behavior in one class

## Alternative 3: Add a separate tray-only settings store

Shape:

- tray state is kept in a tray-specific in-memory store
- renderer state remains in the normal settings store

Why it was rejected:

- output routing already depends on persisted settings snapshots
- two stores would create synchronization work for no product gain
- it would be easy for tray state and renderer state to drift

# Consequences

## Positive

- Native tray controls work directly from the main process where Electron tray APIs already live.
- Persisted settings remain the single source of truth.
- Future capture jobs see the new output settings automatically through existing snapshotting.
- The tray and renderer stay aligned through explicit refresh and external-settings update paths.

## Negative

- Main-process composition becomes slightly more involved because tray refresh and settings update broadcasting need shared ownership.
- Renderer external-settings refresh needs conflict handling so safe tray updates do not silently discard unrelated unsaved edits.
- The tray now has a second settings-write path, which requires care to avoid unnecessary hotkey re-registration or future side-effect drift.

# Notes

- This decision does not assign runtime meaning to `interfaceMode.value`. That remains a separate concern and should not be inferred from this tray-control implementation.
