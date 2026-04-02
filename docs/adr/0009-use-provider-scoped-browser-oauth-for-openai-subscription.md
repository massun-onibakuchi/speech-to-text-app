---
title: Use provider-scoped browser OAuth for OpenAI subscription
description: Keep ChatGPT-subscription auth separate from API-key providers by using a dedicated browser OAuth session service and transformation adapter.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - oauth
---
# Use provider-scoped browser OAuth for OpenAI subscription

## Context and Problem Statement

The unified LLM model-selection flow now needs to execute transformation presets through `openai-subscription` in addition to Google and Ollama. A ChatGPT subscription is not a standard Platform API-key integration, so reusing the existing API-key secret store and Gemini-style adapter path would blur two different credential lifecycles and make renderer readiness misleading.

## Considered Options

* Reuse the generic API-key contract and treat the subscription access token like an API key
* Add a provider-scoped OAuth session service and dedicated transformation adapter
* Keep `openai-subscription` renderer-visible but leave execution unsupported

## Decision Outcome

Chosen option: "Add a provider-scoped OAuth session service and dedicated transformation adapter", because it keeps the credential model honest, matches the ChatGPT-subscription flow used by Codex-style OAuth clients, and lets the shared LLM registry support API-key, OAuth, and local-runtime providers without pretending they are interchangeable.

### Consequences

* Good, because the renderer can use one readiness contract while the main process still enforces the correct provider-specific auth path.
* Good, because OAuth token refresh, account-id extraction, and bearer-header injection stay isolated inside one provider boundary instead of leaking into generic API-key code.
* Bad, because the app now owns a browser OAuth loopback flow and refresh-token storage path that are more operationally fragile than static API keys.
* Bad, because the `openai-subscription` adapter depends on ChatGPT/Codex-style backend behavior that could drift independently from the official Platform API.
