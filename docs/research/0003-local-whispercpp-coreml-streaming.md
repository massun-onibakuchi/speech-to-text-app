---
title: Research local whisper.cpp Core ML streaming support
description: Investigate how whisper.cpp Core ML works on macOS, how it can be integrated into this Electron app, and which streaming design best fits the requested local STT feature.
date: 2026-03-18
status: concluded
review_by: 2026-04-18
tags:
  - research
  - whispercpp
  - coreml
  - streaming
  - macos
---

<!--
Where: docs/research/0003-local-whispercpp-coreml-streaming.md
What: Research note for local whisper.cpp Core ML streaming transcription support.
Why: Reduce implementation risk before changing the STT architecture, packaging, and output behavior.
-->

# Local whisper.cpp Core ML Streaming Research

## Scope

This note studies the requested feature:

- add local macOS STT options backed by `whisper.cpp` with Core ML acceleration
- support streaming behavior
- auto-install models if missing
- emit finalized text incrementally instead of waiting for full recording end
- support two output modes for local streaming:
  - raw dictation
  - transformed text using the existing transformation pipeline, but only once a finalized utterance chunk is ready
- force streaming output behavior to paste-at-cursor only and disable copy-to-clipboard in the UI

This is a research and design document only. No implementation is included in this change.

## Executive Summary

The upstream facts matter:

1. `whisper.cpp` Core ML support accelerates the encoder on Apple Silicon. It does not turn whisper into a true network-style realtime stream API.
2. Upstream "streaming" is implemented as repeated local inference over a rolling audio window or VAD-bounded speech chunks. It is explicitly described upstream as a naive proof-of-concept.
3. `whisper.cpp` can load a matching Core ML encoder bundle automatically when the binary model file and the compiled Core ML directory follow the expected naming convention.
4. Upstream distributes both the `.bin` model files and matching `-encoder.mlmodelc.zip` bundles on Hugging Face, so runtime install-if-missing is feasible without requiring Python or `coremltools` on the user machine.
5. For this repo, the cleanest implementation path is a dedicated local helper process around `whisper.cpp`, not a batch HTTP server and not the WASM JavaScript binding.

My recommended direction is:

- expose a new local STT provider in the existing provider/model settings flow
- keep cloud batch STT unchanged
- implement local streaming as a separate runtime lane behind that provider
- capture raw PCM frames continuously from the renderer for the local lane
- use utterance-finalized chunking, not finalized-word output
- run transformation per finalized utterance chunk
- commit output immediately per finalized chunk in sequence order
- force effective streaming output to `pasteAtCursor=true` and `copyToClipboard=false`

## Current Repo Baseline

The current app is batch-oriented.

Relevant local findings:

- Settings only model batch STT providers and models today in [src/shared/domain.ts](/workspace/.worktrees/feat/local-whisper/src/shared/domain.ts).
- Recording currently uses browser `MediaRecorder` and only submits encoded audio after stop in [src/renderer/native-recording.ts](/workspace/.worktrees/feat/local-whisper/src/renderer/native-recording.ts).
- The capture pipeline transcribes one completed recording, then optionally transforms it, then applies output in [src/main/orchestrators/capture-pipeline.ts](/workspace/.worktrees/feat/local-whisper/src/main/orchestrators/capture-pipeline.ts).
- Ordered output already exists for batch jobs in [src/main/coordination/ordered-output-coordinator.ts](/workspace/.worktrees/feat/local-whisper/src/main/coordination/ordered-output-coordinator.ts).
- Output behavior today is a shared pair of copy/paste booleans in [src/main/services/output-service.ts](/workspace/.worktrees/feat/local-whisper/src/main/services/output-service.ts) and [src/renderer/settings-output-react.tsx](/workspace/.worktrees/feat/local-whisper/src/renderer/settings-output-react.tsx).
- Mode routing exists only as a stub for `default` and `transform_only` in [src/main/routing/mode-router.ts](/workspace/.worktrees/feat/local-whisper/src/main/routing/mode-router.ts).

Implication:

- true local streaming cannot reuse the current "record blob, stop, upload/process" path
- the renderer must provide a PCM frame stream or equivalent low-latency audio transport
- the main process needs a long-lived streaming session controller instead of one capture snapshot per recording

## Upstream whisper.cpp: What Actually Exists

### 1. Core model format

`whisper.cpp` uses converted `ggml` model files, not the original PyTorch checkpoints.

Upstream model docs state:

- model files are custom `ggml` binaries
- pre-converted models are distributed on Hugging Face
- conversion from OpenAI/Hugging Face source formats is handled by repo scripts

For the requested models:

| Asset | Upstream path | Size |
| --- | --- | ---: |
| base model | `ggml-base.bin` | 147,951,465 bytes |
| base Core ML encoder zip | `ggml-base-encoder.mlmodelc.zip` | 37,922,638 bytes |
| small model | `ggml-small.bin` | 487,601,967 bytes |
| small Core ML encoder zip | `ggml-small-encoder.mlmodelc.zip` | 163,083,239 bytes |

Total download sizes are roughly:

- base: about 186 MB
- small: about 651 MB

The user-provided `.bin` links are correct for the binary model payload:

- `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
- `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`

For Core ML mode, the matching encoder bundles are also needed:

- `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-encoder.mlmodelc.zip`
- `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-encoder.mlmodelc.zip`

### 2. What Core ML accelerates

Upstream README is explicit:

- on Apple Silicon, encoder inference can run on the Apple Neural Engine via Core ML
- this can be materially faster than CPU-only execution
- first run is slow because device-specific compilation happens lazily

Important limit:

- upstream only describes Core ML support for the encoder
- the generator script still leaves decoder support as a TODO
- the Objective-C++ implementation in `src/coreml/whisper-encoder.mm` only wraps encoder execution

Implication:

- this feature is "Whisper with Core ML encoder acceleration", not "fully Core ML-native Whisper"
- the runtime still uses regular whisper.cpp decode logic around the encoder output
- first-use UX needs explicit handling because the first Core ML session can stall for a noticeable warm-up window before any chunk output appears

### 3. How Core ML models are generated and loaded

Upstream generation path:

- install Python dependencies including `ane_transformers`, `openai-whisper`, and `coremltools`
- run `./models/generate-coreml-model.sh <model-name>`
- that script creates an encoder model package, compiles it with `xcrun coremlc`, and writes `ggml-<model>-encoder.mlmodelc`

Important runtime detail from upstream source:

- whisper.cpp derives the Core ML bundle path from the `.bin` model path automatically
- `ggml-base.bin` maps to `ggml-base-encoder.mlmodelc`
- quantized suffixes like `-q5_1` are stripped before deriving the encoder bundle path

This means the local install layout should be:

- `.../ggml-base.bin`
- `.../ggml-base-encoder.mlmodelc/`

and likewise for `small`.

### 4. Build flags and failure behavior

Relevant upstream CMake flags:

- as of the upstream sources reviewed on 2026-03-18:
  - `WHISPER_COREML=1` enables Core ML support
  - `WHISPER_COREML_ALLOW_FALLBACK=1` allows init to continue if the Core ML bundle fails to load

Upstream source behavior:

- with Core ML enabled, `whisper_init_state()` attempts to load the derived Core ML bundle
- if load fails and fallback is not allowed, initialization fails
- the Core ML wrapper uses `MLComputeUnitsAll`

Implications for this app:

- if we brand the feature as "Local Whisper [streaming]" backed by Core ML, silent fallback is risky because performance and UX become unpredictable
- fail-fast is the safer product default unless there is a deliberate non-Core-ML fallback mode

### 5. Streaming support upstream is not a native realtime transport

This is the most important design fact.

The C API still centers on full inference calls:

- `whisper_full(...)`
- `whisper_full_with_state(...)`
- `whisper_full_parallel(...)`

There is a `new_segment_callback`, but it reports newly generated segments during one decode call. It is not a websocket protocol, not a microphone session transport, and not a stable "append frames forever" streaming API by itself.

Upstream `whisper-stream`:

- is explicitly described as a naive real-time example
- captures microphone audio via SDL2
- repeatedly runs inference over a rolling window
- supports:
  - fixed-step rolling windows
  - VAD-gated chunk transcription when `--step 0`

Its core algorithm:

- maintain recent PCM buffers
- every step, run `whisper_full()` again over the current window
- optionally keep prior prompt tokens to preserve context
- print the current segments

Implication:

- upstream "streaming" means repeated local batch inference over recent audio, not true incremental decoder-state streaming
- we should design the app around finalized chunk output semantics, not finalized-word semantics

### 6. Server example is batch HTTP, not local streaming

Upstream `whisper-server`:

- is a simple multipart HTTP server
- accepts uploaded files on `/inference`
- runs inference on the uploaded audio
- returns batch output formats

It is useful as a reference for parameter mapping, but not as a local streaming transport.

Implication:

- using the upstream server directly would still require us to invent our own streaming chunk/session protocol on top
- a local sidecar server would add unnecessary network-like surface area inside a desktop app

### 7. Upstream JS and Node/Electron integration options

Upstream has two relevant integration surfaces:

1. `bindings/javascript`
   - this is a WASM-oriented package
   - upstream says its performance is comparable to browser WASM
   - it is not the right path for Apple Core ML / ANE acceleration

2. `examples/addon.node`
   - this is a native Node addon example
   - upstream explicitly says it can be used in `node` and `electron` environments
   - it already shows how to link `whisper` into a `.node` module with `cmake-js`

Implication:

- a native Electron integration is viable upstream
- but the example addon is still file/buffer oriented, not a ready-made streaming session implementation

## What "Streaming" Should Mean For This Feature

Given the user request, the right product contract is:

- user starts one recording session
- user keeps speaking
- app emits text as soon as a chunk is finalized
- the session continues after earlier chunks are emitted
- transformed mode transforms each finalized chunk once
- output side effects remain ordered

This is different from:

- waiting for recording stop
- emitting on every finalized word
- reprocessing the entire session transcript after stop

## Output Semantics For The Requested UX

The requested behavior is internally coherent:

- local streaming model selected
- copy-to-clipboard must be disabled
- paste-at-cursor must be enabled
- user cannot change those toggles while this mode is active
- UI should explain why on hover

This maps well to the existing output layer because paste already writes to clipboard internally before sending `Cmd+V`.

The key product rule should be:

- in local streaming mode, any clipboard write is an implementation detail for paste automation, not a user-visible copy mode

That matches the existing spec direction and avoids confusing clipboard ownership during an active stream.

## Install-If-Missing: Practical Packaging Facts

The app can self-install the model assets if they are missing.

Recommended install payload per model:

- the `ggml-*.bin` model file
- the matching `ggml-*-encoder.mlmodelc.zip`

Recommended runtime install flow:

1. Resolve app-managed model root under writable app data, not inside the signed app bundle.
2. Check for both:
   - model `.bin`
   - extracted encoder bundle directory
3. If missing:
   - download to temp files
   - verify basic integrity at minimum by size and successful unzip
   - extract zip into temp directory
   - atomically rename into final location
4. Only mark model available after both assets are present.

Recommended first-use handling:

- after install, pre-warm the selected model once before the first live session if practical
- otherwise surface explicit status such as "Preparing local model for first use..."
- do not let the first live streaming session appear frozen with no explanation

Do not rely on end-user generation of Core ML bundles with Python:

- it adds Python and Xcode toolchain requirements
- it adds `coremltools` and model-conversion complexity to app runtime
- it will be slow and fragile for end users
- it is unnecessary because upstream already distributes precompiled Core ML bundles

## Operational Risks

### 1. First-run Core ML warm-up latency

Upstream states that the first run can be slow because the ANE service compiles the Core ML model to a device-specific format.

Implication:

- without pre-warm or explicit UX, the first streaming session can look broken

Recommended mitigation:

- pre-warm on install completion or first model selection
- if pre-warm is deferred, show install/preparing state before the session starts

### 2. Memory pressure

The `small` model is materially heavier than `base`:

- `base` binary is about 148 MB
- `small` binary is about 488 MB

Implication:

- keeping `small` resident inside a desktop Electron app can be expensive on lower-memory Apple Silicon machines

Recommended mitigation:

- default to `base`
- load one local model at a time
- unload inactive model state when the provider/model changes or after idle timeout if startup latency is acceptable

### 3. Renderer-to-main PCM transport cost

Continuous PCM transport is not free in Electron. The raw bandwidth is manageable, but high-frequency tiny IPC messages are inefficient.

Recommended mitigation:

- batch audio into fixed-size buffers, for example around 50-100 ms per message
- avoid per-frame tiny-message IPC
- if needed later, move to `MessagePort` or shared-memory style transport instead of generic invoke/send calls

### 4. VAD quality

The upstream `whisper-stream` example uses a simple VAD path and the repo also exposes richer VAD parameters in server/addon examples. For product use, VAD quality is a major correctness factor.

Implication:

- poor VAD causes over-splitting, under-splitting, or delayed finalization

Recommended mitigation:

- treat VAD choice and tuning as first-class runtime configuration, even if not immediately user-facing
- be prepared to upgrade from the simplest threshold-based approach if real speech data shows unstable chunking

### 5. Cursor drift during long sessions

Paste-at-cursor output is correct for the requested UX, but the insertion point can move while a live session is running.

Implication:

- later finalized chunks may paste into a different field than earlier chunks if the user changes focus

Recommended mitigation:

- document that streaming follows the current focused insertion point at commit time
- if that behavior is unacceptable, a future version would need a stronger focus/selection ownership model

### 6. Packaging and notarization

A helper binary is not just "one more file." On macOS it must be packaged, signed, and notarized correctly with the app.

Implication:

- release automation must account for the helper binary and any bundled whisper.cpp libraries/resources

Recommended mitigation:

- keep the helper self-contained where possible
- wire its signing/notarization into the same release path as the Electron app early, not late

## Integration Approaches

### Approach A: Dedicated sidecar helper process

Design:

- build a small macOS helper binary around whisper.cpp
- run it as a child process from Electron main
- send control messages and PCM frames over stdio or a local socket
- receive finalized chunk events back as structured JSON

Pros:

- best crash isolation from Electron main
- no Electron ABI or Node-API packaging burden
- natural place to own a long-lived session state machine
- easy to log, restart, and version independently
- easier to keep whisper.cpp-specific complexity out of TypeScript

Cons:

- requires a small protocol layer
- requires child-process lifecycle management
- needs packaging, signing, and notarization of an extra binary

Fit for this repo:

- very good
- this codebase is currently TypeScript-first and has no existing native addon maintenance surface

### Approach B: Native Electron Node addon

Design:

- use a `.node` addon built with `cmake-js` and linked against whisper.cpp
- expose session APIs directly to the Electron main process

Pros:

- low IPC overhead
- direct callback bridge into JS
- upstream addon example already exists as reference

Cons:

- tighter crash coupling to Electron
- Electron ABI compatibility burden
- more complex local dev/build/release pipeline
- harder to debug native crashes than a helper subprocess

Fit for this repo:

- viable, but higher operational risk than a sidecar helper

### Approach C: Local HTTP service

Design:

- run whisper.cpp behind an internal localhost HTTP service
- app streams or uploads chunks to that service

Pros:

- familiar interface shape
- process isolation

Cons:

- unnecessary local networking complexity
- upstream server is still batch upload oriented
- adds avoidable attack surface and request framing overhead
- worse than stdio for a bundled desktop helper

Fit for this repo:

- not recommended

### Approach D: WASM / browser path

Design:

- use upstream JS binding or browser-side WASM inference

Pros:

- avoids native packaging

Cons:

- misses the requested Core ML / ANE acceleration path
- poor fit for large local models in Electron renderer
- not aligned with upstream Core ML support model

Fit for this repo:

- reject

## Streaming Finalization Strategies

### Strategy 1: Sliding-window stabilization

Mechanism:

- every `N` ms, run whisper on the latest `L` seconds
- compare the new transcript with previously emitted text
- only emit the suffix that appears stable across successive windows

Pros:

- closest to upstream `whisper-stream`
- low conceptual distance from upstream example

Cons:

- deduplication is tricky
- repeated text revisions are common
- "finalized text" becomes heuristic, not explicit
- harder to guarantee "transform only once per utterance chunk"

Fit:

- acceptable for partial display
- weak for the requested finalized-output contract

### Strategy 2: VAD-bounded utterance chunks

Mechanism:

- continuously capture PCM
- detect speech/silence boundaries
- finalize an utterance chunk when silence threshold is met
- run whisper on that utterance chunk
- emit one finalized chunk

Pros:

- best match for "output when finalized"
- best match for "transform once a chunk is finalized"
- easy to sequence and commit
- easier to explain to users

Cons:

- not word-level realtime
- quality depends on VAD tuning
- long utterances may need max-duration splitting

Fit:

- strongest match for the requested UX

### Strategy 3: Hybrid

Mechanism:

- keep sliding-window partials internally for live confidence/debugging
- only commit user-visible output on VAD-finalized utterances

Pros:

- leaves room for future "live preview" UI
- preserves chunk-finalized output correctness

Cons:

- more moving parts
- unnecessary if the product does not need visible partials

Fit:

- good future path
- not necessary for first delivery

## Recommended Architecture For This App

### Recommended product mapping

Use a new STT provider in the existing settings flow:

- provider: `local_whispercpp_coreml`
- models:
  - `Local Whisper - base [streaming]`
  - `Local Whisper - small [streaming]`

Why provider, not just model names under a cloud provider:

- no API key applies
- install behavior is local-file based
- output policy is different
- runtime path is not the existing batch HTTP transcription service

This preserves the current settings layout while avoiding a confusing fake cloud/provider mapping.

### Recommended runtime lane

Implement local whisper as a separate streaming lane:

- renderer captures PCM frames continuously
- renderer batches PCM into coarse chunks before IPC handoff
- main process owns session lifecycle
- helper process owns whisper.cpp inference and model loading
- main process owns ordered output commits and transformation dispatch

### Recommended chunk policy

For first delivery:

- use VAD-bounded finalized utterance chunks
- emit raw finalized chunk text immediately
- in transformed mode, run one transform request per finalized chunk
- do not transform per word
- default to `base` as the safer memory/latency starting point

### Recommended ordered output behavior

Use a session-scoped ordered coordinator:

- each finalized chunk gets a monotonic sequence number
- transformation can run concurrently
- output side effects commit strictly in source order

This is the same concurrency idea already present in the batch pipeline, but scoped to a live session.

### Recommended output lock behavior

When local streaming provider is selected:

- effective output rule becomes:
  - `copyToClipboard = false`
  - `pasteAtCursor = true`
- the UI should render the toggles as locked
- hover text should explain:
  - streaming inserts finalized chunks at the cursor immediately
  - clipboard writes, if any, are internal paste transport only

## Main Technical Gaps Between The Current Repo And This Feature

1. Audio capture format
   - current renderer path records encoded blobs and only submits after stop
   - streaming needs continuous PCM frame delivery

2. Settings schema
   - current schema only models batch STT provider/model pairs
   - local streaming provider semantics are not yet represented

3. IPC surface
   - current IPC only supports start/stop recording commands and final blob submission
   - streaming needs session start, frame append, session stop, and per-chunk events

4. Transcription abstraction
   - current `TranscriptionService` is request/response batch only
   - local whisper needs session-oriented streaming APIs

5. Output rules
   - current output settings are user-editable for copy/paste
   - local streaming requires a locked paste-only effective policy

## Recommended Next Implementation Plan

1. Extend settings/domain types with a `local_whispercpp_coreml` STT provider and two streaming-capable model options.
2. Add a local model manager responsible for presence checks, downloads, unzip, and install state.
3. Introduce a streaming session controller in main.
4. Add renderer-side PCM frame capture for the local streaming lane.
5. Build a whisper.cpp helper process with `WHISPER_COREML=1`.
6. Implement VAD-bounded chunk finalization and per-chunk sequence numbering.
7. Reuse existing transformation and output infrastructure where possible, but wire it through a session-scoped ordered coordinator.
8. Lock streaming output UI to paste-only with explanatory hover messaging.

## Resolved Product Decisions

The follow-up decisions are now explicit:

1. Local streaming should be inferred from selecting the new local STT provider/model in the existing settings flow.
   - No separate `processing.mode` UI should be added.
   - Legacy processing-mode scaffolding can be removed instead of preserved for backward compatibility.
2. Feature exposure should target Apple Silicon Macs only.
3. In transformed mode, each finalized utterance chunk should use the existing default transformation preset exactly as persisted.

## Sources

Primary sources reviewed:

- repo architecture and settings:
  - [src/shared/domain.ts](/workspace/.worktrees/feat/local-whisper/src/shared/domain.ts)
  - [src/renderer/native-recording.ts](/workspace/.worktrees/feat/local-whisper/src/renderer/native-recording.ts)
  - [src/main/orchestrators/capture-pipeline.ts](/workspace/.worktrees/feat/local-whisper/src/main/orchestrators/capture-pipeline.ts)
  - [src/main/services/output-service.ts](/workspace/.worktrees/feat/local-whisper/src/main/services/output-service.ts)
  - [src/main/routing/mode-router.ts](/workspace/.worktrees/feat/local-whisper/src/main/routing/mode-router.ts)
- app spec:
  - [specs/spec.md](/workspace/.worktrees/feat/local-whisper/specs/spec.md)
  - [specs/user-flow.md](/workspace/.worktrees/feat/local-whisper/specs/user-flow.md)
- upstream whisper.cpp:
  - https://github.com/ggml-org/whisper.cpp
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/include/whisper.h
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/stream/README.md
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/stream/stream.cpp
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/server/README.md
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/server/server.cpp
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/README.md
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/download-ggml-model.sh
  - https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/generate-coreml-model.sh
- upstream distribution inventory:
  - https://huggingface.co/ggerganov/whisper.cpp/tree/main
  - https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main?recursive=1

Explicit inferences in this document:

- recommending a sidecar helper over a native addon is an engineering inference from this repo’s current TypeScript-heavy architecture plus upstream integration surfaces
- recommending utterance-finalized chunk output over stabilized rolling-window suffixes is an inference from the requested UX, not an upstream whisper.cpp requirement
