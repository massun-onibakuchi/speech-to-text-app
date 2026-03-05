<!--
Where: docs/decisions/issue-360-recording-gate-for-transformed-output.md
What: Decision record for recording preflight gating when transformed output is selected.
Why: Issue #360 requires consistent blocking across Home and shortcut entry points.
-->

# Decision: Gate Recording Start When Transformed Output Cannot Run

## Status
Accepted - March 5, 2026

## Context

Issue #360 reports inconsistent behavior:
- Home blocked state correctly depends on STT key presence.
- When output source is `transformed`, recording could still start from shortcut/native command path even if Google key is missing.

This creates user confusion because the selected output source cannot be fulfilled.

## Decision

- Recording availability requires:
  - selected STT provider API key, and
  - Google API key when `output.selectedTextSource = transformed`.
- Apply this preflight consistently across all recording start entry points:
  - Home button enabled/disabled state.
  - Shortcut/native `toggleRecording` (idle-start) path.
- Block before start side effects so blocked attempts do not:
  - start recording,
  - emit recording start sounds.

## Alternatives Considered

1. Allow recording and silently fall back to transcript output.
- Rejected because it violates explicit output mode choice and hides a configuration error.

2. Gate only Home button and keep shortcut behavior unchanged.
- Rejected because it preserves inconsistent behavior and regression risk.

3. Block only sound while allowing recording start.
- Rejected because it creates silent-but-started behavior and worsens debugging.

## Consequences

- Users get consistent blocked behavior regardless of trigger path.
- Shortcut attempts in blocked state stay silent, matching existing STT-missing behavior.
- Renderer tests must cover both UI and IPC shortcut integration seams.
