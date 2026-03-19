---
title: Use app-managed uv, Python, and model ownership for local runtime install
description: Define the clean-slate WhisperLiveKit install architecture as app-owned bootstrap tooling, Python runtime, environment, and model storage outside userData.
date: 2026-03-19
status: accepted
tags:
  - architecture
  - whisperlivekit
  - installation
  - uv
  - python
  - storage
---

<!--
Where: docs/adr/0008-use-app-managed-uv-python-and-model-ownership-for-local-runtime-install.md
What: Durable decision for how Dicta should own WhisperLiveKit installation and runtime payloads.
Why: The local runtime already exists as an app-managed optional architecture, but the install stack still needed a durable end-state decision.
-->

# Context

ADR-0003 chose WhisperLiveKit as an app-managed optional localhost runtime for local streaming STT.

That earlier decision intentionally left one major implementation question open:

- how much of the install stack should Dicta own directly

The current implementation is an incremental design:

- discover host Python
- create a managed virtual environment
- install the pinned package spec with `pip`
- keep install state in app-managed storage

That is workable, but it is not the cleanest long-term architecture if the goal is:

- minimal hidden host coupling
- explicit ownership of runtime payloads
- deterministic support and reinstall behavior
- lower long-term error surface
- a codebase that does not preserve compatibility paths indefinitely

The most important upstream fact is that WhisperLiveKit installation is not one thing. It has at least four layers:

1. Python runtime exists.
2. WhisperLiveKit package and extras are installed.
3. Model weights are available locally.
4. The local service can start and prove readiness.

The package layer alone is not enough to declare the runtime ready.

# Decision

Dicta will treat the WhisperLiveKit local runtime as a fully app-managed install stack.

Specifically:

- Dicta will own a pinned `uv` binary and will not rely on user-installed `uv` or `uvx`.
- Dicta will own the Python runtime used for the local WhisperLiveKit environment and will not rely on host Python as the durable end-state contract.
- Dicta will own the WhisperLiveKit environment and install the pinned package and required extras inside an app-managed runtime root.
- Dicta will own model storage policy and will not treat default global caches as the primary product contract.
- Dicta will store heavyweight runtime payloads outside Electron `userData`.
- Dicta will keep only small install metadata and renderer-visible state in `userData`.
- Dicta will not declare the runtime `ready` until package install, model availability, and runtime verification all succeed.
- Dicta will prefer reinstall-oriented recovery for invalid or mismatched runtime state rather than preserving legacy compatibility branches indefinitely.

# Why this was chosen

This decision gives Dicta one clear owner for the full runnable runtime:

- bootstrap toolchain
- Python
- package environment
- model assets
- install state
- verification
- uninstall and update behavior

That ownership model is stronger than the alternatives.

It avoids the two weakest patterns:

- user-managed `uv` or `uvx`, which introduces version drift and environment-sensitive behavior
- host-Python-as-primary-contract, which keeps Python discovery and compatibility checking as a permanent support burden

It also makes the runtime state model cleaner:

- `installed` can mean environment and package are present
- `ready` can mean the required model is available and the service passed verification

This matches the product expectation better than lazy, hidden first-use downloads that surprise the user after installation has already been reported complete.

# Alternatives considered

## Keep host Python and pip as the long-term design

Why it was attractive:

- simpler to implement incrementally
- no bootstrap binary to manage
- preserves the current implementation shape

Why it was not chosen:

- host Python remains an uncontrolled dependency
- Python discovery and version drift remain first-class failure modes
- the app only partially owns the runtime stack

This remains an acceptable bridge implementation, but not the preferred end state.

## Rely on user-installed uv or uvx

Why it was attractive:

- less bootstrap work inside the app
- can look simpler at first glance

Why it was not chosen:

- the user can have any `uv` version
- cache behavior and install semantics can drift outside Dicta's control
- support diagnostics become less deterministic
- this weakens the app-managed runtime contract chosen in ADR-0003

## Install the package in-app but let model ownership stay implicit

Why it was attractive:

- smaller initial implementation
- lower up-front download cost

Why it was not chosen:

- package install and model install are separate lifecycle layers
- readiness becomes ambiguous
- uninstall and disk accounting become incomplete
- first real use can still fail on hidden downloads or missing assets

# Consequences

Positive:

- install behavior becomes deterministic across machines
- the app owns the full runtime contract instead of only part of it
- uninstall, update, and reinstall semantics become cleaner
- support diagnostics can be more explicit about which phase failed
- the runtime payload boundary becomes more intentional than storing everything in `userData`

Negative:

- the app must manage the `uv` binary lifecycle
- the app must manage Python provisioning policy
- implementation complexity increases relative to the current host-Python-plus-pip bridge
- model storage ownership and verification become part of the product surface, not just package installation

# Implementation notes

This ADR defines the end-state architecture, not the migration sequence.

Incremental migration may still happen in smaller steps, but those steps should converge toward this ownership model rather than entrenching host-managed or user-managed runtime behavior.

The final install stack should include explicit phases for:

- bootstrap tooling
- environment creation
- package installation
- model acquisition or verification
- runtime verification

The final storage policy should separate:

- small metadata in `userData`
- heavyweight runtime payloads in a dedicated app-managed runtime location

# Relationship to earlier decisions

This ADR builds on ADR-0003.

ADR-0003 chose the runtime family and ownership direction:

- app-managed optional WhisperLiveKit localhost runtime

This ADR narrows the install architecture inside that direction:

- full app ownership of bootstrap tooling, Python, environment, and model storage policy

# Verdict

Use app-managed `uv`, app-managed Python, app-managed environment ownership, and app-managed model ownership for the WhisperLiveKit local runtime install path. Keep heavyweight runtime payloads outside `userData`, and treat runtime validity as reinstallable state rather than preserving compatibility logic indefinitely.
