<!--
Where: docs/decisions/2026-03-11-groq-vad-reference-alignment-decision.md
What: Decision note recording what to copy and what not to copy from epicenter-main.zip.
Why: The reference app provides a simpler MicVAD ownership model that should
     inform the Groq live-mic fix plan before implementation starts.
-->

# Decision: Align Groq Live-Mic VAD With The Reference Ownership Model

Date: 2026-03-11

## Context

The reference implementation in `epicenter-main.zip` handles VAD and
speech-pause with materially less state than our current renderer path.

Key observed behaviors in the reference app:

- device acquisition happens before `MicVAD.new(...)`
- the chosen `MediaStream` is passed into `MicVAD.new({ stream, ... })`
- `submitUserSpeechOnPause: true` is enabled
- `onSpeechEnd(audio)` is immediately encoded and handed to the next layer
- `onSpeechRealStart` is informational
- `onVADMisfire` resets coarse state only
- stopping uses `destroy()` plus owned-stream cleanup

By contrast, our current Groq path:

- hides stream acquisition inside the VAD setup callback
- disables `submitUserSpeechOnPause`
- reconstructs utterances from frame-level local state
- owns continuation splitting and stop flushing in the renderer

## Decision

For the first stabilization pass, copy the reference ownership model, not the
current hybrid model.

That means:

1. treat `onSpeechEnd(audio)` as the canonical normal utterance boundary
2. keep `onSpeechRealStart` and `onVADMisfire` as telemetry/state signals only
3. prefer explicit renderer-owned stream acquisition and cleanup outside
   `MicVAD`
4. default stop semantics toward destroy-and-cleanup
5. allow a stop-flush exception only if required by our product contract and
   only with explicit duplicate-prevention rules

## What We Are Intentionally Not Copying Blindly

- We are not copying the entire Whispering app architecture.
- We are not copying its database or delivery pipeline.
- We are not assuming its simpler stop behavior is sufficient without checking
  our raw-dictation product contract.

## Why

This captures the strongest lesson from the reference codebase:

- keep parallelism after the utterance is sealed
- do not create a second utterance-boundary owner before sealing

The reference app proves that one active listening session plus many downstream
independent utterance jobs does not require a renderer-local speech-window
engine.

## Consequences

- Ticket 1 should delete the hybrid boundary owner instead of preserving it.
- Ticket 1 may need to move stream acquisition/cleanup boundaries as part of the
  simplification.
- Any custom stop flush now carries the burden of proof.
- `max_chunk` should be treated as a follow-up policy problem, not as a reason
  to retain the old renderer state machine.
