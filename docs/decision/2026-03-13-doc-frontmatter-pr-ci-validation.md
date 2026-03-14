---
type: decision
status: accepted
links:
  issue: 500
  pr: 503
tags:
  - docs
  - policy
---

<!--
Where: docs/decision/2026-03-13-doc-frontmatter-pr-ci-validation.md
What: Decision record for doc frontmatter shape and PR-CI-first validation.
Why: Keep decision, plan, and research docs enforceable without depending on memory-heavy cleanup rituals.
-->

# Decision: Doc Frontmatter and PR-CI Validation

## Status

Accepted on March 13, 2026.

## Decision

- Doc metadata is intentionally asymmetric by type rather than forced into one unified schema.
- Decision docs require durable fields only: `type` and `status`, plus optional linkage metadata and an optional `review_by` + `review_trigger` pair for assumption-sensitive accepted decisions.
- Plan docs require temporary lifecycle fields: `type`, `status`, and `review_by`.
- Research docs require temporary lifecycle fields plus a required `question`, with retention encoded in `status`.
- `specs/spec.md` should be written as the durable product and engineering reference for current behavior, rules, boundaries, and lifecycle expectations.
- Completed plans should default to deletion unless they preserve reusable process or rationale not kept elsewhere.
- Completed research should default to deletion unless it preserves reusable evidence worth archiving.
- Leaving completed temporary docs in place for later cleanup is not the policy.
- PR CI validates changed controlled docs under `docs/decision/`, `docs/plans/`, and `docs/research/`.
- Scheduled stale-doc auditing is useful as follow-on automation, but it is secondary to PR CI and must not block unrelated PRs.

## Why

- Decisions, plans, and research serve different purposes and therefore should not share the same retention defaults.
- The spec is most useful when it stays at durable behavior level and excludes ticket-level execution noise.
- A unified schema would either force irrelevant metadata onto durable docs or make temporary docs too loose to validate reliably.
- High-velocity PR workflows do not support doc cleanup rules that depend mainly on memory.
- PR CI is the strongest practical enforcement point because it runs on an event that already exists and already matters.
- Some accepted decisions depend on external assumptions that can age out silently, so an optional review gate is justified when the trigger is explicit.
- Research docs need a distinct `archived` terminal status so the repository can distinguish retained evidence from ordinary temporary scaffolding without reading the body.

## Consequences

- New or changed controlled docs must include frontmatter that matches the validator schema.
- Assumption-sensitive accepted decisions may set `review_by` only when paired with a non-empty `review_trigger`.
- Research docs must use status values that distinguish active investigation, finished-but-not-curated work, retained evidence, and abandoned work.
- Missing or malformed metadata will fail PR CI for changed controlled docs.
- Staleness and unresolved temporary-doc cleanup remain visible through audits, but they do not become blanket blockers for unrelated work.
