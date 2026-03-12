<!--
Where: docs/decisions/2026-03-11-groq-max-chunk-removal-decision.md
What: Decision note for removing dead max_chunk and carryover handling from the Groq utterance path.
Why: Ticket 3 must record why the team chose deletion over retuning or downstream continuation support.
-->

# Decision: Remove `max_chunk` And Carryover From The Groq Utterance Contract

Date: 2026-03-11

## Context

Ticket 1 moved normal Groq utterance ownership to `MicVAD.onSpeechEnd(audio)`.
Ticket 2 expanded the deterministic harness and IPC coverage around that thin
contract.

After those changes, the live Groq browser-VAD path now emits only:

- `reason: "speech_pause"`
- `reason: "session_stop"`

It no longer emits renderer-owned `max_chunk` utterances or any overlap
carryover flag.

The remaining `max_chunk` and `hadCarryover` handling survived only as
downstream compatibility scaffolding in shared IPC types, validation, tests, and
the Groq rolling-upload adapter's overlap-dedupe logic.

## Decision

We are deleting `max_chunk` and `hadCarryover` from the Groq utterance contract
instead of retuning or moving them downstream in this pass.

Concretely:

1. `StreamingAudioUtteranceChunk.reason` is narrowed to:
   - `speech_pause`
   - `session_stop`
2. `StreamingAudioUtteranceChunk.hadCarryover` is removed.
3. The Groq rolling-upload adapter no longer trims text based on overlap
   carryover state.
4. Tests and QA now treat uninterrupted Groq speech as waiting for a real pause
   or explicit stop rather than forcing an artificial mid-speech split.

## Why This Is The Right Ticket 3 Outcome

- There is no longer a live producer for `max_chunk`, so keeping the type and
  dedupe logic would preserve dead behavior.
- Reintroducing `max_chunk` downstream would create a new policy problem
  without evidence that uninterrupted-speech splitting is currently required to
  fix the reported loss bug.
- The carryover dedupe path only made sense when chunks could overlap. Once the
  overlap producer is gone, that text-trimming logic becomes a silent source of
  accidental regressions.

## Trade-Offs

- Benefit: the Groq utterance contract becomes smaller and easier to validate.
- Benefit: fewer dead branches remain in the adapter and IPC boundary.
- Cost: very long uninterrupted Groq speech now waits for a natural pause or
  explicit stop before upload.
- Deferred: if product evidence later demands mid-speech chunking, that should
  be designed as a new, explicit policy with its own tests and decision note,
  not by reviving the deleted hybrid behavior.
