---
title: Run Ollama through the shared transformation provider registry
description: Use the existing Ollama local runtime as a structured-output transformation adapter instead of keeping Ollama isolated to cleanup-only execution paths.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - ollama
  - transformation
---

# Context

The transformation reset branch already introduced:

- a shared LLM provider/model catalog
- a provider-keyed transformation adapter registry
- a provider-scoped LLM readiness contract in the main process

But Ollama still lived behind cleanup-specific runtime concepts even after the shared catalog and readiness work landed. That left the codebase in an awkward split state:

- renderer profile editing could name Ollama in the future-facing catalog
- readiness could report curated Ollama model availability
- the actual transformation runtime still only executed Google Gemini

The next ticket needs a clean way to make curated Ollama models participate in the real transformation pipeline without delaying the later cleanup-deletion ticket.

# Decision

Ollama transformation will run through the same provider registry as Google.

The implementation will:

- widen the implemented transformation provider/model subset to include curated Ollama models
- add an `OllamaTransformationAdapter` that delegates to `OllamaLocalLlmRuntime`
- reuse the shared transformation prompt semantics for Ollama instead of inventing a second local prompt contract
- keep provider readiness as the renderer authority for which curated Ollama models are selectable
- allow local-provider transformation preflight to succeed without an API key lookup

This means Ollama becomes a first-class transformation provider while cleanup remains temporarily present until the later deletion ticket.

# Options considered

## Option 1: Keep Ollama separate until cleanup deletion

Pros:

- fewer code changes in the short term

Cons:

- preserves the split architecture the branch is explicitly trying to remove
- forces the cleanup deletion ticket to absorb both provider enablement and code deletion
- keeps renderer and runtime behavior inconsistent

## Option 2: Add a second transformation code path outside the provider registry

Pros:

- could wire Ollama quickly with fewer shared-contract edits

Cons:

- duplicates transformation dispatch behavior
- bakes provider branching back into orchestration
- conflicts with ADR 0006

## Option 3: Run Ollama through the shared provider registry

Pros:

- aligns runtime with the new provider architecture
- keeps the diff scoped to one adapter and one readiness-aware UI slice
- reduces work left for cleanup deletion

Cons:

- cleanup-specific local runtime naming still remains in some files until the later deletion ticket
- local-provider preflight still uses an API-key-shaped success result for now

# Consequences

Positive:

- transformation presets can now execute curated Ollama models through the same registry as Gemini
- the profile editor can expose curated Ollama models while disabling unavailable ones
- later cleanup deletion becomes a smaller removal-focused change

Negative:

- the local runtime contract remains partly named around cleanup until the dedicated deletion/refactor ticket lands
- OpenAI subscription is still readiness-only, so implemented transformation support remains intentionally asymmetric across providers
