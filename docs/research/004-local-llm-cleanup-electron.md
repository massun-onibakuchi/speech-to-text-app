---
title: Local LLM cleanup and transformation for Electron
description: Compare Electron-local LLM integration approaches for post-transcription cleanup and future transformation, then recommend a runtime architecture and initial model set for Dicta.
date: 2026-03-30
status: active
review_by: 2026-04-06
tags:
  - research
  - electron
  - local-llm
  - transcript-cleanup
  - qwen
---

# Local LLM cleanup and transformation for Electron

## Goal

Study how Dicta should run a small local LLM inside an Electron application for transcript cleanup first and transformation later, with the following product behavior:

- cleanup runs after transcription
- if cleanup fails, Dicta falls back to the original transcript
- users can enable or disable explicit cleanup in Settings
- users can select a local cleanup model in Settings
- Dicta supports a small set of local models, starting with `Qwen2.5-1.5B-Instruct` and `Qwen2.5-3B-Instruct`
- the same local-LLM architecture should be able to support future transformation work without a second runtime design

This report focuses on runtime architecture, Electron process placement, model-management options, failure handling, and product fit across both cleanup and future transformation.

## Confirmed external facts

### Electron process support

Electron documents `utilityProcess` as a Node-enabled child process with message ports, intended for launching child workloads from the main process. This is the cleanest official Electron primitive for isolating local inference work from the renderer and the main UI thread.

Sources:

- https://www.electronjs.org/docs/latest/api/utility-process

### Electron's own local-LLM reference package

`@electron/llm` is an experimental Electron package that uses `node-llama-cpp`, loads the model in a utility process, and exposes a renderer API. It also supports structured output through `responseJSONSchema`.

Sources:

- https://github.com/electron/llm

### llama.cpp server mode

`llama.cpp` provides `llama-server`, a lightweight OpenAI-compatible HTTP server for serving GGUF models locally. It supports multiple concurrent requests and grammar-constrained output, including JSON grammars.

Sources:

- https://github.com/ggml-org/llama.cpp

### Ollama

Ollama serves a local API by default at `http://localhost:11434/api`, provides official JavaScript support, and documents OpenAI-compatible endpoints. Local API access does not require authentication. Ollama also publishes `qwen2.5:1.5b-instruct-fp16` in its model library.

Sources:

- https://docs.ollama.com/api/introduction
- https://docs.ollama.com/openai
- https://docs.ollama.com/api/authentication
- https://ollama.com/library/qwen2.5%3A1.5b-instruct-fp16

### LM Studio

LM Studio exposes a local server plus OpenAI-compatible endpoints. Its docs also show model lifecycle APIs such as list, load, download, and unload, and document structured output support.

Sources:

- https://lmstudio.ai/docs/developer/openai-compat

### Qwen model sizes

Qwen's official `Qwen2.5` announcement explicitly includes `0.5B`, `1.5B`, `3B`, `7B`, `14B`, `32B`, and `72B` open models. Qwen's official `Qwen3` announcement includes a `4B` model, but this research intentionally constrains the initial Dicta target set to Qwen2.5 `1.5B` and `3B`.

Sources:

- https://qwenlm.github.io/blog/qwen2.5/
- https://qwenlm.github.io/blog/qwen3/

## Dicta-specific workloads

The first target workload, transcript cleanup, is narrower than general chat:

- short or medium transcript fragments
- one-pass cleanup prompt
- low temperature
- structured output preferred
- strong fallback requirement
- user-visible latency should feel low on modern Apple Silicon hardware for short cleanup requests, with the expectation that lower-end or CPU-only machines may be noticeably slower

This is a good fit for a small instruct model because:

- prompt size is small
- context requirements are modest
- response length is short
- the task is a constrained rewrite, not open-ended reasoning

It is also a good fit for strong guardrails:

- structured JSON output
- timeout
- abort support
- fallback to original transcript
- protected-term checks against Dicta dictionary entries

Future transformation is broader:

- prompts may be longer
- output can be longer than input
- style and structure rules vary by preset
- latency tolerance is slightly higher than cleanup, but still user-visible
- output validation is harder because transformation is allowed to rewrite more aggressively

Architecturally, this means Dicta should not build a cleanup-only local runtime. It should build a reusable local-LLM runtime layer with task-specific request types on top.

## Runtime approaches

## Option 1: external local runtime via Ollama

Shape:

- user installs Ollama
- Dicta calls Ollama's localhost API from main process
- Dicta lists local models and lets the user pick one
- cleanup request uses OpenAI-compatible or native Ollama endpoints

Strengths:

- fastest implementation path
- no native inference code inside Dicta
- model download, storage, and runtime supervision are already solved by Ollama
- OpenAI-compatible API matches a future provider abstraction cleanly
- easy user model switching

Weaknesses:

- requires external app dependency
- Dicta cannot fully control install lifecycle
- background availability depends on Ollama daemon state
- model UX is split between Dicta and an external runtime

Operational consequences:

- Dicta must detect whether Ollama is installed and running
- Dicta must surface actionable health errors
- Settings should only show compatible local models, not every installed model blindly

Product fit:

- excellent for prototyping and early rollout
- good if Dicta wants to support multiple local models quickly
- weaker if Dicta wants a polished, fully self-contained desktop experience
- still suitable for future transformation because the same localhost API can accept longer prompt-driven generation requests

## Option 2: external local runtime via LM Studio

Shape:

- user installs LM Studio
- Dicta talks to LM Studio's local server
- Dicta can list, load, download, unload, and select models using LM Studio APIs

Strengths:

- richer model lifecycle API than a plain HTTP inference endpoint
- OpenAI-compatible endpoints simplify prompt integration
- structured output is documented
- model management is user-visible and desktop-friendly

Weaknesses:

- still an external dependency
- runtime state lives outside Dicta
- product support surface expands to another desktop app and its server settings

Operational consequences:

- Dicta must decide whether to support LM Studio and Ollama equally or nominate one preferred external runtime
- runtime auto-detection and conflict handling become necessary if both are installed

Product fit:

- strong for users who already manage local models manually
- good for a power-user tier
- less ideal than an embedded runtime if Dicta wants one-click onboarding
- suitable for future transformation because LM Studio exposes general completion-style local inference, not just one cleanup-specific path

## Option 3: embedded HTTP runtime with bundled `llama.cpp`

Shape:

- Dicta ships or supervises a local `llama-server`
- Dicta stores GGUF models itself or downloads them into app-managed storage
- Dicta talks to the local HTTP server through an internal provider adapter

Strengths:

- full control over lifecycle and UX
- no extra app required
- OpenAI-compatible server shape is easy to integrate
- grammar-constrained JSON output is possible

Weaknesses:

- highest packaging and maintenance burden
- macOS signing, helper process behavior, and native binary distribution become our problem
- model download, integrity, storage, and cleanup must be built by Dicta

Operational consequences:

- Dicta needs runtime install, upgrade, health-check, and crash-restart logic
- app size or first-run install size increases
- release engineering becomes harder

Product fit:

- best long-term integrated UX
- not the fastest path unless Dicta already has a local runtime installation story it wants to reuse
- strong long-term fit if Dicta eventually wants one local runtime for cleanup and transformation together

## Option 4: embedded utility-process runtime via `node-llama-cpp` or `@electron/llm`

Shape:

- Dicta launches local inference inside an Electron utility process
- model files are stored in Dicta-managed storage
- main process supervises the lifecycle
- renderer never talks to native inference directly

Strengths:

- best alignment with Electron's process model
- avoids renderer lockups
- keeps inference inside Dicta
- structured JSON output is supported by `@electron/llm`
- avoids a separate localhost server hop

Weaknesses:

- still requires native runtime packaging and model management
- `@electron/llm` is explicitly experimental
- tighter coupling to Electron-native inference stack

Operational consequences:

- Dicta must own model download/storage
- crash recovery and resource cleanup belong to the app
- native module compatibility becomes part of the support burden

Product fit:

- strong architectural fit for a mature integrated local-LLM feature
- riskier than an external runtime for a first shipping slice
- especially attractive later if Dicta wants shared model residency for both cleanup and transformation without a separate localhost daemon

## Option 5: renderer-local WebGPU inference

Shape:

- renderer loads and runs the model directly

This approach is not recommended for Dicta's first local cleanup implementation.

Reasons:

- renderer responsiveness is harder to protect
- model loading and lifecycle are more fragile in the UI process
- Dicta already has a main-process orchestration pipeline where transcript cleanup belongs naturally

## Comparison

| Approach | Time to ship | UX control | Packaging burden | Model management | Electron fit | Best use |
| --- | --- | --- | --- | --- | --- | --- |
| Ollama | fastest | medium | low | external | good | early rollout |
| LM Studio | fast | medium | low | external with richer APIs | good | power users |
| bundled `llama.cpp` server | medium-high | high | high | internal | good | integrated long-term |
| utility-process `node-llama-cpp` / `@electron/llm` | medium-high | high | high | internal | best, but `@electron/llm` is experimental today | integrated long-term |
| renderer-local inference | medium | medium | medium-high | internal | weak | not recommended first |

## Recommended direction for Dicta

For the first implementation, the best trade-off is:

- product contract designed for an internal task-agnostic runtime abstraction
- initial runtime implementation via an external localhost runtime
- initial preferred runtime: Ollama
- optional secondary runtime: LM Studio

Reason:

- it is much faster to ship and validate user value
- model selection is easy
- Qwen2.5 `1.5B` and `3B` are accessible immediately
- the inference boundary can still look like an internal `LocalLlmRuntime` adapter, so Dicta can migrate later to embedded `llama.cpp` or utility-process inference without breaking settings contracts
- the same runtime layer can later serve cleanup and transformation requests

In other words:

- do not hardcode the architecture to Ollama itself
- do build the first implementation on Ollama-shaped localhost APIs

## Recommended abstraction

Add a main-process adapter contract:

```ts
type LocalLlmRuntimeKind = 'ollama' | 'lm_studio' | 'embedded_llama'

type LocalLlmTask = 'cleanup' | 'transformation'

interface LocalLlmModel {
  id: string
  label: string
  runtime: LocalLlmRuntimeKind
  family?: string
  size?: string
  supportedTasks: readonly LocalLlmTask[]
}

interface LocalCleanupRequest {
  text: string
  language?: string
  protectedTerms: readonly string[]
  timeoutMs: number
}

interface LocalTransformationRequest {
  text: string
  systemPrompt?: string
  userPrompt: string
  timeoutMs: number
}

interface LocalCleanupResponse {
  cleanedText: string
  removedSpans?: readonly {
    text: string
    startToken?: number
    endToken?: number
    reason?: 'filled_pause' | 'duplicate' | 'discourse_marker'
  }[]
}

interface LocalTransformationResponse {
  transformedText: string
}

interface LocalLlmRuntime {
  kind: LocalLlmRuntimeKind
  healthcheck(): Promise<
    | { ok: true }
    | {
        ok: false
        code: 'runtime_unavailable' | 'server_unreachable' | 'model_missing' | 'unsupported_runtime' | 'unknown'
        message: string
      }
  >
  listModels(): Promise<LocalLlmModel[]>
  cleanup(request: LocalCleanupRequest, modelId: string): Promise<LocalCleanupResponse>
  transform(request: LocalTransformationRequest, modelId: string): Promise<LocalTransformationResponse>
}
```

Why this shape:

- it supports multiple runtimes later
- it supports settings-driven model selection
- it keeps fallback handling in Dicta, not hidden inside the runtime adapter
- it prevents a second incompatible runtime abstraction when local transformation is added later

## Recommended model policy

Initial supported models:

- `Qwen2.5-1.5B-Instruct`
- `Qwen2.5-3B-Instruct`

Recommended defaults:

- default model: `Qwen2.5-1.5B-Instruct`
- upgrade recommendation in UI when quality is insufficient: `Qwen2.5-3B-Instruct`

Why:

- `1.5B` should minimize latency and memory
- `3B` provides a higher-quality fallback for users with stronger machines
- both remain within the user's requested initial scope

Transformation note:

- these two models are acceptable for early cleanup exploration
- they may be too weak for high-quality general transformation presets
- the runtime architecture should allow future larger local models or a mixed local/cloud routing policy for transformation

## Prompting and output contract

Cleanup prompt should be narrow and deterministic:

- remove filler words and exact disfluencies
- preserve meaning
- preserve names, acronyms, numbers, units, and dictionary terms
- do not summarize
- do not add information
- do not reorder content unless needed to remove a false start

Use structured output rather than free text.

Recommended response shape:

```ts
{
  cleaned_text: string
  removed_spans?: {
    text: string
    start_token?: number
    end_token?: number
    reason?: 'filled_pause' | 'duplicate' | 'discourse_marker'
  }[]
  meaning_changed: boolean
}
```

Guardrails:

- `temperature = 0`
- `max_output_tokens` sized relative to input length so cleanup output cannot truncate medium-length transcripts
- timeout
- reject invalid JSON
- reject outputs that drop protected terms
- reject outputs that are empty when input was not empty
- if validation fails, return the original transcript

Transformation guardrails should be modeled separately:

- cleanup has original-transcript fallback
- transformation should keep its existing transform failure behavior, not silently replace all transform failures with the source transcript unless the product explicitly wants that contract
- shared runtime does not mean shared task semantics

## Failure handling

The user requirement is correct and should be preserved exactly:

- if post-processing fails, Dicta must output the original transcript

That means cleanup is a best-effort refinement stage, not a critical-path output gate.

Recommended failure cases that must fall back automatically:

- runtime unavailable
- model not loaded
- timeout
- invalid structured output
- validation failure
- process crash

## Settings design

Add an explicit cleanup section in Settings:

- `Enable local transcript cleanup`
- `Runtime`
- `Model`
- optional `Aggressiveness` later, but not in the first slice

Recommended initial settings shape:

```yaml
settings:
  cleanup:
    enabled: false
    provider: "local_llm"
    runtime: "ollama"
    localModelId: "runtime-discovered-model-id"
```

Behavior:

- if disabled, Dicta skips cleanup entirely
- if enabled but runtime healthcheck fails, Dicta logs the failure and falls back to the original transcript
- model picker should show only supported models discovered from the selected runtime
- runtime model IDs should be treated as opaque runtime-specific identifiers, not normalized by Dicta

Ollama model variant note:

- an Ollama-selected model may be a concrete runtime variant such as `qwen2.5:1.5b-instruct-fp16`
- Dicta should store the discovered runtime model ID exactly as reported instead of guessing a canonical string

Onboarding note:

- if cleanup is enabled but the selected runtime has no compatible downloaded model, Settings should show an actionable empty state
- for Ollama, that should point the user to install or pull a supported model
- for LM Studio, that should point the user to download or load a supported model in LM Studio

To prepare for transformation reuse, Settings should avoid naming the underlying infrastructure as cleanup-only.

Recommended configuration split:

- runtime-level settings:
  - local runtime kind
  - available local models
  - selected default local model
- task-level settings:
  - cleanup enabled
  - cleanup model override optional
  - future transformation model override optional

## Electron process placement

Cleanup should run from the main-process side of the pipeline, not the renderer.

Recommended placement:

- renderer records audio
- main process transcribes
- main process applies dictionary replacement
- main process invokes local cleanup runtime
- main process validates cleanup result
- main process falls back or proceeds to transformation/output

This avoids:

- renderer jank
- extra transcript copies through UI state
- UI-driven cleanup races

When local transformation is added later, it should use the same main-process runtime abstraction but a separate task path:

- main process decides whether the selected transformation preset routes to cloud or local runtime
- local runtime handles inference
- output and error semantics remain owned by the transformation pipeline

## Security and trust implications

Even though this is local, the model is still rewriting user content.

So Dicta must:

- make cleanup opt-in
- be explicit that cleaned text is edited text
- preserve raw transcript behavior separately
- avoid silent overreach in legal, medical, or exact-quote workflows

## Recommended rollout

### Phase 1

- add cleanup settings
- implement runtime abstraction
- implement Ollama runtime adapter
- support `Qwen2.5-1.5B-Instruct`
- structured JSON output
- original-transcript fallback

### Phase 2

- add `Qwen2.5-3B-Instruct`
- add LM Studio runtime adapter
- add runtime/model health diagnostics in UI
- shape settings so a future transformation feature can reuse the same runtime and model inventory
- add explicit empty-state UX when no supported local model is installed or loaded

### Phase 3

- evaluate embedded `llama.cpp` or utility-process inference
- consider migrating from external runtime to app-managed runtime if user value is proven
- add local transformation support on top of the same runtime abstraction

## Recommendation

Dicta should adopt optional post-transcription local LLM cleanup with explicit enable/disable control, original-transcript fallback, and user-selectable local model support, but the runtime architecture should be designed as a shared local-LLM layer for both cleanup and future transformation.

For the first shipping path:

1. design around a runtime abstraction
2. implement against Ollama first
3. support `Qwen2.5-1.5B-Instruct` and `Qwen2.5-3B-Instruct`
4. keep cleanup best-effort and non-blocking to final text delivery
5. keep the runtime abstraction task-agnostic so future transformation can reuse it

That gives Dicta the fastest path to user value without locking the product into one runtime forever.
