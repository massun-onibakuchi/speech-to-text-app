---
type: decision
status: accepted
created: 2026-03-13
links:
  issue: 500
  pr: 503
tags:
  - docs
  - policy
---

<!--
Where: docs/decision/13032026-doc-frontmatter-pr-ci-validation.md
What: Decision record for doc frontmatter shape and PR-CI-first validation.
Why: Keep decision, plan, and research docs enforceable without depending on memory-heavy cleanup rituals.
-->

# Decision: Doc Frontmatter and PR-CI Validation

## Status

Accepted on March 13, 2026.

## Decision

- Doc metadata is intentionally asymmetric by type rather than forced into one unified schema.
- Decision docs require durable fields only: `type`, `status`, and `created`, plus optional linkage and supersession metadata.
- Plan docs require temporary lifecycle fields: `type`, `status`, `created`, `review_by`, and explicit `disposition`.
- Research docs require temporary lifecycle fields plus a required `question`.
- PR CI validates changed controlled docs under `docs/decision/`, `docs/plans/`, and `docs/research/`.
- Scheduled stale-doc auditing is useful as follow-on automation, but it is secondary to PR CI and must not block unrelated PRs.

## Why

- Decisions, plans, and research serve different purposes and therefore should not share the same retention defaults.
- A unified schema would either force irrelevant metadata onto durable docs or make temporary docs too loose to validate reliably.
- High-velocity PR workflows do not support doc cleanup rules that depend mainly on memory.
- PR CI is the strongest practical enforcement point because it runs on an event that already exists and already matters.
- Temporary docs need an explicit `disposition` so the repository can distinguish author intent from omission.

## Consequences

- New or changed controlled docs must include frontmatter that matches the validator schema.
- Temporary docs must declare whether they are intended to be deleted or archived when their useful life ends.
- Missing or malformed metadata will fail PR CI for changed controlled docs.
- Staleness and unresolved temporary-doc cleanup remain visible through audits, but they do not become blanket blockers for unrelated work.
