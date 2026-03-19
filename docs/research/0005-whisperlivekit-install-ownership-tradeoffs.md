---
title: Study WhisperLiveKit install ownership trade-offs
description: Analyze how WhisperLiveKit installation actually works and compare app-managed installation against assuming the runtime and model are already installed.
date: 2026-03-19
status: concluded
review_by: 2026-04-19
links:
  decision: ADR-0003
tags:
  - research
  - whisperlivekit
  - installation
  - runtime
  - models
  - huggingface
---

<!--
Where: docs/research/0005-whisperlivekit-install-ownership-tradeoffs.md
What: Research note about WhisperLiveKit package/runtime/model installation ownership and its implications for this app.
Why: The app must choose whether to own installation end-to-end or assume the runtime/model already exists, and that choice changes UX, support, security, and operational complexity.
-->

# WhisperLiveKit Install Ownership Trade-offs

## Scope

Study this product and architecture question in detail:

- should the app install and manage WhisperLiveKit itself
- or should the app assume the local WhisperLiveKit runtime and model are already installed

This note covers how WhisperLiveKit installation actually works upstream, what "installed" means at each layer, and how those facts change the trade-off for this repo.

This is research only. No implementation is included in this change.

## Relationship to adjacent research

This note sits between two narrower questions:

- [0004-local-runtime-storage-and-tooling-options.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0004-local-runtime-storage-and-tooling-options.md) asks what the safest next incremental migration step is from the current implementation
- [0006-best-whisperlivekit-in-app-install-approach.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/research/0006-best-whisperlivekit-in-app-install-approach.md) asks what the strongest clean-slate end-state in-app install architecture would be if compatibility constraints are intentionally relaxed

This note answers the broader ownership question that informs both.

## Executive summary

The key fact is that "WhisperLiveKit installed" is not one thing. It is at least four separate layers:

1. Python runtime exists.
2. WhisperLiveKit package plus required extras are installed.
3. Model weights are available locally.
4. The local service can start and answer requests successfully.

For the current Dicta architecture, app-managed install is the stronger primary approach.

Why:

- the current ADR and spec already assume app-owned installation, version pinning, supervision, and uninstall
- WhisperLiveKit package installation does not guarantee model availability
- assuming a user-managed installation creates version drift, cache-location ambiguity, weaker observability, weaker uninstall/update semantics, and more support burden

The strongest product posture is:

- app owns installation of the Python environment and WhisperLiveKit package
- app owns or constrains the model cache location
- app verifies both package and model readiness before reporting the runtime ready
- "assume already installed" remains at most an expert or development override, not the main product path

## Current Dicta baseline

The current merged Dicta code and spec already define the local path as an app-managed runtime:

- [docs/adr/0003-use-whisperlivekit-managed-localhost-runtime-for-local-streaming.md](/workspace/.worktrees/research-local-runtime-storage-tooling/docs/adr/0003-use-whisperlivekit-managed-localhost-runtime-for-local-streaming.md)
- [specs/spec.md](/workspace/.worktrees/research-local-runtime-storage-tooling/specs/spec.md)
- [src/shared/local-runtime.ts](/workspace/.worktrees/research-local-runtime-storage-tooling/src/shared/local-runtime.ts)
- [src/main/services/local-runtime-install-manager.ts](/workspace/.worktrees/research-local-runtime-storage-tooling/src/main/services/local-runtime-install-manager.ts)

The current implementation assumptions are:

- Python `>=3.11 <3.14`
- app-managed staging environment
- pinned package spec `whisperlivekit[voxtral-mlx]==0.2.20.post1`
- app-managed install state machine
- app-managed uninstall and update semantics

This matters because "assume already installed" is not just an implementation variation. It would change the ownership model already accepted in ADR-0003.

## What WhisperLiveKit installation actually consists of

WhisperLiveKit installation splits into multiple layers that can succeed or fail independently.

### Layer 1: Python runtime

From the pinned upstream package metadata:

- `requires-python = ">=3.11, <3.14"`

That matches Dicta's current manifest.

Primary source:

- vendored source archive `pyproject.toml` in `resources/references/whisperlivekit-0.2.20.post1-pypi-source.zip`

### Layer 2: WhisperLiveKit package plus extras

The base package includes the server and shared dependencies such as:

- `fastapi`
- `uvicorn`
- `huggingface-hub`
- `faster-whisper`
- `torch`
- `torchaudio`

Optional extras add backend-specific capabilities. Relevant ones include:

- `voxtral-mlx`
- `voxtral-hf`
- `mlx-whisper`
- `cpu`
- `cu129`
- `translation`
- diarization extras

For Dicta's current local provider, the relevant pinned spec is:

```text
whisperlivekit[voxtral-mlx]==0.2.20.post1
```

Important consequence:

- installing the Python package plus extras does not mean the Voxtral model weights are already present on disk

### Layer 3: model weights and backend assets

Upstream exposes model management through the `wlk` CLI:

- `wlk models`
- `wlk pull <model>`
- `wlk rm <model>`
- `wlk run <model>`

The CLI maps high-level names to model repositories. Relevant examples in the pinned source:

- `voxtral-mlx` → `mlx-community/Voxtral-Mini-4B-Realtime-6bit`
- `voxtral` → `mistralai/Voxtral-Mini-4B-Realtime-2602`
- Whisper-family models map to Hugging Face repos or native Whisper cache files

The `wlk pull` command uses `huggingface_hub.snapshot_download(repo_id)`.

Important consequence:

- package installation and model download are separate lifecycle steps
- a runtime can be "installed" at the package level while still not having the needed model available locally

### Layer 4: server process and readiness

Even after package and model installation succeed, WhisperLiveKit still has to:

- choose a backend
- load or resolve the model
- initialize the server
- bind a host and port
- answer health or websocket requests

So there is a final operational boundary:

- "installed" is not the same as "ready to transcribe"

That distinction is already reflected in Dicta's design, where install management and service supervision are different responsibilities.

## What the upstream CLI reveals

The pinned WhisperLiveKit CLI is extremely informative for this decision.

### `wlk run` already assumes a cache-aware lifecycle

`wlk run <model>`:

- resolves the model spec
- scans for already-downloaded models
- auto-pulls the model if not found
- then starts the server

That means upstream itself does not treat package install as enough. It treats package install plus model presence as the minimum usable unit.

### `wlk models` and `_scan_downloaded_models()` reveal cache ownership

The pinned source scans:

- Hugging Face cache via `huggingface_hub.scan_cache_dir()`
- native Whisper cache in `~/.cache/whisper`

This is critical.

By default, WhisperLiveKit's notion of "downloaded model" is based on global user cache locations, not an app-owned model root.

Implication:

- if Dicta simply installs WhisperLiveKit and lets it use defaults, downloaded models may live in global caches outside Dicta's owned runtime root
- uninstall, disk accounting, backup policy, and support diagnostics become less explicit

### `--model-path` supports multiple ownership modes

Upstream documents:

- `--model-path` can point to a local file or directory
- `--model-path` can also be a Hugging Face repo ID

This makes three practical modes possible:

1. model selected by name, resolved through default caches
2. explicit local model path chosen by the caller
3. repo-id-driven lazy or managed fetch

That flexibility is useful, but it also means that "assume the model is installed" can hide multiple different operational contracts.

## Model storage facts relevant to this decision

### WhisperLiveKit model pulls default to Hugging Face cache

`snapshot_download()` downloads into the Hugging Face local cache by default.

Per Hugging Face's official docs:

- default Hub cache is under `~/.cache/huggingface/hub`
- cache location can be changed via `cache_dir`, `HF_HOME`, or `HF_HUB_CACHE`

Primary sources:

- https://huggingface.co/docs/huggingface_hub/guides/download
- https://huggingface.co/docs/huggingface_hub/en/package_reference/environment_variables

Implication:

- if Dicta wants app-owned model storage, it cannot just rely on WhisperLiveKit defaults
- Dicta must explicitly control the Hugging Face cache location or download destination

### Native Whisper cache is a second independent cache

The pinned CLI also scans `~/.cache/whisper` for native Whisper `.pt` files.

Implication:

- "already installed locally" may mean different caches depending on backend
- support and cleanup logic become backend-sensitive if ownership is not centralized

## Two candidate approaches

There are two main product postures.

### Approach A: app-managed in-app install

The app owns:

- Python environment bootstrap
- package install with pinned extras
- model download or cache placement
- runtime verification
- service startup and readiness checks
- uninstall and update semantics

User experience:

- user opts in once
- app performs installation
- app can show progress, failures, retries, cancel, and uninstall
- app can say "runtime ready" only after package and model are both in place

### Approach B: assume local runtime or model is already installed

There are actually several subvariants:

1. app assumes package and model already exist globally
2. app installs package, but assumes model is already cached
3. app assumes the user supplies an env path, executable path, or model path
4. app assumes a local service is already running elsewhere

These are materially different contracts, but all share one property:

- ownership shifts away from the app and toward user-managed or environment-managed state

## How Approach A works in practice

For Dicta, a robust in-app install path would mean:

1. user explicitly approves local runtime installation
2. app creates or acquires a managed Python environment
3. app installs the pinned WhisperLiveKit package spec with required extras
4. app pre-pulls or otherwise verifies the required model/backend assets
5. app stores install metadata
6. app launches the localhost service with controlled env and cache settings
7. app proves readiness through authenticated probes before exposing the runtime as usable

Important nuance:

- if the app only installs `whisperlivekit[voxtral-mlx]` and waits for first run to pull the model lazily, install completion and first transcription readiness become different product states
- if the app wants a clean UX, it should either pre-pull the required model or represent "package installed, model pending" as an explicit intermediate state

## How Approach B works in practice

If the app assumes the runtime or model is already installed, it still has to answer these questions:

- where is the Python executable
- where is the WhisperLiveKit package installed
- which extras are present
- which backend is actually usable
- where are the model weights stored
- which model revision is cached
- what should happen if the expected model is missing
- what should happen if the model exists but the package version or backend support is incompatible

That means this approach removes install ownership but does not remove validation complexity.

It mostly relocates failure from a managed install step into first-use diagnostics.

## Trade-off analysis

### Product UX

App-managed install is stronger.

Why:

- the app can present one coherent opt-in flow
- the app can show progress and phase information
- the app can make "ready" mean something concrete

Assume-installed is weaker.

Why:

- first use becomes a discovery exercise
- user has to understand Python, extras, models, or caches
- failure messages become more technical and less actionable

### Version control

App-managed install is stronger.

Why:

- app pins exact package version and extras
- app can define upgrade policy
- app can reinstall deterministically

Assume-installed is weaker.

Why:

- the app inherits package drift
- the app may see old caches or incompatible revisions
- package and model versions may not align

### Model ownership

App-managed install is stronger only if the app also owns the model cache path.

Why:

- package install alone is not enough
- without cache control, model assets can still escape into generic user caches

This is the single most important operational nuance in the whole decision.

### Failure handling

App-managed install is stronger.

Why:

- failures can be localized to explicit install phases
- rollback and cancel semantics can be defined
- corrupted runtime roots can be replaced atomically

Assume-installed is weaker.

Why:

- many failures collapse into "it doesn't work on this machine"
- diagnosis often requires inspecting external state the app does not own

### Observability

App-managed install is stronger.

Why:

- the app can log the exact package version, backend, model repo, cache root, and runtime root
- the app can explain which phase failed

Assume-installed is weaker.

Why:

- failures depend on global caches and user environment state
- support diagnostics become more open-ended

### Security and trust surface

Neither approach is free.

App-managed install adds:

- package download and model download logic inside the app
- stronger responsibility for integrity checks and storage policy

Assume-installed adds:

- weaker control over what code and models are actually being executed
- more trust in user environment drift

For Dicta's current security posture, app-managed install is still the stronger fit because it reduces ambiguity even though it increases responsibility.

### Uninstall and disk accounting

App-managed install is stronger if and only if all payloads live under app-owned roots.

If WhisperLiveKit uses default global caches, uninstall becomes partial:

- the app can remove its virtualenv
- but not necessarily all downloaded models

That would be a leaky contract.

Therefore:

- app-managed install should include app-managed cache configuration if it wants clean uninstall semantics

### Change cost

App-managed install has higher initial implementation cost.

Assume-installed has higher long-term support and product cost.

For a developer tool or expert utility, assume-installed can be acceptable.
For a consumer-facing desktop app with guided setup expectations, it is usually the worse long-term trade.

## The most important ambiguity to avoid

"Install WhisperLiveKit in-app" can still be implemented badly if it only installs the package and leaves model ownership implicit.

That creates a misleading state model:

- package installed
- model maybe present somewhere
- service maybe warmable
- first user recording still triggers hidden downloads or fails on missing assets

So the real decision is not simply:

- app installs package

The real decision is:

- does the app own the full runnable runtime, including model assets and their storage location

## What "assume the local model is already installed" actually means

This phrase needs to be decomposed before any implementation starts.

Possible meanings:

1. the package is installed and the correct Hugging Face repo is already cached in the default HF cache
2. the package is installed and the app is given an explicit model path
3. the user already has a working `wlk` environment on the machine
4. a WhisperLiveKit service is already running and the app only needs an endpoint

These are not equivalent.

Each one changes:

- ownership
- update semantics
- uninstall semantics
- error messaging
- documentation burden

If this path were ever chosen, the app would need to narrow it to one explicit contract, not leave it ambiguous.

## Compatibility with current Dicta architecture

Approach A aligns with the current accepted architecture.

Approach B conflicts with existing durable decisions.

Specifically, Dicta has already accepted:

- app-managed optional install
- app-managed version pinning
- app-managed runtime supervision
- explicit install state published to the renderer
- rejection of user-managed runtime installation as the primary product path

So choosing assume-installed would not be a mere implementation tweak.
It would require revisiting the existing ADR and spec.

## Comparison to reference products

The recent reference study also helps frame this choice.

### WhiskrIO pattern

WhiskrIO shells out to `uvx` and delegates model installation and caching to external tooling.

That is effectively an assume-installed or tool-managed posture.

It reduces app-owned install code but weakens:

- version control
- cache ownership
- uninstall semantics
- cross-machine determinism

### Epicenter Whispering pattern

Epicenter Whispering downloads and owns model files itself inside app-managed directories.

That is much closer to the ownership model Dicta wants.

However, Dicta still needs to be stricter about storage policy than blindly copying that path choice, because Electron's `userData` warning makes large-file placement more sensitive here.

## Recommendation

For Dicta, the best primary product path remains:

- app-managed WhisperLiveKit installation
- app-managed model ownership
- app-managed readiness checks

Not just:

- install the package

But:

- own the full runnable runtime, including model storage policy

The strongest operational contract is:

1. app installs the pinned WhisperLiveKit package and extras
2. app explicitly prefetches or verifies the required Voxtral model assets
3. app controls the Hugging Face cache or model destination so payload ownership is explicit
4. app reports ready only after both package and model are usable

The "assume already installed" path should be treated, at most, as:

- a developer override
- an expert-mode escape hatch
- or a future advanced integration surface

It should not be the default product contract.

## Bottom line

WhisperLiveKit package installation and model installation are separate concerns.

That single fact is the core of this decision.

If Dicta owns installation, it should own both layers and the storage policy around them.
If Dicta assumes the model is already installed, it inherits ambiguity in caches, versions, support, and readiness that conflicts with the architecture this repo has already chosen.
