<!--
Where: docs/decisions/2026-03-07-streaming-audio-frame-batching-decision.md
What: Decision note for the first streaming audio frame transport strategy.
Why: Record the transport contract and backpressure behavior accepted for PR-4 before browser capture extraction is wired in fully.
-->

# Decision: Streaming Audio Uses Structured-Clone Frame Batches and Pause-Bounded Flushes

## Status
Accepted — March 7, 2026

## Context

PR-4 needs a renderer-to-main audio transport contract before provider-specific streaming adapters exist.

The first open choice was:
- send one frame per IPC call
- batch several frames per IPC call
- introduce `MessagePort` transfer immediately

## Decision

The first transport contract is:
- renderer batches multiple PCM frames into one IPC payload
- payloads use structured-clone typed arrays
- backpressure is fail-fast, not silent drop
- pause-bounded chunk edges flush pending transport frames without stopping the session

The first payload shape is provider-neutral:
- `sampleRateHz`
- `channels`
- `frames[]`
  - `samples: Float32Array`
  - `timestampMs`

If queued batch pressure exceeds the configured bound, ingress throws and the caller must stop/cancel cleanly.

The first browser capture implementation uses `AudioContext` with a `ScriptProcessorNode` fallback path:
- `toggleRecording` remains the trigger for starting and stopping live capture
- the streaming session stays active until explicit stop/cancel
- chunk boundaries are internal pause events, not recorder-stop events
- a long-utterance safety cap forces a flush even without silence

## Consequences

- IPC payload count stays lower than one-message-per-frame.
- The app avoids silent audio loss at the transport boundary.
- Pause-bounded chunking can exist independently from final provider-side STT segmentation.
- `MessagePort` can still replace structured-clone transport later if profiling proves necessary.

## Out of Scope

- Final browser audio extraction implementation
- Provider decoding and segment assembly
- Adaptive buffering or retransmission
