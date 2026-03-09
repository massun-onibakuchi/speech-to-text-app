<!--
Where: docs/decisions/2026-03-09-groq-browser-vad-utterance-architecture-decision.md
What: Decision note selecting a Whispering-style browser VAD utterance architecture for Groq only.
Why: Groq is a rolling-upload provider and benefits from better utterance detection, while whisper.cpp should remain on a continuous ingestion path.
-->

# Decision: Groq Uses Browser VAD Utterance Chunking

## Status

Proposed

## Decision

For `groq_whisper_large_v3_turbo`, we should replace the current renderer RMS chunker with a Whispering-style browser VAD utterance pipeline.

For `local_whispercpp_coreml`, we should keep the current continuous frame-stream model.

## Why

The current Groq path is inherently rolling upload, not native streaming.
That means utterance boundary quality matters more than frame-level transport semantics.

The current RMS-based chunker is too coarse and too fragile around:

- quiet starts
- short utterances
- pause boundaries
- end-of-utterance clipping

Whispering’s browser VAD model is a better architectural fit for Groq because it emits complete utterance audio on speech end.

The decision is also constrained by these facts:

- `vad-web` does not expose a native mid-utterance split primitive, so the first implementation must stay pause-bounded plus stop-safe
- utterance-sized audio payloads are too large to treat like the current frame-batch IPC, so the Groq path needs a dedicated transfer-aware utterance contract
- `whisper.cpp` remains conceptually different because it already has a continuous ingestion runtime

## Consequences

1. The renderer capture path becomes provider-specific.
2. Groq should get a dedicated transfer-aware utterance IPC contract rather than reusing frame-batch transport.
3. Groq renderer capture must keep a bounded shadow PCM buffer alongside `MicVAD` so explicit stop can flush safely and utterance timing stays sample-derived enough for ordering and diagnostics.
4. The first Groq implementation should be pause-bounded plus stop-safe; forced long-speech splitting is deferred to a separate follow-up design.
5. Groq should preserve ordered emission and model-level dedupe even without audio-overlap between normal VAD utterances.
6. Normal VAD-completed utterances should not use overlap in the first implementation; any future continuation overlap belongs only to a separate forced-split follow-up.
7. `whisper.cpp` should remain on the continuous frame transport path.

## Rejected alternatives

### Tune the current RMS chunker only

Rejected because the main weakness is the detector quality, not just the threshold values.

### Force both Groq and whisper.cpp through the same VAD chunking path

Rejected because it would degrade the conceptual model for `whisper.cpp`, which is closer to a true continuous stream.

### Keep Groq on frame batches but improve overlap/dedupe only

Rejected because the largest problem is earlier: utterance boundaries are currently weak before the adapter ever sees them.

## Follow-up

Implementation should follow the design in:

- [2026-03-09-groq-browser-vad-utterance-chunking-design.md](/workspace/.worktrees/fix/issue-440/docs/research/2026-03-09-groq-browser-vad-utterance-chunking-design.md)

Implementation must also verify before coding:

- the pinned `vad-web` package version and callback surface
- Electron preload support for transfer-aware utterance payloads
- local asset loading for VAD worklet, ONNX runtime wasm, and Silero model files
