---
title: Replace the local LLM fake auth row with a status panel
description: Use a provider-model-status layout for the Ollama cleanup surface instead of mimicking a cloud API-key row that local runtimes do not actually use.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - settings
  - local-llm
  - ui
---

# Context

ADR `0005` moved local cleanup into the LLM settings area and intentionally mirrored the STT provider-model-auth layout.

That decision solved the original information-architecture problem, but it also introduced a misleading UI artifact:

- local Ollama cleanup displayed a disabled API-key row
- the row did not unlock any real action
- the actual user concern for local runtimes is readiness, not auth

After the LLM settings split into `Google / Gemini`, `OpenAI / Codex`, and `Ollama`, the fake local auth row became even less defensible because cloud auth now has its own dedicated section.

# Decision

Dicta replaces the fake local API-key row in `LLM > Ollama` with an explicit status panel.

Specifically:

1. The Ollama subsection keeps the provider selector and model selector.
2. The fake disabled auth row is removed.
3. Runtime readiness and refresh live in a dedicated status panel.
4. Local model labels render as exact ids rather than prettified display names.

This supersedes ADR `0005` only for the fake-auth-row part of the local LLM form. The broader decision to keep local cleanup inside the LLM settings area remains in force.

# Alternatives considered

## Alternative 1: keep the fake auth row

Rejected.

This preserves visual symmetry with STT, but it keeps teaching the wrong mental model for local runtimes.

## Alternative 2: remove both the fake auth row and the status affordances

Rejected.

This simplifies the surface too aggressively and hides the actual operational states users need to act on.

# Consequences

## Positive

- The Ollama subsection now reflects the real setup problem: runtime readiness.
- The UI is less visually noisy.
- Model labels now match the exact ids used elsewhere in the app.

## Negative

- The local LLM form is no longer a literal clone of the STT provider-model-auth structure.
- ADR `0005` needed to be superseded instead of lightly edited.
