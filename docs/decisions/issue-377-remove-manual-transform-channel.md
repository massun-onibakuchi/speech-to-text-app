<!--
Where: docs/decisions/issue-377-remove-manual-transform-channel.md
What: Decision record for removing obsolete manual transform renderer action and IPC channel.
Why: The manual transform entrypoint is unreachable; active transform flow is shortcut/queue based.
-->

# Decision: Issue #377 Remove Manual Transform Channel

Date: 2026-03-05
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/377

## Decision

- Remove renderer dead function `runCompositeTransformAction`.
- Remove IPC API/channel `runCompositeTransformFromClipboard` from:
  - shared IPC contract
  - preload bridge
  - main IPC handler registration
- Remove dead router method `runCompositeFromClipboard` and keep:
  - `runDefaultCompositeFromClipboard`
  - `runCompositeFromClipboardWithPreset`
  - `runCompositeFromSelection`

## Rationale

- No UI control or callback invokes manual transform action.
- Product flow uses shortcut dispatch and queue-based orchestration.
- Keeping unreachable action + channel increases stale compatibility surface.

## Behavior Impact

- No intended user-visible behavior change.
- Shortcut-driven transform behavior remains unchanged.
- Direct renderer-initiated manual transform API is no longer available.

## Verification

- Search for removed symbol/channel returns no references in `src/` and `e2e/`.
- CommandRouter tests cover remaining transform entrypoints.
