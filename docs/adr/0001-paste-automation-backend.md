# ADR 0001: Paste Automation Backend

## Status
Accepted

## Date
2026-02-14

## Context
The app needs reliable paste-at-cursor behavior on macOS when output settings enable `paste_at_cursor`.
We considered two implementation options:
- AppleScript via `osascript` and `System Events` keystroke (`Cmd+V`)
- Native event synthesis (`CGEvent`) via native module bridge

## Decision
Use AppleScript (`osascript`) as the v1 production backend.

## Rationale
- No native module toolchain complexity for v1.
- Keeps Electron runtime and packaging simpler.
- Sufficient for the v1 requirement when Accessibility permission is granted.
- Faster to ship and easier to debug in user environments.

## Tradeoffs
- AppleScript can be slower and more environment-sensitive than direct CGEvent.
- Error surfaces are less granular than native APIs.

## Follow-up
- Revisit CGEvent backend if reliability telemetry shows AppleScript instability in production.
