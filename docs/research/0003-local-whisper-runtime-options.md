---
title: Local Whisper runtime options for Dicta
description: Evaluate local Whisper-family runtimes for the current Electron app, with emphasis on native streaming, Apple Silicon acceleration, and low-friction integration paths.
date: 2026-03-19
status: concluded
review_by: 2026-06-30
tags:
  - research
  - speech-to-text
  - whisper
  - electron
  - tauri
  - apple-silicon
---

<!--
Where: docs/research/0003-local-whisper-runtime-options.md
What: Detailed evaluation of local Whisper-family runtime choices for replacing the app's cloud STT path.
Why: Reduce uncertainty before committing to a local on-device transcription direction and runtime integration strategy.
-->

# Local Whisper Runtime Options for Dicta

## Status

This research is concluded as of 2026-03-19.

The evidence supports one primary recommendation for this repo and two credible alternatives:

1. Primary recommendation: keep Electron and integrate `whisper.cpp` as an out-of-process local engine.
2. Apple-first streaming alternative: use `WhisperKit`, but only if the team accepts a Swift/Xcode sidecar or a larger runtime migration.
3. Experimental Apple-first batch alternative: use `mlx-whisper` only as a benchmark or fallback path, not as the main product integration.

## Decision Summary

If the goal is to ship local Whisper in this app with the least tricky integration, the best fit is:

- `whisper.cpp`
- packaged as a local sidecar binary, not a Node native addon
- kept behind the app's existing STT adapter boundary in the main process
- accelerated on Apple Silicon with Metal first, Core ML second when it proves faster on the target models

Reason:

- It is the easiest strong fit for the current Electron architecture.
- It already supports Apple Silicon optimizations directly.
- It supports `base`, `medium`, `large-v3`, and `large-v3-turbo`.
- It has a C-style API, CLI tools, a streaming example, and an HTTP server, which gives several integration shapes without forcing a Swift or Python runtime into the product.

If the absolute highest priority is native-feeling streaming quality on Apple hardware, then `WhisperKit` becomes the strongest technical candidate, but it stops being the easiest integration. It pushes the app toward a Swift sidecar or an Apple-native rewrite and is therefore a product/runtime choice, not just a model choice.

## Repo-Specific Context

The current codebase matters because the easiest path is the one that matches the existing seams.

Current facts from this repo:

- Runtime is Electron, not Tauri.
- STT is already abstracted in [`src/main/services/transcription-service.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/services/transcription-service.ts) and [`src/main/services/transcription/types.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/services/transcription/types.ts).
- Current providers are cloud-only: `groq` and `elevenlabs` in [`src/shared/domain.ts`](/workspace/.worktrees/research-local-whisper-options/src/shared/domain.ts).
- Capture currently persists audio to disk before STT in [`src/main/orchestrators/recording-orchestrator.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/orchestrators/recording-orchestrator.ts).
- The production capture path is batch-oriented in [`src/main/orchestrators/capture-pipeline.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/orchestrators/capture-pipeline.ts).
- The spec explicitly says streaming is approved next work, but the shipped path remains batch-oriented in [`specs/spec.md`](/workspace/.worktrees/research-local-whisper-options/specs/spec.md).

That means the easiest local-STT integration is:

- keep the current capture pipeline shape initially
- replace the STT adapter implementation
- add streaming as a new lane after local batch is stable

That is materially safer than rewriting the whole desktop runtime before proving the local engine.

## Requirements Extracted From The Request

The requested direction is not "any local STT". It is a specific shape:

- Prefer a native streaming model over fast batch.
- Batch is acceptable only if it is fast enough to feel near-real-time.
- Apple Silicon optimization is required.
- `base`, `medium`, or `large` class models should be supported.
- Integration should be smooth inside the current app.
- C or Rust are acceptable.
- Tauri is acceptable if runtime migration genuinely simplifies the final system.
- Backward compatibility can be dropped.

I interpret "stop keeping backward-compatibility" as permission to simplify the product aggressively:

- remove cloud STT provider settings if local-only becomes the chosen direction
- replace provider/model allowlists instead of extending them forever
- raise minimum platform expectations if the chosen engine benefits from it
- avoid legacy compatibility adapters that preserve old cloud assumptions

## Evaluation Criteria

I used the following criteria because they map directly to the app and the request.

### 1. Streaming Readiness

Questions:

- Does the project itself provide live or incremental transcription?
- Is streaming first-class or only possible through third-party wrappers?
- Does it support stable/final plus interim/hypothesis output?

### 2. Apple Silicon Fit

Questions:

- Does it directly support Metal, Core ML, or MLX?
- Is Apple Silicon a primary target or just a supported platform?
- Are large models realistic on-device?

### 3. Integration Complexity In This Repo

Questions:

- Can it be wrapped as a subprocess or sidecar and called from the main process?
- Does it require Python packaging?
- Does it require Swift/Xcode ownership?
- Does it require Electron ABI-sensitive native module rebuilds?

### 4. Model Coverage

Questions:

- Does it support `base`, `medium`, and `large` class models?
- Does it support `large-v3` or equivalent practical variants?
- Does it support quantization or device-specific converted models?

### 5. Packaging and Maintenance Cost

Questions:

- Can the app ship one binary plus models?
- How painful is upgrade/rebuild/toolchain maintenance?
- How hard is CI for macOS release packaging?

## Option 1: `whisper.cpp`

### Verdict

Best overall fit for this repo right now.

### Why it fits

`whisper.cpp` is currently the best balance of:

- low integration risk
- strong Apple Silicon support
- acceptable model coverage
- multiple packaging strategies
- no Python runtime
- no forced Swift rewrite

The upstream project describes itself as:

- a plain `C/C++` implementation
- Apple Silicon optimized with ARM NEON, Accelerate, Metal, and Core ML
- exposing a C-style API
- easy to integrate in different platforms and applications

It also provides:

- `whisper-cli`
- `whisper-stream`
- `whisper-server`

That matters because the app can start with CLI or server integration, then move deeper only if needed.

### Streaming reality

This is the main tradeoff.

`whisper.cpp` does have a real-time example, but upstream explicitly describes it as a naive example that samples microphone audio every 0.5 seconds and runs transcription continuously. That is usable as a product starting point, but it is not the same thing as a polished low-latency streaming architecture with confirmed and hypothesis text.

Implication:

- `whisper.cpp` is strong enough for "fast local dictation with chunked updates"
- `whisper.cpp` is weaker for "best-in-class live captioning UX with refined interim text"

If the user experience target is "words appear quickly and stabilize cleanly while speaking", `whisper.cpp` can get there with product work, but it is not the most turnkey engine for that behavior.

### Apple Silicon fit

This is one of `whisper.cpp`'s strongest areas.

Upstream states Apple Silicon is a first-class target and calls out:

- ARM NEON
- Accelerate
- Metal
- Core ML

The README also says inference on Apple Silicon can run fully on the GPU via Metal.

That gives three realistic Apple strategies:

1. Metal-only baseline.
2. Core ML acceleration experiments for selected models.
3. Quantized model variants when memory footprint matters more than top accuracy.

### Model support

Upstream lists these ready-to-run model downloads:

- `base`
- `medium`
- `large-v1`
- `large-v2`
- `large-v3`
- `large-v3-turbo`

The README's memory table is especially useful for product planning:

- `base`: about `388 MB` memory
- `medium`: about `2.1 GB` memory
- `large`: about `3.9 GB` memory

For this app, that suggests a provisional default, pending device benchmarks:

- default model: `base` or `medium`
- optional quality mode: `large-v3`
- optional speed mode on stronger Apple Silicon: `large-v3-turbo`

### Integration shapes

For this repo, the realistic integration shapes are:

#### A. Sidecar HTTP server

Use `whisper-server` and treat the local engine like a local provider.

Pros:

- lowest app-side complexity
- clean process boundary
- easiest to debug
- no Electron ABI/native module rebuild risk
- easy future migration to Rust or Tauri because the app contract stays HTTP-based

Cons:

- another process to supervise
- streaming over HTTP will still need event design in the app
- server startup/model warmup must be handled explicitly

This is the best first implementation shape.

#### B. Sidecar CLI

Call `whisper-cli` for batch files and parse output.

Pros:

- simplest prototype
- almost zero app-native code

Cons:

- weaker streaming story
- brittle output parsing compared with HTTP or C API

Good for spike work only, not ideal as the final shipped integration.

#### C. Native addon or direct FFI

Bind the C API directly into Electron.

Pros:

- lowest overhead
- direct control

Cons:

- highest maintenance burden
- Electron native modules must be rebuilt for Electron's ABI
- packaging, signing, and crash surface get worse

This repo should avoid this unless profiling proves the sidecar boundary is the bottleneck.

### Detailed feasibility in Dicta

This section answers a narrower question than the rest of the document:

- not "is `whisper.cpp` good in general?"
- but "is `whisper.cpp` sidecar integration feasible, stable, and operationally clean inside this specific app?"

My conclusion is:

- feasibility: high
- integration complexity: medium
- runtime stability outlook: medium-high for batch, medium for streaming
- packaging/ownership clarity: high

#### Why feasibility is high

The repo already has the three boundaries a local sidecar needs:

1. Capture is already isolated from transcription.
   - Audio capture is finalized and persisted before STT in [`src/main/orchestrators/recording-orchestrator.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/orchestrators/recording-orchestrator.ts).
2. STT already sits behind a small main-process abstraction.
   - The boundary is [`src/main/services/transcription-service.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/services/transcription-service.ts) plus [`src/main/services/transcription/types.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/services/transcription/types.ts).
3. Capture processing is already queued serially.
   - [`src/main/queues/capture-queue.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/queues/capture-queue.ts) processes one capture at a time in FIFO order.

Those facts remove the hardest part of local-STT adoption. The app does not need a brand-new orchestration model to get started.

In practice, the first local implementation can be:

- renderer captures audio as it does today
- main process persists the file as it does today
- local transcription adapter calls a sidecar with that file path
- the existing capture queue continues to serialize jobs

That is a low-risk swap compared with a runtime rewrite.

#### Why stability is better than it looks

The sidecar shape is stable because it gives explicit fault containment.

If `whisper.cpp`:

- crashes
- deadlocks
- leaks memory
- gets stuck warming a model

the Electron main process does not need to crash with it.

That matters for Dicta because the main process also owns:

- settings
- hotkeys
- tray behavior
- output automation
- history

Those are product-critical even when STT fails.

An in-process addon would couple inference failures to the desktop shell. A sidecar keeps those failure domains separate.

#### Stability limits that still matter

`whisper.cpp` is not a free stability win. The app still needs to own the parts upstream does not own:

1. Model warmup behavior.
   - Upstream documents that Core ML first-run compilation is slow and later runs are faster.
   - That means Dicta must decide between eager warmup at app launch or lazy warmup on first transcription.
2. Memory pressure.
   - `medium` and `large` are substantial on-device loads.
   - A single serial capture queue helps, but model choice still has direct product impact.
3. Streaming UX quality.
   - Upstream's built-in microphone streaming example is explicitly naive.
   - Stability here is more about transcript UX and CPU/thermal behavior than about process crashes.
4. Sidecar lifecycle cleanup.
   - Dicta must ensure quit, restart, crash-restart, and stale-process cleanup are handled correctly.

So the correct claim is not "it is automatically stable." The correct claim is:

- the stability work moves into a place the app can own cleanly

#### Integration contract recommendation

For Dicta, the contract should be deliberately narrow and app-owned.

Recommended sidecar surface:

- `healthcheck`
- `loadModel`
- `transcribeFile`
- `startStreamingSession`
- `appendAudioChunk`
- `finishStreamingSession`
- `cancelStreamingSession`

Recommended result/event surface:

- `ready`
- `warming`
- `transcript_hypothesis`
- `transcript_confirmed`
- `transcript_final`
- `warning`
- `error`
- `exited`

This is important for long-term stability.

If the sidecar contract is too close to raw upstream flags or raw CLI text, upgrades become fragile. If the contract is app-owned, the app can replace or patch the engine later without rewriting the whole UI/runtime surface.

#### Direct binary spawn vs Electron `utilityProcess`

This distinction matters.

Electron's `utilityProcess.fork()` creates a child process with Node.js and message ports enabled and is explicitly equivalent to `child_process.fork()`. It launches a Node entry script, not an arbitrary native executable.

So for a real `whisper.cpp` native binary, there are only two clean choices:

1. Spawn `whisper-server` directly from the Electron main process with `child_process.spawn`.
2. Start a small Node utility-process controller, and let that controller spawn and supervise the `whisper.cpp` binary.

For Dicta, I recommend:

- start with direct `child_process.spawn` from the main process

Reason:

- fewer moving parts
- easier crash handling
- less IPC layering
- easier local debugging

Move to a Node utility-process controller only if the main process starts feeling too busy or if sidecar supervision becomes complex enough to deserve isolation.

#### Best insertion points in the current app

The cleanest main-process integration points are:

- service construction in [`src/main/ipc/register-handlers.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/ipc/register-handlers.ts)
- app lifecycle startup/shutdown in [`src/main/core/app-lifecycle.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/core/app-lifecycle.ts)
- routing/enqueue boundary in [`src/main/core/command-router.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/core/command-router.ts)
- IPC surface in [`src/shared/ipc.ts`](/workspace/.worktrees/research-local-whisper-options/src/shared/ipc.ts)

Recommended ownership split:

- `AppLifecycle`: ensure startup order and guaranteed shutdown/reap behavior
- `register-handlers`: construct a `LocalWhisperSidecarService`
- `TranscriptionService`: dispatch to a local adapter instead of cloud adapters
- `CommandRouter`: keep batch path as-is initially, then add a separate streaming mode later
- `shared/ipc`: add renderer events for streaming transcript state only when the streaming lane exists

That preserves current layering instead of smearing sidecar logic across the renderer.

#### Startup and warmup strategy

This is one of the most important product decisions.

There are three realistic options:

1. Eager sidecar start at app ready.
   - Best for first-use latency.
   - Worst for idle memory and startup complexity.
2. Lazy start on first STT request.
   - Best for idle footprint.
   - Worst for first-use latency.
3. Hybrid: start process at app ready, load model on first use.
   - Usually the best initial choice.

For Dicta, the hybrid path looks strongest:

- launch sidecar after `app.whenReady()`
- do not load `medium`/`large` immediately
- load the selected model on first capture or when the user opens STT settings and explicitly warms it

Why:

- the app already runs in background/tray mode
- always paying full model memory at login is probably too expensive
- a small process without a loaded model is easier to keep resident than a fully warmed large model

#### Batch feasibility vs streaming feasibility

These should be judged separately.

##### Batch path

Batch feasibility is high because:

- the app already stores audio files
- `whisper.cpp` officially supports file transcription via `whisper-cli`
- the project ships an HTTP server example with an OAI-like API
- the capture queue is already serial

This means the app can get to a working local STT path with relatively little architectural disruption.

##### Streaming path

Streaming feasibility is medium, not high.

Reasons:

- upstream does provide a real-time microphone example
- upstream also explicitly labels it naive
- Dicta would still need to define transcript state semantics, buffering behavior, and renderer reconciliation rules

So the realistic statement is:

- `whisper.cpp` streaming is feasible enough to build
- `whisper.cpp` streaming is not turnkey enough to call "solved" for product UX

#### Thermal, battery, and background behavior

For Dicta, stability is not just about correctness. It is also about whether the app remains sustainable as a tray utility.

The app currently:

- starts at login
- hides instead of quitting on window close
- keeps hotkeys available in background mode

That means any local-STT engine must behave well as a long-running background dependency.

Risks to control:

- loading a large model too early at login
- keeping a large model hot when the user only dictates occasionally
- allowing repeated streaming sessions to accumulate resources
- failing to reap subprocesses on quit or crash

The sidecar model helps here because Dicta can implement explicit policies:

- idle timeout
- unload model after inactivity
- restart after repeated failures
- one active streaming session at a time

Those policies would be harder to reason about if the inference engine lived directly in-process.

#### Security and permission posture

This approach also fits the app's permission model better than it might seem.

Today, microphone capture already happens through the app. The sidecar does not need to request microphone permission if Dicta continues to capture audio itself and only forwards audio chunks or finished files.

That is good for product stability because:

- TCC prompts remain tied to the app, not a separate native tool
- there is less ambiguity about which process owns audio capture
- the sidecar can stay inference-only

This is a materially cleaner boundary than "let the sidecar own the microphone."

#### Packaging and release feasibility

Packaging `whisper.cpp` as a sidecar is feasible, but the app must choose what it owns:

1. Ship binary only, download models on first run.
2. Ship binary plus one default model.
3. Ship binary plus multiple models.

For Dicta, option 1 or 2 is most realistic.

Reason:

- bundling `medium` or `large` directly will grow app size quickly
- model download is a product concern, but it is still cleaner than owning a Python runtime

The release burden is manageable because:

- one native binary is simpler than a Python environment
- one native binary is simpler than an Electron native addon ABI story
- one native binary is simpler than an immediate Tauri migration

#### Operational feasibility scorecard

For this repo, I would score the `whisper.cpp` sidecar path like this:

| Dimension | Score | Notes |
| --- | --- | --- |
| Batch integration feasibility | High | Existing audio-file and queue design fits it directly. |
| Streaming integration feasibility | Medium | Feasible, but transcript-state UX and buffering remain app work. |
| Runtime crash isolation | High | Out-of-process boundary is the main advantage. |
| Apple Silicon fit | High | Metal is first-class; Core ML is available with extra preparation. |
| Packaging complexity | Medium | Binary plus model ownership is real work, but still bounded. |
| Supportability | High | Deterministic app-owned runtime is easier to support than Python host setups. |
| Long-running stability | Medium-High | Good if warmup, idle unload, and restart policies are implemented intentionally. |

#### Concrete recommendation from this deeper feasibility pass

`whisper.cpp` remains the best fit for Dicta if the goal is:

- local STT soon
- deterministic desktop packaging
- strong ownership over runtime behavior
- no Python runtime
- no forced runtime rewrite

The key caveat is important:

- choose `whisper.cpp` because batch integration and process ownership are strong
- not because the built-in streaming UX is already ideal

That means the engineering sequence should be:

1. ship local batch first
2. prove process lifecycle, model management, and Apple Silicon performance
3. add a separate streaming lane
4. only reconsider `WhisperKit` if the streaming UX target cannot be met acceptably

### Recommended architecture with `whisper.cpp`

For this repo specifically:

1. Add a new local provider, for example `local_whisper`.
2. Remove cloud-STT compatibility code instead of preserving all old provider UX.
3. Start a local `whisper.cpp` sidecar from the main process.
4. Expose a small local contract:
   - `transcribeFile`
   - `startStreamingSession`
   - `pushAudioChunk`
   - `stopStreamingSession`
   - `cancelStreamingSession`
5. Convert sidecar results into the app's normalized STT result shape.
6. Only after local batch is solid, add renderer-visible interim transcript events.

This keeps the current repo's boundaries intact:

- capture stays in the app
- transcription runs locally out-of-process
- transformation pipeline remains separate

### What to remove if this becomes the chosen direction

Because backward compatibility is explicitly not required, the cleanup should be aggressive:

- remove `groq` and `elevenlabs` STT provider options from [`src/shared/domain.ts`](/workspace/.worktrees/research-local-whisper-options/src/shared/domain.ts)
- remove cloud STT API-key UX from [`src/renderer/settings-stt-provider-form-react.tsx`](/workspace/.worktrees/research-local-whisper-options/src/renderer/settings-stt-provider-form-react.tsx)
- replace provider contract manifest entries in [`src/main/services/provider-contract-manifest.ts`](/workspace/.worktrees/research-local-whisper-options/src/main/services/provider-contract-manifest.ts) with local-engine metadata
- delete cloud preflight diagnostics that only exist for Groq/ElevenLabs network behavior

### Risks

- Open-source streaming quality is good enough, not best-in-class.
- Model downloads and local cache management become the app's responsibility.
- `large-v3` will still have significant startup and memory cost.
- Core ML acceleration must be measured on target devices rather than assumed.

### Final assessment

Choose `whisper.cpp` if the priority stack is:

- easiest integration into this Electron app
- strong Apple acceleration
- acceptable local streaming path
- low operational complexity

## Option 2: `WhisperKit`

### Verdict

Best Apple-first streaming candidate, but not the easiest fit for this repo.

### Why it is compelling

`WhisperKit` is purpose-built for on-device speech on Apple platforms. Upstream describes it as a framework for on-device speech-to-text with:

- real-time streaming
- word timestamps
- voice activity detection
- speaker diarization

Its prerequisites are:

- `macOS 14.0 or later`
- `Xcode 16.0 or later`

That is materially more Apple-native than `whisper.cpp`, and it fits the repo's existing `minMacosVersion: 15.0` setting well.

### Streaming reality

This is where `WhisperKit` is strongest.

The open-source project claims real-time streaming support. Its local server supports OpenAI Audio API-compatible transcription and translation with output streaming, specifically SSE streaming of transcription results.

However, upstream is explicit that:

- the open-source local server supports output streaming
- full-duplex real-time transcription server capabilities belong to `WhisperKit Pro Local Server`

That distinction matters.

For this repo:

- if you want batch plus streamed output from completed audio requests, open-source `WhisperKit` server can work
- if you want true continuous live microphone streaming over a server contract, the open-source local server is not the full solution
- inference: if you want the best live-stream UX without paying for Pro, a custom Swift sidecar that uses the framework directly is more likely to be sufficient than relying on the open-source server alone

Argmax's real-time docs also describe a richer streaming model with:

- confirmed text
- hypothesis text
- caller-friendly event callbacks

That is closer to the target UX implied by the request than `whisper.cpp`'s naive example.

### Apple Silicon fit

This is the strongest part of `WhisperKit`.

It is effectively built around Apple-native deployment, Core ML models, and Apple platform toolchains.

It also supports:

- automatic recommended model download
- explicit selection such as `large-v3`
- custom Core ML model repos

### Model support

The README documents:

- automatic model selection
- explicit `large-v3`
- support for `distil*large-v3`
- Core ML hosted model repos

That makes model management cleaner than raw `whisper.cpp`, especially on Apple-only targets.

### Integration shapes

For this repo, the realistic shapes are:

#### A. Swift local server sidecar

Pros:

- easiest non-Swift app integration
- app can call an OpenAI-like local API
- good bridge if the current Electron app remains in place

Cons:

- open-source server is not the same as full-duplex live streaming
- still requires Swift/Xcode build and release ownership

#### B. Custom Swift sidecar with direct stream IPC

Pros:

- best way to capture `WhisperKit`'s stronger streaming behavior
- can expose confirmed and hypothesis text cleanly into Electron

Cons:

- higher implementation complexity
- app now owns a custom Swift sidecar contract
- macOS CI and packaging become more serious requirements

#### C. Full runtime migration to Tauri or Swift native app

Pros:

- strongest long-term native fit if local speech becomes the product core
- easier to justify a Rust/Swift dominated architecture

Cons:

- much larger rewrite
- delays learning about the actual STT engine/product fit

### Why it is not the primary recommendation

`WhisperKit` is excellent if the product is willing to center itself on Apple-native infrastructure. It is not the easiest path into this repo because:

- the current app is Electron, not Swift
- the team would need a Swift sidecar or runtime migration
- the open-source local server does not fully solve continuous live audio streaming by itself

So the deciding question is:

- do we want the easiest high-quality local STT integration now, or
- do we want to commit to an Apple-native speech platform direction now

If the answer is the first one, `whisper.cpp` wins.

Inference: if the answer is the second one, `WhisperKit` is the stronger long-term platform candidate.

### Final assessment

Choose `WhisperKit` if the priority stack is:

- best Apple-native streaming story
- Core ML-first deployment
- willingness to own Swift/Xcode build infrastructure
- willingness to accept that this is a runtime decision, not just an STT-provider swap

## Option 3: `mlx-whisper`

### Verdict

Strong Apple-Silicon batch engine, weak primary app integration choice.

### Why it is interesting

Apple's MLX framework is explicitly designed for machine learning on Apple silicon, with unified memory and CPU/GPU execution support.

The MLX Whisper example is easy to run:

- install `ffmpeg`
- `pip install mlx-whisper`
- run `mlx_whisper audio_file.mp3`

It also exposes a Python API and supports converted models from Hugging Face.

### Why it is not the main recommendation

The integration shape is wrong for this repo:

- it is Python-first
- the official whisper example is CLI/API batch oriented
- the upstream docs reviewed here do not present a first-class real-time streaming path

That makes it appealing for:

- local benchmarking on Apple Silicon
- model quality/performance experiments
- fallback batch-only research

But not for:

- the primary shipped STT runtime inside an Electron desktop app

Adding Python to the shipped desktop runtime would be more operationally awkward than adding one native sidecar binary.

### Final assessment

Use `mlx-whisper` only if:

- you want benchmark evidence on Apple Silicon before deciding between `whisper.cpp` and `WhisperKit`, or
- you accept a batch-first product and do not mind shipping a Python-oriented runtime stack

Otherwise, do not make it the main path.

## Option 4: `faster-whisper`

### Verdict

Good batch baseline, poor primary fit for this app's requested direction.

### Why it remains relevant

`faster-whisper` is widely used and can be very fast for batch transcription. It exposes:

- direct transcription
- a batched transcription pipeline
- VAD filtering

It is useful as a performance reference point.

### Why it is not a good primary choice here

The upstream story reviewed here is:

- core usage is batch-oriented
- batched inference is a major documented feature
- streaming is mostly represented through community integrations such as `Whisper-Streaming` and `WhisperLive`

That conflicts with the request's priority:

- prefer native streaming
- accept batch only if sufficiently fast

It also introduces a Python/CTranslate2 packaging story, which is less natural for this Electron repo than a single native sidecar binary.

### Final assessment

Do not choose `faster-whisper` as the main engine for this repo unless:

- the team redefines the target as batch-only local dictation, and
- measured latency on target Apple devices is clearly good enough

## Rust and Native Addon Considerations

The request explicitly allows C or Rust and mentions native addons.

The clean recommendation is:

- prefer out-of-process native binaries over in-process Electron native addons

Reason:

- Electron supports native Node modules, but they must be rebuilt for Electron's ABI.
- That adds recurring maintenance overhead every time Electron changes.
- A sidecar process avoids most of that friction and isolates crashes.

If Rust ownership is desired, the best shape is:

- Rust sidecar process
- speaking HTTP, stdio JSON-RPC, or message-based IPC
- wrapping `whisper.cpp` or another proven local engine internally

This is better than:

- N-API addon first
- direct C++ addon first

because the latter couples the speech engine tightly to Electron internals.

## Electron vs Tauri

### Keep Electron if the immediate goal is local STT

Electron already gives a clean sidecar path. The `utilityProcess` API creates a child process with Node.js and message ports enabled, which is enough for supervising a local helper process or for hosting a lightweight controller process that manages a native binary.

That means runtime migration is not required to ship local Whisper.

### Consider Tauri only if the product wants a Rust-owned desktop stack

Tauri's sidecar support is real and well-documented. It bundles external binaries via `externalBin`, including Apple Silicon target-specific binaries such as `aarch64-apple-darwin`.

That makes Tauri attractive if the desired end state is:

- Rust-owned desktop runtime
- smaller desktop footprint
- speech engine and shell integration owned by Rust rather than Node/Electron

But for this repo, migrating to Tauri purely to add local Whisper is probably the wrong order of operations.

Recommended order:

1. Prove the local STT engine inside Electron.
2. Measure product quality, latency, warmup, and packaging pain.
3. Only then decide whether runtime migration still buys enough to justify the rewrite.

## Model Recommendation

For a first serious local release, my provisional model suggestion is:

- default: `medium`
- low-memory fallback: `base`
- optional high-quality mode: `large-v3`

Reason:

- `base` is easy on memory but may leave too much quality on the table for dictation-heavy use.
- inference: `medium` is the strongest default candidate for local quality versus practicality, but that should be validated on target Macs before locking it in.
- `large-v3` should be optional because it increases memory, warmup, and packaging costs.

If using `whisper.cpp`, also benchmark:

- `large-v3-turbo`

It may offer a better quality-latency trade than plain `large-v3` on stronger Apple Silicon systems.

## Recommended Implementation Plan

### Plan A: Ship local Whisper in the current Electron app

This is the recommended execution plan.

#### Phase 1: Local batch path with `whisper.cpp`

- Replace cloud STT providers with one local provider.
- Start `whisper.cpp` as a supervised sidecar.
- Use file-based transcription first because the repo already persists captured audio files.
- Keep the rest of the pipeline unchanged.
- Remove STT API key UX and related secret-store checks for STT.

Success criteria:

- local transcription works offline
- no provider API keys are needed for STT
- `base`, `medium`, and `large-v3` can be selected
- warmup and first-result latency are measured on Apple Silicon

#### Phase 2: Streaming lane

- Add a true streaming execution mode instead of overloading the default batch lane.
- Emit interim transcript events from the main process to the renderer.
- Define transcript state explicitly:
  - `hypothesis`
  - `confirmed`
  - `final`

Success criteria:

- visible incremental text during recording
- clear promotion from interim text to confirmed text
- stable behavior under rapid back-to-back recordings

#### Phase 3: Apple acceleration tuning

- Compare Metal-only against Core ML-assisted runs on target hardware.
- Decide whether `large-v3-turbo` should replace `large-v3` as the high-end preset.
- Add model cache management and disk-usage UX.

### Plan B: Commit to Apple-native streaming with `WhisperKit`

Choose this only if product direction is explicitly Apple-native and streaming-first.

#### Phase 1

- Build a Swift sidecar spike using `WhisperKit`.
- Decide whether open-source server mode is enough or whether direct framework IPC is required.

#### Phase 2

- If server mode is not enough, implement custom stream IPC from Electron to the Swift sidecar.
- Expose confirmed and hypothesis transcript events into the renderer.

#### Phase 3

- Re-evaluate whether Electron still makes sense once Swift owns the hard parts.

## Rejected Shapes

These paths were considered and should not be the default choice.

### 1. Electron native addon first

Rejected because:

- higher build and ABI maintenance burden
- more brittle packaging
- worse crash isolation

### 2. Python-first shipped runtime

Rejected because:

- operationally heavier than a single native sidecar
- worse fit for Electron packaging
- weaker streaming story in the official sources reviewed

### 3. Tauri migration before proving the engine

Rejected because:

- it mixes two decisions
- runtime migration can hide whether the real problem is model quality, streaming UX, or packaging

## Final Recommendation

For this repo, the best next move is:

- stay on Electron
- drop cloud STT backward compatibility
- integrate `whisper.cpp` as a local sidecar
- default to `medium`
- offer `base` and `large-v3` options
- add a dedicated streaming lane after local batch is stable

If later testing shows that `whisper.cpp` streaming UX is not good enough, the next escalation should be:

- move to a Swift sidecar with `WhisperKit`

not:

- jump straight to a native Electron addon, or
- switch the whole app to Tauri before validating the speech engine itself

## Source Notes

Primary sources reviewed:

- OpenAI Whisper README: model families, memory guidance, and baseline model taxonomy
  - https://github.com/openai/whisper
- `whisper.cpp` README: C/C++ implementation, Apple Silicon optimization, supported models, memory usage, streaming example, server support
  - https://github.com/ggml-org/whisper.cpp
- `WhisperKit` README: Apple-native on-device speech, real-time streaming, Core ML models, local server, open-source vs Pro server boundary
  - https://github.com/argmaxinc/WhisperKit
- Argmax real-time transcription docs: confirmed/hypothesis streaming model and open-source vs Pro distinctions
  - https://app.argmaxinc.com/docs/examples/real-time-transcription
- MLX documentation: Apple silicon ML framework characteristics
  - https://ml-explore.github.io/mlx/build/html/index.html
- MLX Whisper example README: `mlx-whisper` packaging and batch usage
  - https://github.com/ml-explore/mlx-examples/tree/main/whisper
- `faster-whisper` README: batch usage, batched inference, community streaming integrations
  - https://github.com/SYSTRAN/faster-whisper
- Electron `utilityProcess` docs: sidecar/process integration path
  - https://www.electronjs.org/docs/latest/api/utility-process
- Electron native modules docs: ABI rebuild cost for native addons
  - https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
- Tauri sidecar docs: packaged external binary model and Apple Silicon target handling
  - https://v2.tauri.app/develop/sidecar/

## Confidence

Confidence level: `0.86`

Why not higher:

- The recommendation is source-grounded, but model speed and UX still need device measurements on the actual target Macs.
- Core ML versus Metal performance for the exact target models is not something that should be decided from documentation alone.
- `WhisperKit` open-source versus `whisper.cpp` streaming feel must be verified with a live dictation prototype before making a final product-level commitment.
