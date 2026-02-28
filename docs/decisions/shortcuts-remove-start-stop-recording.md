<!--
Where: docs/decisions/shortcuts-remove-start-stop-recording.md
What: Decision record for removing start/stop recording shortcut bindings from settings and UI.
Why: Simplify the shortcut surface and avoid redundant bindings with toggle/cancel.
-->

# Remove Start/Stop Recording Shortcuts — Decision Record

**Issue:** #203
**Date:** 2026-02-28
**Status:** Implemented

## Context

The shortcut set exposed separate `startRecording` and `stopRecording` bindings in addition to `toggleRecording` and `cancelRecording`.
This increased UI and validation complexity without adding unique capability for the primary recording flow.

## Decision

Remove `startRecording` and `stopRecording` from:

- settings schema/defaults
- shortcut editor UI
- shortcut validation rules
- hotkey registration bindings

Keep `toggleRecording`, `cancelRecording`, and transformation shortcuts unchanged.

## Migration

On settings load, if legacy shortcut keys are present:

- remove `shortcuts.startRecording`
- remove `shortcuts.stopRecording`
- persist migrated settings through schema parsing

This ensures existing settings files load safely and the persisted contract converges to the new shape.

## Impact

- Shortcuts UI no longer renders start/stop input fields.
- Shortcut list guidance no longer includes start/stop actions.
- Global hotkey registration no longer attempts start/stop bindings.
- Existing start/stop recording commands remain available through runtime command paths (non-shortcut flows).
