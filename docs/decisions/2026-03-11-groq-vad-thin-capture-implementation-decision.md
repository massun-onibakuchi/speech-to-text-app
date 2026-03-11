<!--
Where: docs/decisions/2026-03-11-groq-vad-thin-capture-implementation-decision.md
What: Implementation decision note for the first Groq live-mic VAD simplification pass.
Why: Record the concrete ownership and stop-path choices made while deleting the
     legacy renderer-side continuation state machine.
-->

# Decision: Thin Groq Browser VAD Capture Around MicVAD-Sealed Utterances

Date: 2026-03-11

## Context

Ticket 1 removes the renderer-local `max_chunk` and carryover state machine from
`src/renderer/groq-browser-vad-capture.ts`.

The merged planning docs and the `epicenter-main.zip` comparison pushed the
implementation toward:

- one normal utterance boundary owner: `MicVAD.onSpeechEnd(audio)`
- explicit stream acquisition/cleanup outside the library boundary logic
- a narrow stop-only exception path for active speech

## Decision

The first implementation pass makes these concrete choices:

1. normal `speech_pause` utterances now come only from `onSpeechEnd(audio)`
2. renderer-owned `max_chunk` continuation splitting is deleted
3. renderer-owned `hadCarryover` generation is deleted
4. `MediaStream` acquisition happens before `MicVAD.new(...)`
5. the owned stream is cleaned up explicitly during teardown
6. `submitUserSpeechOnPause` stays `false` for now
7. explicit stop keeps one narrow stop-only flush path based on:
   - `onSpeechStart`
   - `onSpeechRealStart`
   - buffered frames captured only while speech is active

## Why `submitUserSpeechOnPause` Stayed `false`

The product contract still expects stopping during active speech to commit one
final utterance when possible.

If `submitUserSpeechOnPause` were flipped to `true` immediately, `pause()` could
emit a library-owned terminal utterance at the same time the app performs its
own stop flush, which reintroduces the duplicate-final-utterance risk that this
ticket is trying to eliminate.

Keeping `submitUserSpeechOnPause: false` preserves a clean rule:

- natural pause boundaries come from `onSpeechEnd(audio)`
- explicit stop owns at most one terminal `session_stop` utterance

## Why Stream Ownership Is Only Partially Aligned With The Reference App

The installed `@ricky0123/vad-web@0.0.30` type surface expects `getStream()`,
not a direct `stream` option. To stay aligned with the reference app without
fighting the package API, the renderer now:

- acquires the stream itself
- retains ownership of that stream for teardown
- passes the owned stream back through `getStream()`

This captures the useful ownership model without inventing an unsupported local
API.

## Consequences

- the normal multi-utterance path is much smaller and easier to reason about
- downstream Groq upload/ordering remains unchanged
- overlap trimming for `max_chunk` remains only as historical downstream support
  until a follow-up ticket removes or redesigns that policy entirely
- a future ticket can revisit `submitUserSpeechOnPause: true` only if the stop
  contract changes or the app deletes stop-only flush behavior
