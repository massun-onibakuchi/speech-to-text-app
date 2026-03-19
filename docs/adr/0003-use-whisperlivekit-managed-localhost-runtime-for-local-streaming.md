---
title: Use WhisperLiveKit as an app-managed optional localhost runtime for local streaming
description: Supersede the bundled helper architecture with an app-managed WhisperLiveKit localhost service, using Voxtral Mini 4B Realtime MLX as the first local model.
date: 2026-03-18
status: accepted
tags:
  - architecture
  - streaming
  - whisperlivekit
  - voxtral
  - mlx
  - localhost
---

<!--
Where: docs/adr/0003-use-whisperlivekit-managed-localhost-runtime-for-local-streaming.md
What: Durable architecture decision for the first shipped local realtime streaming stack.
Why: Replace the bundled helper direction with an app-managed optional runtime that better fits true streaming.
-->

# Context

The product decision has shifted in two important ways:

- local runtime dependencies must not be bundled by default
- the app may install and manage an optional local runtime after explicit user confirmation

The target first local model is now:

- runtime: `WhisperLiveKit`
- first model/backend: `Voxtral Mini 4B Realtime` via MLX on Apple Silicon

This changes the design constraints substantially.

The earlier helper-based ADR assumed:

- whisper.cpp Core ML as the first local engine
- a bundled native helper as the preferred runtime boundary
- no localhost service boundary

Those assumptions are no longer the preferred direction.

Current relevant upstream/runtime facts:

- WhisperLiveKit already exposes a local realtime API surface
- it supports Apple Silicon MLX backends
- it explicitly supports `voxtral-mlx`
- it offers a native realtime websocket endpoint at `ws://localhost:8000/asr`
- it also exposes OpenAI-compatible and Deepgram-compatible APIs
- Voxtral uses its own streaming policy in WhisperLiveKit instead of the older LocalAgreement/SimulStreaming path

Primary source: https://github.com/QuentinFuxa/WhisperLiveKit

# Discussion

## Round 1

### Position A

Keep the bundled helper architecture and swap whisper.cpp for another runtime later if needed.

Why this is attractive:

- tighter app ownership
- simpler networking posture
- easier to reason about one child process
- no localhost protocol to secure

Critique from the other side:

- this keeps the app paying the packaging cost up front even though the product now prefers optional installation
- it also keeps the architecture biased toward a self-contained native runtime, which is not where the chosen first model ecosystem is strongest
- WhisperLiveKit already solves session streaming and API framing that the app would otherwise have to build

Counterexample:

- if the app must install a runtime only after consent anyway, then forcing that runtime into a bundled-helper shape adds app-owned packaging work without reducing the first-run install or supervision burden much

### Position B

Use an app-managed optional localhost runtime with WhisperLiveKit.

How it works:

- user selects the local provider/model
- app requests confirmation to install the local runtime
- app creates and manages a local runtime environment
- app installs WhisperLiveKit plus the `voxtral-mlx` dependency set
- app starts a loopback-only localhost service
- Electron main opens the realtime websocket session and owns all app-visible side effects

Why this is attractive:

- it fits the new “optional dependency” product direction directly
- it uses a runtime already shaped for realtime streaming
- it avoids inventing a streaming protocol from scratch
- it aligns better with Voxtral Realtime than whisper.cpp did

Interim conclusion:

Position B fits the new product constraints better than Position A.

## Round 2

### Position A attacks the localhost service boundary

A localhost service increases attack surface and operational drift:

- port collisions
- service startup failures
- protocol/version mismatches
- local request hardening concerns

### Position B responds

Those costs are real, but they are manageable if the app owns the runtime lifecycle:

- bind to loopback only
- let the app choose and reserve the port
- use a per-session auth token or equivalent handshake
- pin the managed WhisperLiveKit version
- keep the service private to the app rather than user-administered

Explicit response to ADR-0002's localhost critiques:

- port collisions are accepted costs, but they are bounded if the supervisor chooses and returns the active port instead of hardcoding one
- service startup failures are accepted costs, but they are preferable to shipping a bundled runtime the user did not opt into
- stale session maps and blurry failure boundaries are mitigated by keeping the session controller in Electron main as the single owner of app-visible session state
- observability is noisier than a bundled helper, but that cost is accepted because the app now owns service health checks, connection setup, and restart logic explicitly

Counterexample:

- if the app did not own installation and version pinning, localhost would indeed be too loose
- but the chosen direction is specifically an app-managed runtime, not “user installs random service manually”

Interim conclusion:

The localhost trade-off is acceptable only because the app owns install, versioning, startup, and supervision.

Retired ADR-0002 counterarguments:

- "the network layer adds cost without removing responsibility" remains true in isolation
- it is now acceptable because responsibility moved in a different direction: the app explicitly wants an optional managed runtime rather than a bundled native boundary
- once install, versioning, and supervision are app-owned anyway, the remaining question is which runtime boundary best fits realtime streaming and the chosen backend
- under those new constraints, the localhost boundary is no longer unjustified overhead; it is the most direct way to consume WhisperLiveKit as-designed

## Round 3

### Position A proposes `mlx-audio` instead

Maybe the app should use `mlx-audio` as the local runtime rather than WhisperLiveKit.

Why this is attractive:

- strong Apple Silicon / MLX fit
- supports Voxtral Realtime
- smaller conceptual surface than a larger server project

### Position B critiques

- `mlx-audio` looks more like a runtime/toolkit than an integration-ready realtime service
- WhisperLiveKit already exposes the APIs and streaming surfaces this Electron app would need
- WhisperLiveKit also gives a migration path across backends later without forcing the app to redesign its transport again

Counterexample:

- if the app were building a bespoke native/MLX integration from scratch, `mlx-audio` might be a better low-level foundation
- but for a shipped desktop app trying to minimize custom streaming protocol work, WhisperLiveKit is the stronger immediate fit

Interim conclusion:

`mlx-audio` remains a credible future runtime or comparison point, but WhisperLiveKit is the better first managed localhost runtime.

## Round 4

### Position A pushes on operational complexity

The app now needs:

- install consent UX
- runtime environment bootstrap
- package download/install/update
- localhost service supervision
- health checks
- restart/uninstall behavior

That is a lot of lifecycle complexity.

### Position B answers

Yes, but that complexity is the direct consequence of the explicit product choice:

- optional runtime
- not bundled by default
- true streaming fit prioritized over smallest architecture

The right response is not to hide that complexity. The right response is to make it first-class in the architecture.

Satisfied conclusion:

- bundled helper is no longer the right default
- app-managed localhost runtime is acceptable because the app, not the user, owns it
- WhisperLiveKit is the best first runtime because it already speaks realtime streaming well
- Voxtral Mini 4B Realtime MLX is the correct first shipped model/backend

# Decision

The app will use `WhisperLiveKit` as an app-managed optional localhost runtime for local streaming STT.

Specifically:

- local runtime dependencies are not bundled by default
- the app installs and manages the runtime after explicit user confirmation
- the runtime boundary is a loopback-only localhost service supervised by the app
- the first shipped local provider/runtime is `local_whisperlivekit`
- the first shipped local model is `voxtral-mini-4b-realtime-mlx`
- Electron main owns install orchestration, service supervision, websocket session lifecycle, ordered output, transformation dispatch, and user-facing activity/error state

# Why this was chosen

This architecture best matches the updated goals:

- optional local AI runtime
- true realtime streaming semantics
- Apple Silicon MLX support
- lower default app bundle cost
- reduced need to invent a bespoke streaming protocol

## Retired Counterarguments From ADR-0002

ADR-0002 argued that localhost service layering added cost without removing the need for supervision. That critique remains technically true in isolation. It is no longer decisive because the governing constraints changed:

- the runtime is no longer bundled by default
- the app now explicitly owns optional runtime install, version pinning, startup, and supervision
- WhisperLiveKit already provides a realtime protocol surface that would otherwise have to be built and maintained inside the app

So the localhost layer is now accepted not because it is free, but because the app already has to own runtime lifecycle and WhisperLiveKit reduces custom streaming protocol work enough to justify the added boundary.

# Rejected alternatives

## Bundled helper-backed whisper.cpp runtime

Rejected as the first shipped path because:

- the product no longer wants local dependencies bundled by default
- whisper.cpp remained weaker on true streaming semantics
- it would force the app to own more custom realtime protocol work

This ADR supersedes the helper-based ADR for the first shipped local runtime.

## App-managed localhost runtime with `mlx-audio`

Rejected for the first shipped path because:

- it appears less integration-ready as an application runtime surface
- WhisperLiveKit already provides the service protocols this app needs

This remains a valid fallback or future comparison point.

## User-managed runtime installation

Rejected because:

- it would push too much setup and failure recovery onto the user
- the app would lose version and compatibility control

# Consequences

Positive:

- base app stays lean
- local AI remains explicitly opt-in
- runtime can be updated independently from the app
- streaming semantics are stronger than the prior whisper.cpp direction

Negative:

- install/update/supervision complexity increases
- localhost hardening becomes part of the product scope
- service lifecycle failures become a first-class support burden

# Implementation notes

The chosen architecture implies:

- explicit install consent before local runtime bootstrap
- app-managed runtime version pinning
- loopback-only service binding
- app-owned health checks and restart logic
- websocket session ownership in Electron main, not renderer
- raw and transformed chunk ordering remains an app responsibility

# Supersession

This ADR supersedes ADR-0002 for the first shipped local streaming runtime architecture.

# Verdict

Use WhisperLiveKit as an app-managed optional localhost runtime, with Voxtral Mini 4B Realtime MLX as the first shipped model/backend.

This is the most coherent architecture after the product change. The cost is higher lifecycle complexity, but that complexity is aligned with the new goal: opt-in local realtime streaming without bundling the runtime by default.  
