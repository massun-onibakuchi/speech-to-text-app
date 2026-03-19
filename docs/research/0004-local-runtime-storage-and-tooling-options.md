---
title: Evaluate local runtime storage and Python tooling options
description: Study whether the WhisperLiveKit runtime should keep using pip in userData or move to a different installer and storage location.
date: 2026-03-19
status: concluded
review_by: 2026-04-19
links:
  decision: ADR-0003
tags:
  - research
  - whisperlivekit
  - uv
  - pip
  - electron
  - storage
---

<!--
Where: docs/research/0004-local-runtime-storage-and-tooling-options.md
What: Research note comparing runtime installer and storage options for the app-managed WhisperLiveKit runtime.
Why: The current implementation uses pip inside userData, and we need an evidence-backed recommendation before changing it.
-->

# Local Runtime Storage and Tooling Research

## Scope

Study two questions in the current local WhisperLiveKit architecture:

- should the app keep using `pip` for runtime installation, or switch to `uv`
- should the app keep storing the managed runtime under Electron `userData`, or move the large runtime payload elsewhere

This document is research only. It does not change code or the durable spec.

## Relationship to later research

This note answers the "what is the safest next step from the current implementation" question.

Its recommendation is intentionally incremental:

- keep `pip` for the next change
- move the heavy runtime payload out of `userData` first
- revisit `uv` after the storage policy is settled

Later notes refine different questions:

- [0005-whisperlivekit-install-ownership-tradeoffs.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0005-whisperlivekit-install-ownership-tradeoffs.md) studies install ownership and explains why Dicta should keep runtime ownership in-app
- [0006-best-whisperlivekit-in-app-install-approach.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0006-best-whisperlivekit-in-app-install-approach.md) describes the strongest clean-slate end-state architecture if Dicta chooses to remove compatibility constraints rather than optimize for the next incremental migration step

## Current implementation

The merged implementation currently does this:

- requires host Python `>=3.11 <3.14`
- creates a staging virtual environment
- upgrades `pip` inside that environment
- installs the pinned package spec `whisperlivekit[voxtral-mlx]==0.2.20.post1`
- atomically swaps the staging root into the committed runtime root on success
- stores the runtime under `app.getPath('userData')/local-runtime/whisperlivekit`

Current source references:

- [src/shared/local-runtime.ts](/workspace/.worktrees/research-local-runtime-storage-tooling/src/shared/local-runtime.ts)
- [src/main/services/local-runtime-install-manager.ts](/workspace/.worktrees/research-local-runtime-storage-tooling/src/main/services/local-runtime-install-manager.ts)
- [specs/spec.md](/workspace/.worktrees/research-local-runtime-storage-tooling/specs/spec.md)

## Verified external facts

### Electron storage guidance

Electron documents `userData` as the directory for app configuration and user data, and explicitly says it is not recommended for large files because some environments may back it up to cloud storage.

Electron also documents `sessionData` as potentially very large and recommends moving it away from `userData` when large Chromium-managed data would otherwise pollute that directory.

Primary source:

- https://www.electronjs.org/docs/latest/api/app

Implication:

- the current runtime location under `userData` is stable and easy to reason about
- but it is a poor fit for a Python virtualenv plus model/backend artifacts if the payload becomes large
- the concern is not theoretical; Electron documents this exact category of risk

### uv installation model

`uv` is not part of the standard Python installation. It must itself be installed first, for example via:

- Astral's standalone installer
- `pipx install uv`
- `pip install uv`
- Homebrew or another package manager

The `uv` docs also separate the project model from the `uv pip` compatibility interface and note that the `uv pip` interface expects a virtual environment by default.

Primary sources:

- https://docs.astral.sh/uv/getting-started/installation/
- https://docs.astral.sh/uv/concepts/projects/
- https://docs.astral.sh/uv/pip/environments/

Implication:

- switching this app from `pip` to `uv` is not just swapping one command string for another
- the app would need a policy for how `uv` itself is provisioned, pinned, updated, and trusted

## Why pip was the simpler first implementation

There is no explicit ADR that says "`pip` was chosen because ...". This section is an inference from the current code.

The current install manager only assumes:

- a supported system Python exists
- `venv` is available from that Python
- `pip` can run inside the created environment

That keeps the bootstrap surface narrow:

- no second tool must be installed before runtime installation starts
- no extra binary version needs to be pinned or updated
- the app can drive install with three predictable commands:
  - `python -m venv ...`
  - `<venv-python> -m pip install --upgrade pip`
  - `<venv-python> -m pip install --upgrade <pinned-package-spec>`

For the current case, the package workload is also simple:

- one pinned package spec
- one backend extra
- one app-managed environment
- no `pyproject.toml`-style project workspace

That makes `pip` a reasonable first bootstrap choice even if `uv` is attractive long-term.

## uv advantages if we choose to pay the bootstrap cost

If the app were willing to manage `uv` itself, `uv` would bring real benefits:

- faster dependency resolution and install
- a stronger path toward reproducible lock-driven environments
- unified Python acquisition and environment management if we later decide the app should provision Python too
- a cleaner future if the runtime grows beyond one pinned package spec

These are real benefits, but they only pay off once we accept the extra lifecycle surface:

- how `uv` is installed
- where its binary lives
- how its version is pinned
- whether the app allows `uv` to download Python
- how support diagnostics distinguish `uv` bootstrap failures from runtime package failures

## Storage options

### Option A: Keep the runtime under userData

Benefits:

- simplest implementation
- path is already app-managed and stable
- no new platform-specific directory policy
- no migration work

Costs:

- Electron explicitly warns against large files here
- virtualenv plus backend/model payload may bloat a directory that some platforms back up
- config/state and heavyweight runtime assets stay mixed together

Assessment:

- acceptable as a first shipped implementation
- weak as a durable storage choice if the runtime grows or if backup pollution matters

### Option B: Keep metadata in userData, move runtime payload to a dedicated app-managed data/cache location

Benefits:

- aligns better with Electron's warning about large files
- keeps configuration/state separate from heavyweight install artifacts
- makes future cleanup and migrations easier

Costs:

- Electron does not provide one perfect cross-platform "large app-managed runtime" path for this exact use case
- we would need an explicit path policy per platform
- migration logic is required for existing installs
- release/support docs must define whether the runtime is treated as cache-like, durable app data, or user-removable auxiliary data

Assessment:

- strongest direction if we want to harden this architecture
- should be chosen deliberately, not casually, because it becomes product policy

### Option C: Move to uv and move storage at the same time

Benefits:

- one migration event instead of two
- can redesign runtime management more holistically

Costs:

- conflates two independent variables
- makes failures harder to isolate
- raises risk substantially for a feature that already has meaningful lifecycle complexity

Assessment:

- not recommended as the next step

## Recommendation

Do not change both variables at once.

Recommended order:

1. Keep `pip` for now.
2. Move the runtime payload out of `userData` first, while keeping install semantics otherwise the same.
3. Re-evaluate `uv` only after the storage policy is settled and migration is proven.

Why this order is better:

- the storage concern is directly supported by Electron's official guidance
- the `pip` concern is more about engineering preference and future ergonomics than a present correctness problem
- changing storage alone isolates the more concrete risk
- changing both tooling and storage together would create unnecessary diagnostic ambiguity

## Suggested follow-up decision

If implementation proceeds, the next design step should be an ADR or focused plan that answers:

- what exact path should hold the managed runtime on each supported platform
- which parts remain in `userData` versus move out
- whether the runtime is considered cache-like or durable app data
- how existing `userData/local-runtime/whisperlivekit` installs are migrated safely
- whether uninstall removes only the runtime payload or also associated metadata

## Bottom line

The current `pip` choice is understandable for first bootstrap simplicity.

The current `userData` storage choice is the weaker part of the design. Electron's own docs make that concern credible, so if we change one thing next, storage location should move before installer tooling.
