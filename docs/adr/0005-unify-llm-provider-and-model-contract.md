---
title: Unify the LLM provider and model contract before deleting cleanup
description: Introduce one shared provider-and-model contract for transformation presets, keep cleanup temporarily during the stacked rollout, and defer destructive deletion to a later ticket.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - transformation
  - settings
  - cleanup
---

# Context

Dicta currently stores LLM transformation as preset-level `provider` and `model` fields, but the implementation is effectively Google-only:

- shared settings only allow `google`
- the renderer only exposes Google
- the main-process transformation service only instantiates Gemini

At the same time, local Ollama models already exist in the codebase, but only as a separate cleanup feature with separate settings, IPC, readiness, and runtime concepts.

The rollout now aims to:

- remove cleanup completely
- unify all transformation-capable models behind one LLM provider/model contract
- add Ollama transformation
- add a provider-specific ChatGPT subscription OAuth path

That creates one sequencing problem:

- deleting cleanup and widening the shared LLM contract in the same first PR would make the stack larger and less reviewable

# Decision

Adopt one shared LLM provider/model contract first, but keep cleanup temporarily during the stacked rollout.

Specifically:

1. A shared LLM catalog module will define both:
   - the future provider/model catalog for the rollout
   - the narrower executable provider/model subset for the current runtime
2. Shared transformation settings and preset schemas will continue to accept only the executable subset until each provider ticket lands.
3. Cleanup will remain temporarily in the shared settings contract during the first stacked PRs.
4. Cleanup deletion will happen only after replacement provider paths are in place.
5. Provider auth/readiness and provider execution remain separate concerns.
6. Subscription-backed OpenAI support is treated as a provider-specific path, not as ordinary OpenAI Platform API-key support.

# Alternatives considered

## Alternative 1: Delete cleanup in the first shared-contract PR

Why it was rejected:

- it would make the first PR too destructive
- every downstream PR would need to handle both contract reset and feature replacement at once
- it directly conflicts with the rollout goal of small stacked PRs

## Alternative 2: Keep the Google-only transformation contract until all providers are implemented

Why it was rejected:

- it would force later provider work to keep tunneling around Google-specific types
- renderer and main-process contracts would continue to overfit to the current implementation
- it delays the most reusable shared abstraction in the stack

## Alternative 3: Treat OpenAI subscription support as just another API-key provider

Why it was rejected:

- subscription-backed auth does not match the current plain API-key model
- the transport and auth behavior are provider-specific
- it would blur the line between public OpenAI Platform API support and a separate subscription-backed path

# Consequences

## Positive

- The first PR becomes additive and reviewable.
- Later provider work can build on a stable shared catalog without making unsupported presets persistable too early.
- Cleanup deletion stays concentrated in one later PR instead of leaking across the stack.
- The provider architecture can broaden without pretending every provider has the same auth shape.

## Negative

- The rollout temporarily carries both:
  - a broader internal LLM catalog
  - a narrower executable transformation contract
  - the old cleanup field
- Intermediate feature-branch states will not yet represent the final simplified product.

# Notes

- This ADR is intentionally aligned to the stacked feature-branch rollout, not to the final `main` landing state.
- The final cleanup deletion and final user-facing simplification remain required follow-up work, not optional leftovers.
