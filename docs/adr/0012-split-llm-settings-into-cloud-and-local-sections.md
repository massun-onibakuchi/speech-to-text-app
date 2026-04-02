---
title: Split LLM settings into cloud and local sections
description: Keep account-backed LLM setup in one unified cloud form while giving local-runtime providers a dedicated diagnostics surface.
date: 2026-04-02
status: accepted
tags:
  - architecture
  - ux
  - llm
---
# Split LLM settings into cloud and local sections

## Context and Problem Statement

Dicta's unified LLM rollout made Google, Ollama, and OpenAI Subscription share one readiness contract, but the Settings UI still presented them unevenly. Google appeared as an editable API-key form, while Ollama and OpenAI Subscription appeared as passive readiness rows. That structure exposed implementation history instead of the user's mental model.

The real setup tasks are different:

- cloud providers require provider selection, model confirmation, and account-backed setup
- local providers require runtime health plus per-model availability diagnostics

We need a Settings layout that keeps those differences honest without fragmenting the LLM surface into three unrelated provider cards.

## Considered Options

* Keep one mixed provider list with per-provider rows and special cases
* Put every LLM provider into one fully unified provider/model/setup form
* Split Settings into a unified cloud section plus a dedicated local diagnostics section

## Decision Outcome

Chosen option: "Split Settings into a unified cloud section plus a dedicated local diagnostics section", because it preserves one coherent LLM setup experience for account-backed providers while keeping local-runtime diagnostics visible and actionable without inventing a fake global provider/model setting.

### Consequences

* Good, because cloud providers now share one setup surface without pretending that Settings owns the persistent provider/model choice used by transformation profiles.
* Good, because OpenAI Subscription can sit beside Google in one cloud flow without pretending its Codex CLI readiness is an API-key field.
* Good, because Ollama runtime health and model availability stay grouped together, which matches how local execution actually fails.
* Bad, because the LLM Settings surface is no longer one flat provider list; users must understand the cloud/local grouping and the difference between setup diagnostics and profile selection.
* Bad, because renderer tests and documentation must now cover section-level information architecture in addition to provider-specific readiness.
