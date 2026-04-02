---
title: Local LLM cleanup and transformation for Electron
description: Archived runtime-comparison research preserved for reusable Electron local-LLM evidence after the cleanup-specific rollout was superseded.
date: 2026-03-30
status: archived
tags:
  - research
  - electron
  - local-llm
  - transcript-cleanup
  - transformation
---

# Local LLM cleanup and transformation for Electron

## Archived status

This research started as a cleanup-era investigation, but the cleanup-specific product direction was later removed in favor of one shared transformation pipeline.

The implementation recommendation in this document is therefore historical. It is retained because it still contains reusable evidence that is not duplicated in the accepted ADR set:

- external runtime comparisons
- Electron process-placement rationale
- local-runtime security and trust constraints
- source links for third-party runtime capabilities

Current durable behavior is defined by:

- `docs/adr/0010-delete-cleanup-and-keep-one-llm-transformation-pipeline.md`
- `docs/adr/0011-use-codex-cli-for-chatgpt-subscription-access.md`
- `specs/spec.md`

## Original question

How should Dicta run a small local LLM inside Electron in a way that:

- keeps UI responsiveness intact
- can start with a narrower rewrite task
- can later support broader transformation work
- does not force a second runtime redesign when the product grows

## Reusable external facts

### Electron utility processes

Electron documents `utilityProcess` as a Node-enabled child-process primitive suitable for isolating workloads away from the renderer and main UI thread.

Source:

- https://www.electronjs.org/docs/latest/api/utility-process

### Electron local-LLM reference package

`@electron/llm` is an experimental Electron package built on `node-llama-cpp`, using a utility process and supporting structured output.

Source:

- https://github.com/electron/llm

### llama.cpp server mode

`llama.cpp` provides `llama-server`, a lightweight local HTTP server with OpenAI-compatible request shapes and grammar-constrained output options.

Source:

- https://github.com/ggml-org/llama.cpp

### Ollama

Ollama exposes a localhost API, documents OpenAI-compatible endpoints, and does not require authentication for local API access.

Sources:

- https://docs.ollama.com/api/introduction
- https://docs.ollama.com/openai
- https://docs.ollama.com/api/authentication
- https://ollama.com/library/qwen3.5

### LM Studio

LM Studio documents local server mode, OpenAI-compatible endpoints, model lifecycle APIs, and structured output support.

Source:

- https://lmstudio.ai/docs/developer/openai-compat

## Runtime comparison retained for future local-LLM work

| Approach | Time to ship | UX control | Packaging burden | Model management | Electron fit | Best use |
| --- | --- | --- | --- | --- | --- | --- |
| Ollama | fastest | medium | low | external | good | early rollout |
| LM Studio | fast | medium | low | external with richer APIs | good | power-user workflows |
| bundled `llama.cpp` server | medium-high | high | high | internal | good | integrated long-term runtime |
| utility-process `node-llama-cpp` / `@electron/llm` | medium-high | high | high | internal | best fit, but `@electron/llm` is experimental | integrated long-term runtime |
| renderer-local inference | medium | medium | medium-high | internal | weak | not recommended first |

## Why the runtime comparison still matters

The cleanup feature was removed, but the underlying engineering question remains reusable for any future local-LLM feature:

- whether Dicta should depend on an external localhost runtime or own the runtime internally
- whether model lifecycle should live inside the app or in a companion tool
- whether local inference should run through Electron utility processes or an external daemon

Those choices apply equally to future local transformation work.

## Electron placement rationale

The key placement conclusion remains valid:

- local inference should run from the main-process side of the pipeline
- renderer-local inference is a poor default because it makes responsiveness and lifecycle management harder
- utility processes are the cleanest Electron-native isolation boundary when Dicta eventually owns local inference directly

This was the core reasoning:

- renderer jank is user-visible and hard to recover from
- model loading and inference lifecycle do not belong in UI state
- transcript post-processing naturally belongs beside main-process orchestration
- a main-process-owned adapter keeps cloud and local routing behind one service boundary

## Security and trust implications

These constraints remain durable even though the original cleanup path is gone:

- local rewriting is still a content-modifying operation
- rewritten text should remain explicit to the user
- exact-quote, legal, and medical workflows need conservative UX and wording
- local runtime health failures should degrade predictably instead of producing silent corruption

## Historical recommendation

The original recommendation was:

- keep the product contract task-agnostic
- ship first against an external localhost runtime
- prefer Ollama as the first implementation path
- preserve the option to migrate later to an embedded runtime

That recommendation was made before the cleanup-specific path was removed. It should now be read as historical support for the general local-runtime trade-offs, not as an active implementation plan.
