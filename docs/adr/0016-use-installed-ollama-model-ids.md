---
title: Use installed Ollama model ids directly
description: Stop hardcoding Ollama transformation models and use the installed model ids reported by Ollama readiness instead.
date: 2026-04-14
status: accepted
tags:
  - architecture
  - ollama
---

# Use installed Ollama model ids directly

## Context

Dicta originally modeled Ollama through a curated allowlist shared across settings validation, readiness, and transformation dispatch.

That design now conflicts with the actual runtime contract:

- Ollama reports installed local models dynamically.
- users can install any compatible model without changing Dicta code
- a hardcoded allowlist blocks valid local setups and forces product releases for simple model changes

The current code also leaks the curated assumption into multiple layers:

- settings schema validation rejects unknown Ollama model ids
- readiness returns disabled rows for models that are not installed
- transformation dispatch rejects installed models that are not in the shipped list

## Decision

Dicta will treat Ollama model ids as runtime-discovered values rather than a shipped enum.

Specifically:

- Ollama readiness will return the installed model ids reported by the local runtime
- transformation presets will accept any non-empty Ollama model id
- the profile editor and settings diagnostics will show only installed Ollama models
- Google and Codex model validation will remain allowlisted and static

## Options Considered

### Option 1: Keep the curated allowlist

Pros:

- strong compile-time exhaustiveness
- easy to attach bespoke labels or metadata to known models

Cons:

- rejects valid installed models
- requires code changes for normal user configuration changes
- diverges from Ollama's dynamic model discovery behavior

### Option 2: Allow installed model ids directly

Pros:

- matches the Ollama runtime contract
- removes unnecessary release coupling
- keeps readiness, selection, and execution aligned on one source of truth

Cons:

- loses compile-time enumeration for Ollama model ids
- model-specific metadata must be added separately if ever needed again

## Consequences

Positive:

- users can use any installed Ollama model immediately
- readiness and execution now agree on what is selectable
- persisted presets survive model catalog drift as long as the model id remains valid

Negative:

- Ollama model ids are now validated at runtime as non-empty strings instead of compile-time enum members
- special-case UI labels or per-model execution flags are no longer implied by the shared contract

