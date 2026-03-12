<!--
Where: docs/decisions/2026-03-08-streaming-user-stop-drain-decision.md
What: Decision note for drain-safe `user_stop` handling in the streaming session controller.
Why: Record why stop-time late final segments are accepted only for `user_stop`
     and why the public session state stays `stopping` instead of adding `draining`.
-->

# Decision: `user_stop` Drains Late Final Segments While `user_cancel` and `fatal_error` Stay Destructive

## Status
Accepted — March 8, 2026

## Context

Issues `#425` and `#426` exposed two conflicting needs in the stop path:

- normal user stop must preserve the last legitimate provider output
- cancel and fatal cleanup must still cut the session off immediately

The existing controller published `stopping` and then rejected all later final segments because both the provider callback gate and `commitFinalSegment()` only accepted `active`.

## Decision

The controller now treats only `reason === 'user_stop'` as drain-safe:

- public state remains `stopping`
- matching late final segments are accepted while the session is `stopping` for `user_stop`
- fresh audio ingress remains blocked once stop begins
- `user_cancel` and `fatal_error` remain destructive and do not drain
- stop publishes `ended` only if the session is still the same `stopping` session after provider stop returns
- if a provider failure arrives during stop, `failed` wins and must not be overwritten by `ended`

## Consequences

- Stop-time dictation loss is fixed without adding a new public lifecycle state.
- Renderer/UI contracts do not need a new `draining` state in this PR.
- Provider adapters can continue to emit late final segments during stop, but only `user_stop` will accept them.
- Cancel and fatal cleanup behavior remain strict.

## Out of Scope

- Groq stop timeout budgeting
- Renderer stop handshake and explicit command transport
- Boot snapshot sync and dead `provider_end` cleanup
