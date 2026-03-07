<!--
Where: docs/research/2026-03-07-whispercpp-coreml-streaming-feasibility-spike.md
What: Research note for the PR-6 local whisper.cpp + Core ML runtime boundary.
Why: Capture the concrete packaging/runtime constraints proven so far and the
     manual Apple Silicon gates that still remain before merge acceptance.
-->

# Research: `whisper.cpp` + Core ML Streaming Feasibility Spike

Date: 2026-03-07
Status: Code-level runtime seam established; Apple Silicon hardware validation still pending.

## Sources Reviewed

- `whisper.cpp` README: <https://github.com/ggml-org/whisper.cpp/blob/master/README.md>
- `whisper.cpp` stream example directory: <https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream>
- `electron-builder` configuration docs for `extraResources`: <https://www.electron.build/configuration/contents>
- `electron-builder` mac configuration docs for extra binaries/signing considerations: <https://www.electron.build/configuration/mac>

## Verified Constraints

### 1. Core ML sidecar is separate from the ggml model

The local runtime needs both:

- `.../whispercpp/models/<model>.bin`
- `.../whispercpp/models/<model>-encoder.mlmodelc`

PR-6 therefore resolves models from the app data directory instead of bundling them into the app by default.

### 2. The runtime binary must stay spawnable after packaging

An executable provider runtime should not be assumed to live inside the ASAR. PR-6 packages `resources/whispercpp` through `electron-builder.extraResources`, which keeps the runtime available under:

- `process.resourcesPath/whispercpp/bin/macos-arm64/whisper-stream`

### 3. Upstream streaming docs do not prove an external renderer-frame protocol

The upstream `examples/stream` documentation proves realtime microphone streaming behavior, but it does not by itself prove a public stdin protocol for externally captured PCM frames.

Planning consequence:

- the app uses a thin wrapper boundary instead of assuming the upstream example already matches renderer-owned capture
- the wrapper contract is `speech-to-text-jsonl-v1`

### 4. PR-6 failure policy is explicit

- start failure: session enters `failed`
- unexpected child exit: session enters `failed`
- mid-session crash: no auto-retry in PR-6
- normal user stop: adapter sends a stop message and suppresses exit-as-failure

## What PR-6 Now Proves

- The app has a test-backed local provider seam.
- The controller can start and stop a provider runtime without breaking the batch path.
- Accepted streaming frame batches can be forwarded into the provider runtime.
- Provider final segments can be normalized through the existing canonical segment/output substrate.
- Missing binary/model/Core ML assets fail with actionable messages.

## What PR-6 Does Not Yet Prove

- first-utterance latency on real Apple Silicon hardware
- real-time factor across supported hardware tiers
- packaging/signing behavior for the final shipped runtime binary on macOS
- the final internal implementation of the packaged `whisper-stream` wrapper

## Manual Gates Still Required

1. Run a local streaming session on at least one supported Apple Silicon Mac.
2. Record first-utterance latency and real-time factor.
3. Confirm the packaged app can still spawn the runtime after `dist:mac`.
4. Confirm the matching Core ML sidecar loads successfully for the selected ggml model.

## Current Recommendation

- Keep PR-6 scoped to the local provider seam, asset checks, and explicit failure policy.
- Treat Apple Silicon latency and packaging validation as required merge gates, not optional follow-up.
