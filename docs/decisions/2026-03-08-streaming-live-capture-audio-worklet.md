<!--
Where: docs/decisions/2026-03-08-streaming-live-capture-audio-worklet.md
What: Decision note for migrating renderer streaming capture from ScriptProcessorNode to AudioWorkletNode.
Why: Remove deprecated browser audio processing, preserve the existing ingress contract, and keep graceful-stop tail audio intact.
-->

# Decision: Use AudioWorklet For Renderer Streaming Capture

## Status
Accepted — March 8, 2026

## Context

Latest `dev` still captured live streaming PCM with `ScriptProcessorNode`.

That had two problems:

- Chromium now warns that `ScriptProcessorNode` is deprecated.
- The old capture source couples microphone extraction to a legacy main-thread API that the platform is actively moving away from.

The renderer pipeline already depends on a provider-neutral frame contract:

- capture emits `Float32Array` frames with timestamps
- `StreamingSpeechChunker` decides pause/max-chunk boundaries
- `StreamingAudioIngress` batches and transports those frames to main

The migration therefore needed to preserve those downstream contracts instead of rewriting the whole renderer streaming stack.

## Decision

`startStreamingLiveCapture()` now loads a dedicated `AudioWorklet` processor module and wires capture through `AudioWorkletNode`.

The chosen contract is:

- the worklet batches render-thread audio into stable frame-sized `Float32Array` payloads
- the main thread receives those frames over the worklet port and feeds the existing chunker + ingress path unchanged
- graceful `stop()` sends a worklet `flush` control message before renderer teardown so the last partial frame is not lost
- unsupported environments fail fast with the existing live-capture unsupported error

The processor module is shipped as a plain JavaScript worklet asset so the built renderer bundle hands `audioWorklet.addModule()` executable JavaScript rather than raw TypeScript source.

## Trade-Offs

- `AudioWorklet` introduces an extra port hop compared with direct `ScriptProcessorNode` callbacks.
- Keeping the existing ingress/chunker contract minimized PR scope and regression risk.
- The processor uses an explicit stop-time flush message, which adds a small amount of coordination complexity but avoids dropping the final partial buffer on normal stop.
- The built bundle currently inlines the worklet as a `data:text/javascript` URL. That is acceptable in Electron and avoids a separate asset-routing problem for this ticket.

## Consequences

- The deprecation warning from `ScriptProcessorNode` is removed on supported runtimes.
- Renderer streaming capture still produces the same downstream frame shape.
- Graceful stop preserves buffered tail samples instead of truncating the final partial worklet frame.
- Unsupported runtimes still fail clearly instead of silently degrading to the deprecated path.

## Out Of Scope

- renderer ingress drain-contract fixes
- startup cleanup ownership as a standalone ticket, even though this branch keeps local startup teardown around the new worklet loading path
- chunk discard/reset policy
- multi-window streaming stop ownership
