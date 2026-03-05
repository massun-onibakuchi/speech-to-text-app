<!--
Where: docs/decisions/issue-378-recording-command-contract.md
What: Decision record for removing legacy start/stop recording command variants.
Why: Keep recording command contract aligned with active runtime producers and remove dead compatibility branches.
-->

# Decision: Issue #378 Recording Command Contract

Date: 2026-03-05
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/378

## Decision

- Remove `startRecording` and `stopRecording` from the shared `RecordingCommand` contract.
- Keep only:
  - `toggleRecording`
  - `cancelRecording`

## Rationale

- Current producers (UI + hotkeys) already emit only `toggleRecording` and `cancelRecording`.
- Legacy `start/stop` branches were dead compatibility paths that increased branch/test surface.
- A strict command union gives compile-time protection against stale emitters.

## Behavior Impact

- No intended user-visible behavior change.
- Recording still starts/stops through `toggleRecording`.
- Cancel behavior remains explicit through `cancelRecording`.

## Verification

- Typecheck passes with narrowed command union.
- Runtime/tests no longer reference `startRecording` or `stopRecording` in `src/` and `e2e/`.
