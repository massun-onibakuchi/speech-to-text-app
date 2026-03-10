<!--
Where: docs/decisions/2026-03-10-groq-vad-bound-global-timers-decision.md
What: Decision note for the Groq browser-VAD timer binding and utterance push ordering fix.
Why: Record why the renderer now wraps global timers and starts backpressure timing
     before transport in order to prevent the packaged Illegal invocation crash.
-->

# Decision: Bind Global Timers Through Wrappers in Groq Browser VAD

Date: 2026-03-10

## Context

The packaged Groq browser-VAD repro showed a renderer crash on the first sealed
utterance:

- `TypeError: Illegal invocation`
- thrown from the backpressure timer setup inside `pushUtterance()`

The prior implementation stored `setTimeout` and `clearTimeout` as detached
instance function references and invoked them later. In the packaged runtime,
that detached host-method call shape was not safe.

The prior implementation also created the utterance send promise before starting
the backpressure timer. That left a narrow sync-failure window where the send
could already be in flight when timer setup threw.

## Decision

Use bound wrapper functions for global timers and start the backpressure timer
before transport begins.

Specifically:

- default timer dependencies are now plain wrapper functions that call
  `globalThis.setTimeout(...)` and `globalThis.clearTimeout(...)`
- `pushUtterance()` starts the backpressure timer before
  `sink.pushStreamingAudioUtteranceChunk(...)`
- `activeUtterancePushPromise` is only assigned after transport starts

## Why

This is the smallest fix that addresses both confirmed defects:

- it removes the detached-host invocation shape that caused the packaged crash
- it eliminates the known post-send sync-throw window that could orphan an
  in-flight utterance push

## Trade-offs

Accepted:

- keep timer dependency injection, but normalize the default production path to
  safe wrapper functions
- slightly reorder the backpressure timer relative to transport start

Rejected:

- keep detached timer references and only add logging
- move to a broader timer abstraction across the whole renderer stack in this PR

## Consequences

- packaged/browser runtimes no longer depend on detached host-method behavior
- a synchronous timer setup failure now aborts before transport starts
- broader fatal-stop semantics are intentionally deferred to the next ticket
