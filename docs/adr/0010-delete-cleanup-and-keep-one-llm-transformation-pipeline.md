---
title: Delete cleanup and keep one LLM transformation pipeline
description: Remove the standalone cleanup setting, IPC, and capture stage so all LLM-backed text rewriting runs through the unified transformation provider pipeline.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - transformation
  - ollama
---

# Context

The branch has already converged on one shared LLM provider model:

- transformation presets choose a `provider + model`
- Ollama runs through the same provider registry as hosted LLMs
- OpenAI subscription support also enters through the transformation pipeline

The remaining cleanup code had become legacy:

- persisted `settings.cleanup`
- cleanup-specific IPC and preload wiring
- a dedicated post-transcription cleanup stage in capture processing
- cleanup-specific type names around the local Ollama runtime

Keeping that parallel path would preserve dead compatibility code, duplicate readiness concepts, and leave the capture flow harder to reason about.

# Decision

Dicta should delete the standalone cleanup feature completely and keep one LLM-backed text rewriting path: transformation.

Specific consequences of the decision:

- persisted settings no longer include a `cleanup` field
- renderer and preload no longer expose cleanup-specific controls or IPC
- capture processing runs dictionary replacement and then optional transformation directly
- Ollama remains supported, but only as a transformation provider through the shared LLM readiness and adapter system
- local runtime contracts should use transformation-oriented naming rather than cleanup-oriented naming

# Consequences

Positive:

- the codebase has one text-rewrite abstraction instead of two overlapping ones
- provider readiness and model availability stay in one place
- capture behavior becomes easier to test and explain
- future providers do not need to decide whether they implement “cleanup”, “transformation”, or both

Negative:

- old persisted payloads carrying `cleanup` are now invalid instead of migrated
- historical research and rollout docs about cleanup become archival context only
- users lose the old best-effort transcript-only cleanup concept and must use transformation presets instead

# Options considered

## Option 1: keep cleanup as a hidden backward-compatibility layer

Rejected.

This would preserve dead fields, dead IPC, and a second capture-time LLM stage solely to avoid removing legacy code.

## Option 2: keep cleanup but rename it internally

Rejected.

Renaming would reduce surface confusion, but it would still keep a second behavioral path with separate prompts, readiness, and state transitions.

## Option 3: delete cleanup and route all local rewriting through transformation

Accepted.

This matches the branch direction, removes redundant architecture, and leaves a single provider-based execution model.
