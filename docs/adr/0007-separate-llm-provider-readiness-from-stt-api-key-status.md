---
title: Separate LLM provider readiness from STT API key status
description: Introduce a provider-scoped LLM readiness snapshot that can represent API-key, OAuth, and local-runtime providers without overloading the STT API key booleans.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - auth
  - ipc
---

# Separate LLM provider readiness from STT API key status

## Context

The app currently mixes two unrelated concepts:

- STT provider API key presence as simple booleans
- LLM provider readiness through a Google API key boolean plus a cleanup-only Ollama readiness endpoint

That shape no longer fits the rollout target.

The unified LLM system needs to support providers with different readiness mechanics:

- Google uses an API key
- Ollama depends on a local runtime plus installed curated models
- OpenAI subscription support will use browser OAuth

Keeping all of those behind the existing `ApiKeyStatusSnapshot` booleans would force the renderer to keep rebuilding provider truth locally and would leak cleanup-specific assumptions into the new LLM pipeline.

## Decision

Add a dedicated LLM provider readiness snapshot to shared IPC and make the main process the authority for it.

The new snapshot:

- is provider-scoped, not cleanup-scoped
- separates credential shape from readiness state
- supports `api_key`, `oauth`, and `local` credential kinds
- returns curated model availability per provider
- keeps STT `ApiKeyStatusSnapshot` unchanged for current STT flows

Renderer code should consume this LLM readiness snapshot for LLM settings surfaces instead of reconstructing provider readiness from API key booleans or cleanup-specific IPC.

## Alternatives considered

### Extend `ApiKeyStatusSnapshot` with more booleans

Rejected.

This would keep mixing STT and LLM concerns and still cannot express local-runtime providers or OAuth-backed providers cleanly.

### Reuse the cleanup readiness snapshot and rename it later

Rejected.

That would preserve the old cleanup mental model and make Ollama look like a special case rather than a normal LLM provider.

### Wait until OAuth and Ollama execution land, then redesign readiness once

Rejected.

That would force later tickets to build against the wrong contract and would produce larger, harder-to-review PRs.

## Consequences

Positive:

- one main-process source of truth for LLM provider readiness
- renderer no longer needs to infer future-provider status from hard-coded booleans
- future OAuth and Ollama execution tickets can extend an already-correct contract

Negative:

- the app temporarily carries both STT API key booleans and the new LLM provider readiness snapshot
- cleanup still exists elsewhere until the cleanup deletion ticket lands
- current Google execution blocking still uses the older API-key path until later provider-execution tickets unify that runtime seam

## Follow-up

- `LLM-005` should plug Ollama execution into this readiness contract
- `LLM-006` should backfill OAuth persistence and refresh into the same contract
- `LLM-007` should delete the cleanup-specific readiness surface once the replacement providers are active
