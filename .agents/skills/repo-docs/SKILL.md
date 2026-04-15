---
name: repo-docs
description: Standardize spec, decision, plan, and research docs in this repo. Use when creating, updating, validating, renaming, archiving, or deleting those files.
---

# Repo Docs

Use this skill when work involves controlled repo docs:

- `specs/spec.md`
- `docs/adr/`
- `docs/plans/`
- `docs/research/`

## Quick rules

- Use filenames in the form `<number>-<slug>.md` where the slug is lowercase alphanumeric plus hyphens only.
- Docs must use YAML frontmatter.
- Omit optional fields when absent. Do not use `null`.
- When a plan or research doc uses `links`, it must be a nested map using only `issue`, `epic`, `pr`, or `decision`, and each value must be a non-empty string.
- Run a validation script after changing controlled docs. Create a validation script and set up CI if not exist.
- Docs validation CI must run on every `pull_request`, not only docs-specific path filters.
- If docs validation CI is not set up yet, add it in the same change that introduces or updates controlled doc validation.
- Keep `specs/spec.md` and the codebase aligned. If implementation changes durable product or engineering behavior, update the spec in the same change.
- This skill is portable: use the bundled scripts in `.agents/skills/repo-docs/scripts/` rather than depending on repo-root helpers.

## Choose the doc type

Decision tree:

- durable behavioral truth -> `specs/spec.md`
- important architecture decision -> `docs/adr/...`
- temporary execution coordination -> `docs/plans/...`
- temporary investigation -> `docs/research/...`

- `adr`: records an important architecture decision, why it was made, and its consequences
- `plan`: temporary execution artifact for coordinating work
- `research`: temporary investigation artifact for reducing uncertainty

Default retention:

- `specs/spec.md` is durable and should stay aligned with the current codebase
- decisions are kept while valid
- plans default toward delete when complete
- research defaults toward delete unless it preserves reusable evidence

Completion handling:

- completed plans: delete by default once the work is done, unless the doc captures reusable process or rationale not preserved elsewhere
- completed research: archive only when it preserves reusable evidence or context; otherwise delete
- do not leave completed plan or research docs in place for later cleanup as a policy, because that creates drift by design

## Spec handling

Treat `specs/spec.md` as the durable canonical description of current behavior.

- Update it when code changes durable user-facing or engineering-facing behavior.
- Write it as the product plus engineering reference for durable behavior, rules, boundaries, and lifecycle expectations.
- Keep detail at the level needed for code review and future changes, not ticket-by-ticket execution history.
- Do not put one-off investigation, ephemeral implementation steps, or issue-specific coordination into the spec.
- If a detail belongs only to one ticket or investigation, keep it out of the spec and use plan/research docs instead.
- If code and spec disagree, resolve the mismatch in the same change whenever feasible.

## ADR handling

Treat ADRs only for architecturally significant, hard-to-reverse, cross-cutting, or high-impact decisions.

1. Keep one ADR per decision. Do not bundle multiple unrelated choices into one record.
2. Write ADRs for future readers: explain the problem, constraints, options, rationale, and  consequences clearly.
3. Keep ADRs short, but not shallow. Remove noise, not reasoning.
4. Require real alternatives and explicit trade-offs. Avoid one-sided justification.
5. State the final decision in clear, assertive language.
6. Record negative consequences and operational costs, not just benefits.
7. Anchor decisions in evidence: experiments, spikes, benchmarks, incidents, or concrete constraints.
8. Review ADRs with a repeatable checklist covering significance, options, criteria, rationale, consequences, and actionability.
9. Treat the ADR set as an append-mostly decision log, not a disposable note collection.
10. Do not silently rewrite accepted ADRs to mean something new.
11. When a decision changes, write a new ADR and mark the old one superseded.
12. Use deprecated when an ADR is no longer recommended but is not cleanly replaced by one successor ADR.
13. Do not delete accepted ADRs unless they were invalid artifacts, duplicates, or never represented a real durable decision.
14. Link replacement ADRs to the decisions they supersede so the decision chain stays traceable.
15. Revisit ADRs when requirements, constraints, evidence, or operational realities materially change.
16. Define who can propose, approve, review, and supersede ADRs.
17. Treat ADRs as part of architecture governance, not just documentation. 

## Required frontmatter

### Common fields

- `status`: record the current lifecycle state for the doc type.
- `title`: concise human-readable title for the document.
- `description`: concise one-line summary of the document's purpose or outcome. Maximum 512 characters.
- `date`: record the document date using `YYYY-MM-DD`.
- `links`: optional map for plan or research docs connecting related issue, epic, PR, or decision identifiers without moving narrative context into frontmatter.
- `tags`: add lightweight discovery labels when they materially improve filtering or grouping.

### ADR

Reference template: [adr-template.md](.agents/skills/repo-docs/templates/adr-template.md)

```yaml
---
title: Use ADRs for durable architectural decisions
description: Capture major, cross-cutting architecture choices with status and rationale links.
date: 2026-03-16
status: accepted
tags:
  - architecture
---
```

- Required fields:
  - `title`
  - `description`
  - `date`
  - `status`

Status options: `proposed | accepted | rejected | deprecated | superseded`

- `proposed`: use when the decision is still under discussion and not yet authoritative.
- `accepted`: use when the decision has been agreed and is the current governing choice.
- `rejected`: use when an ADR records an option or proposal that was considered and explicitly not chosen.
- `deprecated`: use when the ADR remains historically relevant but the decision is no longer recommended, without a single clean replacement ADR.
- `superseded`: use when a newer ADR replaces this one; prefer this over deletion for durable decisions.

Allowed extras:

- `tags`

### Plan

```yaml
---
title: Improve repo doc validation coverage
description: Concisely summarize the plan's purpose or intended outcome.
date: 2026-03-16
status: active
review_by: 2026-03-20
---
```

- Required fields:
  - `title`
  - `description`
  - `date`
  - `status`

- `review_by`: optionally set the next date someone should confirm the plan is still current or close it out.

Status options: `draft | active | completed | abandoned`

Allowed extras:

- `review_by`
- `links`
- `tags`

### Research

```yaml
---
title: Evaluate retention rules for temporary docs
description: Concisely summarize the research scope or expected outcome.
date: 2026-03-16
status: archived
review_by: 2026-03-20
---
```

- Required fields:
  - `title`
  - `description`
  - `date`
  - `status`
- `review_by`: optionally set the date to re-check whether the investigation still needs to stay active.

Status options: `active | concluded | archived | abandoned`

Allowed extras:

- `review_by`
- `links`
- `tags`

### Docs validation CI

Reference template: [docs-frontmatter-pr.yml](.agents/skills/repo-docs/templates/docs-frontmatter-pr.yml)

## Workflow

1. Decide whether the change belongs in `specs/spec.md`, a controlled doc, or both.
2. If creating a controlled doc, pick the correct doc type.
3. Use `<number>-<slug>.md` filenames for ADRs, plans, and research docs in their respective directories.
4. Add only the required frontmatter plus any truly needed optional fields.
5. Keep rationale and nuance in the body, not frontmatter.
6. Keep `specs/spec.md` and code behavior in sync when the change is durable.
7. Run `node .agents/skills/repo-docs/scripts/validate-doc-frontmatter.mjs` after changing controlled docs.
8. If the validator or its workflow changed, run the targeted file too.

## Bundled scripts

- `node .agents/skills/repo-docs/scripts/validate-doc-frontmatter.mjs`
- `node .agents/skills/repo-docs/scripts/list-doc-frontmatters.mjs`
- `vitest run .agents/skills/repo-docs/scripts/validate-doc-frontmatter.test.ts .agents/skills/repo-docs/scripts/list-doc-frontmatters.test.ts .agents/skills/repo-docs/scripts/docs-frontmatter-workflow.test.ts .agents/skills/repo-docs/scripts/docs-frontmatter-template.test.ts`
