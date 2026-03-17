---
title: Controlled doc lifecycle policy
description: Define which controlled docs are durable, which are temporary, and how audits should maintain them.
date: 2026-03-17
status: accepted
tags:
  - docs
  - policy
  - governance
---

<!--
Where: docs/adr/0001-controlled-doc-lifecycle-policy.md
What: Durable policy for keeping, archiving, superseding, and deleting controlled docs.
Why: Keep docs audits anchored in one accepted repo decision instead of relying on scattered guidance across prompts, scripts, and archived research.
-->

# Controlled Doc Lifecycle Policy

## Context

The repository already treats `docs/adr/`, `docs/plans/`, and `docs/research/` as controlled paths in `AGENTS.md` and the repo-side validator scripts.

Before this ADR, the durable lifecycle rules were implied rather than recorded in one accepted decision. The only controlled doc on `main` was archived research about ADR writing and maintenance. That research is useful evidence, but it should not act as the governing artifact for repository policy.

## Decision

The repository will use these lifecycle rules during controlled-doc audits:

1. `docs/adr/` is the durable location for accepted architectural and governance decisions.
2. Accepted ADRs stay in the repo as historical records unless they were created in error. When a later decision replaces one, the older ADR should normally become `superseded` rather than deleted.
3. `docs/plans/` and `docs/research/` are temporary by default. Completed plans and concluded research should be deleted unless they preserve reusable evidence or context that is not already captured in `specs/` or an ADR.
4. Archived research may remain when it supports a durable repo policy, but that research does not replace the normative role of an ADR.
5. Repo parser and validator behavior are the current contract for controlled-doc structure and paths until changed in the repository itself.

## Consequences

- Docs audits should preserve durable ADRs even when they are no longer current, updating status instead of erasing decision history.
- Docs audits should actively remove stale plan and research artifacts when they no longer preserve unique value.
- Archived research on ADR practice can remain as supporting evidence, but durable repo guidance should now point back to this ADR.
