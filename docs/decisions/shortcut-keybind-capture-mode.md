<!--
Where: docs/decisions/shortcut-keybind-capture-mode.md
What: Decision record for shortcut input capture-mode UX and validation rules.
Why: Align shortcut editing with explicit key capture, modifier requirement, and duplicate prevention.
-->

# Shortcut Keybind Capture Mode — Decision Record

**Issue:** #202  
**Date:** 2026-02-28  
**Status:** Implemented

## Context

Shortcut fields accepted free-form text input. This made keybind setup error-prone:

- no explicit capture state
- no guided modifier requirement
- duplicate combos were only caught at save time

## Decision

Use explicit recording-mode capture for shortcut fields in the Shortcuts tab:

- clicking/focusing a shortcut field enters recording mode
- next key combo with at least one modifier is captured and normalized
- duplicate combos across shortcut actions are blocked during capture
- each row exposes explicit `Record` / `Cancel` controls
- active row shows a recording-state hint

## Validation Contract

- Save-time validation now also enforces at least one modifier per shortcut string.
- Duplicate detection remains in form validation for persisted/manual edge cases.

## Impact

- Shortcut editor inputs are now read-only capture targets instead of free-form text fields.
- Captured shortcuts normalize to the renderer format consumed by hotkey mapping (`Cmd/Ctrl/Opt/Shift + key`).
