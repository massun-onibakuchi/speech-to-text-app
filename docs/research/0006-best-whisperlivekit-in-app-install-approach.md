---
title: Recommend the best WhisperLiveKit in-app install approach
description: Define the recommended app-managed installation architecture for WhisperLiveKit, including toolchain ownership, model ownership, storage policy, readiness, and failure handling.
date: 2026-03-19
status: concluded
review_by: 2026-04-19
links:
  decision: ADR-0003
tags:
  - research
  - whisperlivekit
  - installation
  - uv
  - python
  - runtime
---

<!--
Where: docs/research/0006-best-whisperlivekit-in-app-install-approach.md
What: Research note recommending the concrete in-app installation design for WhisperLiveKit in Dicta.
Why: High-level ownership trade-offs are not enough to implement safely; the app needs one explicit install architecture with named boundaries and failure semantics.
-->

# Best WhisperLiveKit In-App Install Approach

## Scope

Recommend the best concrete in-app install architecture for WhisperLiveKit in Dicta.

This is narrower than the earlier ownership question. It assumes Dicta will own installation and answers:

- what toolchain should the app own
- where should the runtime payload live
- when should model weights be downloaded
- what should count as "installed" versus "ready"
- how should update, uninstall, retry, and corruption recovery work

This is research only. No implementation is included in this change.

## Relationship to earlier research

This note describes the strongest clean-slate end-state architecture, not the lowest-risk next incremental change from the current codebase.

That distinction matters:

- [0004-local-runtime-storage-and-tooling-options.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0004-local-runtime-storage-and-tooling-options.md) recommends keeping `pip` and moving storage first as the safer next step from today's implementation
- [0005-whisperlivekit-install-ownership-tradeoffs.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0005-whisperlivekit-install-ownership-tradeoffs.md) explains why Dicta should own the install path rather than assume the runtime or model is already installed

This note answers a different question:

- if Dicta intentionally optimizes for the cleanest long-term architecture and is willing to remove compatibility constraints, what should the end-state install design be

## Short answer

The best in-app install approach is:

- Dicta owns the bootstrap toolchain completely
- Dicta owns one dedicated runtime root outside Electron `userData`
- Dicta keeps only small install metadata and UI state in `userData`
- Dicta installs a pinned Python toolchain and a pinned WhisperLiveKit environment under that runtime root
- Dicta explicitly downloads or verifies the required model assets during install, instead of treating first-run lazy fetch as "ready"
- Dicta reports `ready` only after package, model, and service-readiness checks all pass
- Dicta treats version mismatch or corruption as reinstallable state, not as something to patch in place indefinitely

For a clean-slate architecture, the strongest long-term toolchain owner is app-managed `uv`, not user-managed `uv`, and not host-Python-plus-pip.

## Why this note recommends a stronger design than the current implementation

The current Dicta implementation is a reasonable first pass:

- host Python is discovered
- a managed venv is created
- `pip` installs the pinned package spec
- install occurs into a staging root and is atomically committed

That is acceptable as an incremental implementation.

But if the goal is the best long-term in-app install architecture with minimal hidden coupling and reduced error surface, it is not the best final shape.

The two biggest weaknesses in the current approach are:

1. bootstrap depends on host Python availability and version compatibility
2. the implementation currently treats package install as the center of ownership, while model ownership still needs to be made explicit

## Design axes that matter

There are five design axes that determine whether the install architecture stays clean.

### 1. Toolchain ownership

Choices:

- host Python plus `pip`
- app-managed `uv`
- user-managed `uv` or `uvx`

### 2. Model ownership

Choices:

- rely on WhisperLiveKit default global caches
- explicitly control the model cache path
- ask the user for a model path

### 3. Storage policy

Choices:

- keep everything under `userData`
- split metadata and payload
- put payload in a dedicated app-managed runtime directory

### 4. Readiness semantics

Choices:

- package installed means ready
- package installed means partially ready
- ready means package + model + successful runtime probe

### 5. Recovery policy

Choices:

- try to preserve and patch every old state forever
- keep migration minimal and prefer explicit reinstall when the state is invalid

These axes are interdependent. The best design is the one that keeps all five coherent at once.

## Candidate in-app install architectures

### Option A: host Python + pip + app-owned venv + default Hugging Face cache

How it works:

- detect Python on host
- create venv
- install pinned package spec with `pip`
- let WhisperLiveKit use default model cache behavior

Benefits:

- smallest bootstrap implementation
- no extra bootstrap binary
- easy incremental path from current implementation

Costs:

- depends on host Python being present and acceptable
- model assets may escape to global caches
- uninstall semantics are incomplete
- "ready" can still hide first-run model fetches

Assessment:

- good first implementation
- not the best final architecture

### Option B: host Python + pip + app-owned venv + app-owned model cache

How it works:

- same as Option A
- but Dicta explicitly controls Hugging Face cache location or model destination

Benefits:

- removes the biggest ownership leak from Option A
- preserves simpler bootstrap
- improves uninstall, disk accounting, and observability

Costs:

- still depends on host Python
- still inherits host Python drift and missing-tool failures

Assessment:

- stronger than current implementation
- still not the cleanest end state

### Option C: app-managed `uv` + app-managed Python + app-owned runtime and model cache

How it works:

- Dicta acquires a pinned `uv` binary itself
- Dicta uses that exact `uv` to provision the Python runtime and environment it wants
- Dicta installs WhisperLiveKit and extras under one app-owned runtime root
- Dicta controls model cache location under that same ownership domain
- Dicta verifies package and model readiness before exposing the runtime as ready

Benefits:

- app owns the entire bootstrap stack
- no dependency on user-installed Python or `uv`
- deterministic across machines
- cleaner upgrade and reinstall semantics
- fewer host-environment branches

Costs:

- more implementation work up front
- app must manage the `uv` binary lifecycle too
- Python provisioning policy becomes part of the product

Assessment:

- best long-term architecture if Dicta is serious about owning the runtime cleanly

### Option D: app-managed package install but lazy model pull on first use

How it works:

- package install completes first
- model download happens only when user first records

Benefits:

- lower install-time payload
- faster initial install flow

Costs:

- "installed" and "ready" diverge in a confusing way
- first real use becomes a surprise dependency download
- harder to distinguish install success from first-run operational failure

Assessment:

- acceptable only if the product exposes "runtime installed, model pending" as a distinct state
- not the best default for a polished desktop flow

## Recommended architecture

### Recommendation

Choose Option C.

More precisely:

- app-managed `uv`
- app-managed Python
- app-managed WhisperLiveKit environment
- app-managed model cache location
- app-managed runtime root outside `userData`
- explicit model prefetch or verification before `ready`

This is the cleanest design when judged on responsibility, coupling, changeability, failure handling, observability, and explicit state.

## What "app-managed uv" means

This point needs to stay explicit because it is easy to get wrong.

It does **not** mean:

- call `uv` or `uvx` from `PATH`
- rely on whichever version the user has installed
- inherit user-specific `uv` behavior or cache policy

It **does** mean:

- Dicta pins one exact `uv` version
- Dicta bundles or downloads that exact binary itself
- Dicta invokes it by absolute path
- Dicta ignores the user's `uv`

That turns `uv` into an internal implementation detail of Dicta's runtime manager, not an external prerequisite.

## Recommended runtime layout

The runtime layout should separate small metadata from heavyweight payload.

### `userData` should contain

- install state visible to the renderer
- install metadata for the current committed runtime
- user-facing summary/detail strings if persisted
- small logs or references if needed

### dedicated runtime payload root should contain

- bootstrap tool binaries if downloaded on demand
- managed Python runtime if app-owned
- WhisperLiveKit environment
- model cache or model files
- staging root
- current committed root
- backup root only during atomic replacement

### Why split storage

Electron documents `userData` as a poor place for large files. The runtime payload is exactly the kind of heavy asset set that should not be mixed into settings and small app state.

## Recommended install phases

The install state machine should distinguish these phases explicitly.

1. `bootstrap`
2. `environment`
3. `package`
4. `model`
5. `verify`
6. `ready`

Recommended meanings:

- `bootstrap`: acquire or validate Dicta-owned `uv`
- `environment`: create or repair the app-owned Python environment
- `package`: install pinned WhisperLiveKit package and extras
- `model`: download or verify required model assets
- `verify`: launch a short-lived runtime probe and confirm readiness semantics
- `ready`: all prior phases succeeded

The current Dicta install phases are too package-centric for the ideal end state. The best architecture should make model acquisition and runtime verification first-class phases.

## Recommended readiness contract

The app should never treat "package installed" as "runtime ready".

The recommended contract is:

- `installed`: environment exists and package install succeeded
- `ready`: required model assets are present and a runtime probe succeeds

This distinction matters because WhisperLiveKit's own CLI reveals that model pull is a separate lifecycle concern and that backend readiness depends on more than just package presence.

## Recommended model strategy

The best in-app install path should make one deliberate choice:

- prefetch the required model during install

Why:

- it makes disk cost explicit
- it makes progress reporting honest
- it allows a meaningful `ready` state
- it avoids surprising first-use downloads
- it allows deterministic verification

The alternative is only acceptable if the app exposes a separate "model pending" state and intentionally accepts that first use is part of installation.

For Dicta's UX goals, prefetch is the better default.

## Recommended verification strategy

Install should not stop at files-on-disk checks.

The app should verify:

- the package and expected extras are importable in the managed environment
- the model assets are present at the controlled location
- the local service starts with the intended backend
- the service responds to an authenticated health or control-plane probe

For a stronger contract, the app may optionally perform a minimal warmup or session-creation check before declaring the runtime ready.

## Recommended update strategy

Update should remain app-managed and session-aware.

The best policy is:

- never update while a local session is active
- install updates into a staging root
- verify the staged runtime fully
- atomically promote staged to current
- keep rollback minimal and mechanical

Version mismatch should not trigger ad hoc repair logic spread across multiple components. It should resolve through one owner:

- install manager decides whether to reuse, replace, or reinstall the runtime root

## Recommended uninstall strategy

Uninstall should remove:

- the committed runtime root
- staged remnants
- model payload owned by the runtime root or runtime cache policy

It should not leave heavyweight model residue behind if the product claims to manage the runtime.

Small metadata in `userData` may remain only if it is useful to preserve state history, but the product contract should be explicit about that.

## Recovery and corruption policy

The cleanest recovery policy is not endless compatibility preservation.

Recommended policy:

- if metadata is invalid, state becomes reinstallable
- if package integrity or runtime verification fails, state becomes reinstallable
- if model assets are missing or incompatible, state becomes reinstallable
- if current root is irreparably inconsistent, remove and reinstall

This is cleaner than accumulating repair branches for every historical install shape.

## Why not rely on user-installed Python

Host Python looks simpler, but it keeps hidden complexity alive:

- Python may be missing
- version may be unsupported
- `venv` behavior may vary
- system configuration may be surprising
- support burden increases

That makes host Python acceptable as an incremental bridge, but not the best clean in-app install architecture.

## Why not rely on user-installed uv

User-installed `uv` or `uvx` is worse than app-owned `uv`.

Why:

- version drift
- unpredictable behavior changes
- cache path ambiguity
- more environment-sensitive bugs
- weaker determinism

If `uv` is chosen, the app must own it.

## Trade-off summary

### Why this approach is best

- strongest ownership boundaries
- least hidden host coupling
- best observability
- cleanest uninstall and update story
- clearest meaning of `ready`
- lowest long-term support ambiguity

### What it costs

- more implementation work than the current `pip` path
- more bootstrap responsibility
- a larger architecture decision surface

### Why it is still worth it

Because WhisperLiveKit is not just a library dependency. It is an optional app-managed runtime with separate package, model, and service lifecycles. Half-owning that stack leads to ambiguity. Fully owning it leads to a cleaner system.

## Final recommendation

The best in-app install approach for Dicta is:

- app-owned `uv`
- app-owned Python runtime
- app-owned WhisperLiveKit environment
- app-owned model cache or model directory
- heavy payload outside `userData`
- small metadata in `userData`
- explicit install phases for package, model, and verification
- `ready` only after service-level verification
- reinstall-oriented recovery instead of growing compatibility code forever

If Dicta wants the cleanest long-term local-runtime architecture, this is the design to implement.
