---
title: Use Codex CLI for ChatGPT subscription-backed OpenAI access
description: Replace the custom browser OAuth integration with Codex CLI execution so ChatGPT subscription access stays on the officially documented Codex sign-in path.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - llm
  - openai
  - codex
  - cli
---

# Context

The `feature/llm-transformation-reset` branch introduced `openai-subscription` as a provider-specific path for LLM transformation. The first implementation used a custom browser OAuth flow against `auth.openai.com`, persisted refresh tokens locally, and executed requests against ChatGPT/Codex-style backend endpoints.

That decision no longer holds after real-world validation:

- browser auth failed immediately with `unknown_error` during sign-in
- the integration relied on a copied client identity and Codex-specific request shape rather than a documented general-purpose third-party app flow
- OpenAI documentation distinguishes ChatGPT subscriptions from normal Platform API billing
- OpenAI documents ChatGPT sign-in for Codex clients, including Codex CLI, but does not document a generic third-party OAuth integration for arbitrary desktop apps that want to reuse ChatGPT subscription access

This means the problem is not just a local implementation bug. The chosen integration boundary was wrong.

## Decision

Dicta should use Codex CLI as the supported execution and authentication surface for ChatGPT subscription-backed OpenAI access.

Specific decision points:

- `openai-subscription` remains a provider in the unified LLM catalog
- Dicta will not implement or ship a custom browser OAuth flow for ChatGPT subscription access
- Dicta will treat Codex CLI as the first-party sign-in boundary for subscription users
- Dicta will execute transformation requests by invoking Codex CLI non-interactively rather than calling ChatGPT/Codex backend endpoints directly
- the first supported Codex-backed model is `gpt-5.4-mini`
- readiness for `openai-subscription` should be derived from Codex CLI availability and login state, not local OAuth token presence
- browser OAuth session storage, refresh-token management, and ChatGPT-account header injection should be deleted rather than repaired

## Why this decision

This is the cleanest supported boundary available for the current product goal.

It aligns with documented OpenAI behavior:

- ChatGPT and Platform billing are separate, so subscription-backed access should not be modeled as normal API-key access
- Codex CLI is an official OpenAI surface that supports ChatGPT sign-in
- keeping authentication inside Codex removes the need for Dicta to own a fragile OAuth client, loopback redirect server, token refresh lifecycle, and private backend coupling

It also fits the branch architecture:

- the unified provider registry stays intact
- Ollama and Google remain direct adapters
- `openai-subscription` becomes a CLI-backed provider adapter instead of a browser-OAuth adapter

## Consequences

Positive:

- subscription-backed OpenAI access moves onto an officially documented Codex sign-in path
- Dicta no longer stores OpenAI refresh tokens or owns a brittle browser OAuth implementation
- the provider model stays clean: API-key providers, local-runtime providers, and CLI-backed providers are all explicit
- future debugging becomes simpler because readiness can point to `codex` installation and login state instead of opaque browser OAuth failures

Negative:

- Codex CLI becomes a runtime dependency for `openai-subscription`
- transformation requests will pay process-launch overhead compared with direct HTTP adapters
- CLI output parsing and command-contract drift must be tested carefully
- this path depends on the locally installed Codex CLI supporting the required non-interactive invocation semantics

## Options considered

## Option 1: fix the custom browser OAuth implementation

Rejected.

Even if the immediate `unknown_error` were fixable, the larger issue remains: the app would still depend on a non-documented third-party OAuth shape and private ChatGPT/Codex request conventions.

## Option 2: use Codex CLI for subscription-backed access

Accepted.

This keeps subscription authentication inside an official Codex client, matches OpenAI's documented sign-in surface, and removes the highest-risk custom auth code from Dicta.

## Option 3: drop subscription support and require Platform API keys only

Rejected for now.

That would be cleaner technically, but it does not satisfy the current product direction to support ChatGPT subscription-backed usage without adding Platform billing requirements.

## Implementation notes

Recommended replacement shape:

1. add a Codex CLI service that can detect executable availability and basic login state
2. replace the browser OAuth readiness state with CLI readiness states such as `not_installed`, `not_logged_in`, and `ready`
3. implement an `openai-subscription` transformation adapter that shells out to Codex CLI with a fixed supported model
4. delete the browser OAuth service, token store, and direct ChatGPT backend adapter
5. update renderer guidance so the user sees install/login help instead of a Connect OAuth button

## Evidence

Official OpenAI references reviewed for this decision:

- ChatGPT subscriptions and API billing are separate: https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform
- ChatGPT subscriptions do not directly become API plans: https://help.openai.com/en/articles/8156019
- OpenAI documents ChatGPT sign-in for Codex CLI: https://help.openai.com/en/articles/11381614-codex-cli-and-sign-in-with-chatgpt
