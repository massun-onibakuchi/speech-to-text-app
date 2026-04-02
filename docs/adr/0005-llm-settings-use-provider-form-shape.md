---
title: Use a provider form shape for local LLM settings in the LLM section
description: Historical record of the first local LLM settings shape decision; superseded after the fake local auth row was replaced by a status panel.
date: 2026-04-02
status: superseded
tags:
  - architecture
  - settings
  - local-llm
  - ui
---

# Context

Superseded by ADR `0006`.

Dicta already had two separate LLM-related settings surfaces:

- the Settings `LLM` section showed only the Google API key
- local cleanup controls lived under `Output`

At the same time, the STT section already used a cohesive provider-model-API-key form shape.

This created two product problems:

- the LLM area did not look structurally similar to the STT area even though users expect the same setup pattern
- local-model behavior looked like an output option instead of an LLM runtime configuration

The requested product behavior is:

- local LLM settings should live in the LLM section
- the LLM section should visually read like provider -> model -> API key
- local providers must not imply that an API key is required
- local-runtime failures should map to actionable states such as install/start/model-missing/auth failure

# Decision

Dicta keeps local cleanup configuration in the Settings `LLM > Ollama` subsection and presents it with a provider-form shape.

Specifically:

1. Output settings own only output mode and output destinations.
2. Local cleanup enablement, runtime/provider selection, model selection, and runtime diagnostics live in the LLM settings section.
3. The local LLM form mirrors the STT provider-model-auth layout so setup feels structurally consistent.
4. When the selected provider is local, the auth row must explicitly state that an API key is not required.
5. Local runtime diagnostics must preserve actionable distinctions for install, start/reachability, model missing, and auth-style failures.

# Alternatives considered

## Alternative 1: keep cleanup under Output

Rejected.

This keeps implementation churn low, but it misclassifies LLM runtime setup as an output-routing concern and preserves the current mismatch between STT and LLM settings.

## Alternative 2: move all transformation preset provider and model editing into Settings

Rejected.

Profiles already own transformation preset provider/model/prompt configuration. Moving that into Settings would fight the existing preset architecture and broaden the change beyond the requested scope.

## Alternative 3: add a fake required API-key field for local providers

Rejected.

This would mimic the STT form mechanically, but it would mislead users about local runtime requirements and create avoidable setup confusion.

# Consequences

## Positive

- The LLM section now reads like a real provider setup surface rather than a loose collection of controls.
- Local runtime setup is grouped with other LLM configuration rather than output routing.
- Users get an explicit statement that local providers do not need API keys.
- Diagnostics become easier to reason about because they live beside provider and model selection.

## Negative

- The LLM section now mixes local cleanup configuration and cloud-key management, which requires careful labeling.
- Tests and docs need to be updated because cleanup controls move out of the Output section.
- The current implementation still keeps transformation preset provider/model editing in Profiles, so the full LLM story remains split across two surfaces.
