---
title: Use shared local LLM runtime abstraction for cleanup first and transformation later
description: Propose a shared post-transcription local-LLM runtime layer, starting with cleanup on Qwen2.5 1.5B and 3B, with original-transcript fallback on cleanup failure and future transformation support on the same runtime boundary.
date: 2026-03-30
status: proposed
tags:
  - adr
  - local-llm
  - transcript-cleanup
  - electron
  - qwen
---

# Context

Dicta is exploring local transcript cleanup after STT so filler-heavy transcripts can be refined without sending more text to a remote service.

The requested product behavior is:

- cleanup runs after transcription
- cleanup can be enabled or disabled in Settings
- users can select a local model in Settings
- Dicta supports multiple local models
- any cleanup failure must fall back to the original transcript
- the same runtime architecture should later support local transformation without a second incompatible abstraction

This creates two architectural questions:

- should Dicta bind directly to one local runtime such as Ollama, or introduce an abstraction
- should cleanup be allowed to block final text output
- should local cleanup and future local transformation share one runtime boundary

# Decision

Dicta should model local cleanup as an optional post-transcription stage behind a shared local-LLM runtime abstraction, and the original transcript must remain the guaranteed fallback output for cleanup.

Specific decision points:

- cleanup is best-effort, not mandatory for text delivery
- cleanup runs after dictionary correction
- runtime integration is abstracted so Dicta can support multiple local runtimes
- cleanup and future transformation should share the same runtime abstraction, while keeping separate task semantics
- the first target models are `Qwen2.5-1.5B-Instruct` and `Qwen2.5-3B-Instruct`
- the first runtime implementation should prefer Ollama-shaped localhost APIs
- users must explicitly enable cleanup
- users must be able to choose the local model

# Consequences

Positive:

- user always receives text even when cleanup fails
- settings contract remains stable if Dicta later moves from Ollama to an embedded runtime
- small-model local cleanup can be tested quickly with low implementation risk
- product can support quality-vs-latency tradeoffs through model choice
- future local transformation can reuse runtime discovery, health checks, and model inventory

Negative:

- runtime health, model availability, and fallback validation add operational complexity
- local cleanup introduces another user-facing settings surface
- supporting multiple runtimes later requires adapter maintenance
- task-specific prompt and validation semantics must remain separate even when the runtime is shared

# Options considered

## Option 1: hardcode Ollama integration

Rejected.

This is fast, but it leaks one runtime choice into the core product architecture and makes future migration harder.

## Option 2: runtime abstraction with Ollama-first implementation

Proposed.

This keeps the initial implementation fast while preserving future flexibility for both cleanup and transformation.

## Option 3: cleanup as a required stage before any output

Rejected.

This violates the requirement that the user should always receive text, even if post-processing fails.

# Implementation notes

Recommended first slice:

1. add cleanup settings with enable toggle and local model selection
2. add a shared `LocalLlmRuntime` adapter contract
3. implement Ollama runtime support
4. support `Qwen2.5-1.5B-Instruct` first
5. add `Qwen2.5-3B-Instruct` as the quality-upgrade option
6. validate cleanup output and fall back to the original transcript on any failure
7. keep task-specific cleanup and transformation request types separate on top of the shared runtime

# Status notes

This ADR is proposed. It should be accepted when the runtime adapter contract and settings schema are approved for implementation.
