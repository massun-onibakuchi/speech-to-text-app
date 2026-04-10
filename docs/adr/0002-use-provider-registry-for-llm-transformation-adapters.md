---
title: Use a provider registry for LLM transformation adapters
description: Route transformation execution through a provider-keyed adapter registry so new LLM providers can be added without rewriting the orchestration seam.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - transformation
  - runtime
---

# Context

The main-process LLM runtime currently owns one Gemini adapter directly inside `TransformationService`.

That shape creates two problems for the ongoing rollout:

- adding Ollama or subscription-backed OpenAI would require conditional branches in the hottest runtime path
- orchestration seams like `executeTransformation(...)` would keep depending on Gemini-specific behavior even after the shared LLM contract was reset

# Decision

Use a provider-keyed adapter registry as the one dispatch point for transformation execution.

Specifically:

1. `TransformationInput` and `TransformationResult` carry `provider` explicitly.
2. `TransformationService` validates `provider` and `model` centrally.
3. `TransformationService` dispatches to an adapter registry keyed by provider id.
4. The default registry remains Google-only in this PR.
5. Later provider tickets extend the registry instead of changing orchestration signatures again.

# Alternatives considered

## Alternative 1: Keep one Gemini-owned service and add `if provider === ...` branches later

Why it was rejected:

- it would keep provider selection implicit and brittle
- every new provider would modify one growing conditional block
- tests would stay focused on branches instead of registry dispatch

## Alternative 2: Let orchestrators instantiate provider-specific adapters directly

Why it was rejected:

- it would duplicate provider validation and construction logic
- capture and standalone transform paths could drift
- it would weaken the `TransformationService` seam that already centralizes runtime validation

# Consequences

## Positive

- New providers plug into one registry seam.
- Provider and model validation stays centralized in the runtime layer.
- The orchestration contract is widened once instead of per provider ticket.

## Negative

- The runtime now has one more indirection layer.
- The registry can drift from the broader future LLM catalog if later tickets are incomplete.
