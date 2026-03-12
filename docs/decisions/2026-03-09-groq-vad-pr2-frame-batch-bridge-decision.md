<!--
Where: docs/decisions/2026-03-09-groq-vad-pr2-frame-batch-bridge-decision.md
What: Decision note for the temporary Groq renderer bridge used in PR-2.
Why: Capture-path selection lands in T440-02 before the dedicated utterance IPC of T440-03,
     so this records why the renderer temporarily adapts browser-VAD utterances back into
     the existing frame-batch IPC instead of blocking ticket completion.
-->

# Decision: Temporary Groq Browser-VAD to Frame-Batch Bridge in T440-02

## Status

Accepted on March 9, 2026.

## Context

Ticket `T440-02` requires the renderer to:

- choose a Groq-only browser-VAD capture path
- keep the existing `whisper.cpp` frame-stream path unchanged
- prove that Groq no longer initializes the old worklet capture path

The dedicated utterance IPC contract is intentionally deferred to `T440-03`.

Without an interim bridge, `native-recording.ts` could not route real Groq sessions through
the new browser-VAD capture path yet, which would leave the provider-aware split incomplete.

## Decision

In `T440-02`, Groq browser-VAD utterances are adapted back into the existing
`pushStreamingAudioFrameBatch` IPC as one flushed frame per utterance:

```ts
await window.speechToTextApi.pushStreamingAudioFrameBatch({
  sessionId,
  sampleRateHz: chunk.sampleRateHz,
  channels: chunk.channels,
  frames: [{ samples: chunk.pcmSamples, timestampMs: chunk.startedAtMs }],
  flushReason: chunk.reason
})
```

`whisper.cpp` continues to use `startStreamingLiveCapture(...)` unchanged.

## Why This Is Acceptable

- It satisfies the `T440-02` gate that Groq no longer boots the old worklet frame capture.
- It keeps the provider-aware renderer split real instead of speculative.
- It preserves current main-process behavior while the dedicated utterance IPC is still under review.

## Trade-offs

- Pro: closes the renderer-routing gap in this ticket.
- Pro: lets us test the Groq browser-VAD branch before new IPC lands.
- Con: still clones PCM through the old invoke path, so it is not the final transport.
- Con: carries a temporary renderer-local `pcmSamples` field solely for this bridge.

## Follow-up

`T440-03` replaces this bridge with the transfer-aware utterance IPC contract and removes the
temporary renderer-local PCM bridge field.
