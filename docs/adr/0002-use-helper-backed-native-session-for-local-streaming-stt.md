---
title: Use a helper-backed native session architecture for local streaming STT
description: Adopt a bundled whisper.cpp helper process with utterance-finalized chunk events as the architecture for Apple Silicon local streaming STT.
date: 2026-03-18
status: superseded
tags:
  - architecture
  - streaming
  - whispercpp
  - coreml
  - native
---

<!--
Where: docs/adr/0002-use-helper-backed-native-session-for-local-streaming-stt.md
What: Durable architecture decision for local whisper.cpp Core ML streaming support.
Why: Capture the debated alternatives, trade-offs, and final verdict before implementation begins.
-->

# Context

Superseded by ADR-0003 after the product direction changed to:

- no bundled local runtime by default
- app-managed optional runtime installation
- WhisperLiveKit localhost runtime with Voxtral MLX as the first shipped path

The app needs to add Apple Silicon macOS local streaming STT using whisper.cpp with Core ML acceleration.

The required product behavior is already fixed:

- local behavior is inferred from the existing STT provider/model selection flow
- users choose `Local Whisper - base [streaming]` or `Local Whisper - small [streaming]`
- finalized text must be emitted incrementally during one recording session
- transformed mode runs once per finalized utterance chunk, not per word
- local streaming locks output to paste-at-cursor and disables user-visible clipboard copy
- models must be installed on demand if missing

The upstream technical constraints are also known:

- whisper.cpp Core ML accelerates the encoder, not the full model
- upstream "streaming" is a repeated local inference pattern over rolling audio or VAD-bounded speech chunks
- there is no stable upstream append-frames-forever transport API that maps directly to Electron renderer code
- Node/Electron integration is possible through native surfaces, but upstream examples are not production-ready streaming session implementations

This ADR decides the runtime architecture for that local streaming lane.

# Discussion

## Round 1

### Position A

Use a bundled helper-backed native session architecture.

How it works:

- renderer captures PCM frames continuously
- main process owns the local session lifecycle
- main process sends coarse PCM batches to a bundled whisper.cpp helper process
- helper owns model loading, Core ML prepare, VAD/max-utterance finalization, and emits finalized chunk events
- main process handles transformation dispatch, ordered output commits, and activity publication

Why this is attractive:

- native crashes are isolated from Electron main
- the helper can own whisper-specific complexity and state
- the session protocol is explicit and testable
- packaging one native helper is simpler than exposing a large native addon API to JS

Counterexamples against this position:

- process boundaries add IPC overhead
- helper packaging/signing/notarization is real operational work
- debugging cross-process state is harder than in-process function calls

### Position B

Use a Node native addon directly from Electron main.

How it works:

- renderer still captures PCM frames
- main process calls a `.node` addon directly
- addon exposes start/append/stop session functions and callback hooks for finalized text
- Electron main stays the single runtime owner of all local session state

Why this is attractive:

- lower IPC overhead
- fewer moving processes
- more direct integration into the existing TypeScript orchestration

Critique from Position A:

- lower IPC overhead is not the dominant problem here; the likely bottlenecks are model load, Core ML warm-up, decode time, and output ordering
- a native crash in the addon can take down the app process instead of one helper child
- Electron ABI and native module packaging tend to be more brittle over time than a standalone helper binary
- the addon path increases coupling between JS orchestration and native streaming internals

### Interim conclusion

Position A is stronger on failure isolation and maintainability. Position B is only clearly better if IPC overhead proves dominant, which current evidence does not show.

## Round 2

### Position B revises and attacks Position A harder

Use a localhost HTTP or websocket service around whisper.cpp instead of a helper stdio protocol.

How it works:

- app starts a local service
- renderer or main streams audio to that local service over HTTP/websocket
- service returns chunk events to the app

Why this might be better:

- protocol is familiar
- easier manual debugging with curl or a browser client
- could evolve toward external integrations later

### Position A critiques with counterexamples

- this is a desktop app, not a multi-client server platform
- localhost networking adds unnecessary attack surface and operational complexity
- upstream `whisper-server` is batch upload oriented, not the streaming contract we need
- introducing sockets, ports, or request framing does not simplify the core problem of session state ownership
- local networking makes observability noisier and failure boundaries blurrier than a private child-process protocol

Concrete counterexample:

- if the service dies and restarts on a new port or with a stale session map, the app still needs a supervising owner and session recovery rules; that owner will already exist in the main process, so the network layer adds cost without removing responsibility

### Interim conclusion

The local server approach is weaker than both the helper and addon options for this app. It adds surface area without improving the essential architecture.

## Round 3

### Position B makes the strongest remaining argument

Keep everything in the renderer with WASM or browser-native code and avoid native packaging entirely.

How it works:

- renderer captures audio and runs local inference in-process
- no child process
- no Electron main native bridge

Why this is tempting:

- simplest developer mental model
- no notarized helper
- no addon ABI issues

### Position A critiques with counterexamples

- this misses the requested Core ML path on Apple Silicon
- large local models and continuous streaming work are poor fits for a renderer process that also owns UI responsiveness
- renderer-side inference would compete directly with UI scheduling and browser security/runtime constraints
- upstream JS bindings are WASM-oriented and explicitly not the Core ML path we want

Concrete counterexample:

- a renderer doing model load, audio capture, utterance detection, transformation dispatch, and UI updates at once creates exactly the kind of cross-layer coupling and responsiveness risk the architecture is trying to avoid

### Interim conclusion

The renderer/WASM path is rejected. It optimizes for fewer build steps, not for the actual product and runtime constraints.

## Round 4

### Position A acknowledges its own weaknesses

The helper-backed architecture still has costs:

- packaging/signing/notarization must be treated as first-class work
- a process protocol must be designed carefully
- health monitoring and lifecycle rules must be explicit
- install, prepare, active, and failure states must be visible in the app

### Position B pushes on complexity

If the helper needs:

- protocol design
- process supervision
- packaging wiring
- install state handling
- health checks

then maybe the architecture is overbuilt for a single provider.

### Position A responds

The provider is single today, but the native risk profile is already enough to justify the boundary:

- model load can fail
- Core ML can fail
- helper can crash
- utterance segmentation logic is stateful
- future tuning will likely happen at the helper boundary, not in renderer UI code

The architecture is not being chosen because it is the fewest files. It is being chosen because it keeps failure ownership and state ownership coherent.

### Satisfied conclusion

Both sides converge on the same practical outcome:

- avoid renderer inference
- avoid localhost service
- avoid making the first version depend on a Node addon
- accept the helper-backed native session as the best fit for this app’s constraints

# Decision

The app will use a helper-backed native session architecture for `local_whispercpp_coreml`.

Specifically:

- renderer captures PCM frames and sends coarse batches to main
- main process owns session lifecycle, cancellation, activity publication, transformation dispatch, and ordered output commit
- a bundled whisper.cpp helper process owns model load, Core ML prepare, recognition-hint input, utterance finalization, max-utterance forcing, and finalized chunk emission
- main communicates with the helper over a private process protocol, not localhost networking
- the local helper boundary is the only approved native runtime architecture for the first streaming implementation

# Why this was chosen

It best balances:

- failure isolation
- explicit state ownership
- Core ML compatibility
- maintainability over time
- fit with the current Electron architecture

It is not the lowest-complexity option in the abstract, but it is the lowest-risk option for this repo and feature.

# Rejected alternatives

## Node native addon in Electron main

Rejected for the first implementation because:

- crash coupling is worse
- Electron/native ABI maintenance burden is higher
- the boundary between native streaming state and JS orchestration becomes too tight too early

This remains a future optimization path only if measured helper IPC cost proves unacceptable.

## Localhost HTTP or websocket service

Rejected because:

- it adds attack surface and operational complexity
- it does not solve the core session-state problem
- upstream server examples are not aligned with the needed streaming contract

## Renderer-side WASM or browser inference

Rejected because:

- it does not satisfy the requested Core ML path
- it risks UI responsiveness
- it increases cross-layer coupling between capture, inference, and presentation

# Consequences

Positive:

- native failures are isolated behind a supervised boundary
- the helper can evolve utterance-finalization logic without leaking complexity into renderer code
- session protocol and state are explicit
- main process remains the single owner of user-visible side effects

Negative:

- packaging and signing work becomes mandatory
- process supervision and health monitoring become part of the feature scope
- protocol design adds upfront work before shipping user-visible functionality

# Implementation notes

The chosen architecture implies these durable rules:

- transformation runs only after helper-finalized utterance chunks
- raw and transformed output must both preserve source chunk order
- active-session cancel behavior must stop future output commits for the cancelled session
- helper crash or unhealthiness must become a typed session failure
- install and prepare states must be visible before the first active session

# Verdict

Use the bundled helper-backed native session architecture.

This is the chosen approach because it is the most defensible architecture under the actual constraints: Apple Silicon Core ML, whisper.cpp’s real streaming model, desktop packaging realities, and the need to keep renderer/UI code free of native streaming state. It costs more upfront than an in-process shortcut, but it is the approach most likely to stay correct as the feature grows.  
