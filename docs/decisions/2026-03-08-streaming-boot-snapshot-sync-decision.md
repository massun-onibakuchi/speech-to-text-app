<!--
Where: docs/decisions/2026-03-08-streaming-boot-snapshot-sync-decision.md
What: Decision record for boot-time streaming snapshot hydration and dead stop-reason cleanup.
Why: Capture why renderer boot now reads current streaming session truth from main and why the unused provider_end contract was removed.
-->

# Decision: Renderer Boot Hydrates Streaming Session Truth From Main

Date: 2026-03-08
Ticket: `SSTP-06`
PR: `PR-6`

## Context

The renderer boot path previously started with a hardcoded local `idle` streaming snapshot and only learned about streaming state through future events. A reloaded or newly opened window could therefore render `idle` while main was already `active`, `stopping`, or `failed`.

At the same time, the shared stop-reason union still advertised `provider_end`, even though the main runtime had no implemented path that could publish that reason.

## Decision

Renderer boot now performs a read-only snapshot fetch from main before steady-state rendering relies on streaming session state.

- preload exposes `getStreamingSessionSnapshot()`
- main IPC returns `streamingSessionController.getSnapshot()`
- renderer boot applies that snapshot only while local streaming state is still the untouched initial `idle` state
- `provider_end` is removed from shared and renderer-facing stop-reason contracts

## Rationale

- New windows and reloads need a truthful starting point instead of waiting for a future event that may never come.
- Boot hydration must not overwrite a newer event that already arrived during startup, so the snapshot is only allowed to fill the initial `idle` gap.
- Keeping an unused public stop reason makes lifecycle handling look more expressive than it really is and hides contract drift.

## Trade-offs

- The renderer now depends on one extra IPC read during boot.
- Snapshot and event paths must remain aligned in future streaming lifecycle changes.
- Provider-side terminal endings still exist conceptually, but they are no longer represented as a shared/public reason until a real producer path exists.
