<!--
Where: docs/decisions/2026-03-10-groq-timing-contract-decision.md
What: Decision record for Groq utterance timing semantics.
Why: Freeze the split between renderer-local monotonic timing and epoch timing
     so Groq segments stop converting monotonic counters into ISO timestamps.
-->

# Decision: Groq utterance timing uses explicit epoch fields across IPC

## Status

Accepted on 2026-03-10.

## Context

The Groq browser-VAD renderer path originally emitted `startedAtMs` and
`endedAtMs` values derived from `performance.now()`. Main then treated those
numbers as wall-clock timestamps and converted them with:

```ts
new Date(monotonicMs).toISOString()
```

That produced formally valid ISO strings with the wrong meaning, typically
landing near 1970 during tests and in misleading dates during live runs.

## Decision

- Renderer-internal lifecycle math may keep using monotonic clocks where needed.
- The renderer-to-main utterance IPC contract now carries only explicit epoch
  timing for utterance boundaries:
  - `startedAtEpochMs`
  - `endedAtEpochMs`
- Main emits final Groq segment ISO timestamps only from those epoch fields.

## Consequences

- Groq segment metadata is now truthful wall-clock time instead of a monotonic
  counter mislabelled as wall clock.
- The contract is more explicit and less error-prone at the IPC boundary.
- Tests must provide epoch millisecond fields on Groq utterance fixtures.
- This does not change `whisper.cpp` segment timestamp handling.
