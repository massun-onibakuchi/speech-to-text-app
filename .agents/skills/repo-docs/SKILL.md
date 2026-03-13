---
name: repo-docs
description: Standardize spec, decision, plan, and research docs in this repo. Use when creating, updating, validating, renaming, archiving, or deleting files under specs/spec.md, docs/decision, docs/plans, or docs/research.
---

# Repo Docs

Use this skill when work involves controlled repo docs:

- `specs/spec.md`
- `docs/decision/`
- `docs/plans/`
- `docs/research/`

## Quick rules

- Use filenames in the form `YYYY-MM-DD-<slug>.md`, where the slug is lowercase alphanumeric plus hyphens only.
- New or changed controlled docs must use YAML frontmatter.
- Omit optional fields when absent. Do not use `null`.
- Temporary docs must set explicit `disposition`.
- `links` must be a nested map using only `issue`, `epic`, `pr`, or `decision`, and each value must be a non-empty string.
- `tags`, when present, must be a YAML list of non-empty strings.
- `question` on research docs must be a non-empty string, not whitespace.
- Any frontmatter field not listed as required or as an allowed extra will fail validation.
- Run a validation script after changing controlled docs. Create a validation script and set up CI if not exist.
- If you change the validator or workflow, also run `pnpm vitest run scripts/validate-doc-frontmatter.test.ts`.
- Keep `specs/spec.md` and the codebase aligned. If implementation changes durable product or engineering behavior, update the spec in the same change.

## Choose the doc type

Decision tree:

- durable behavioral truth -> `specs/spec.md`
- durable non-obvious choice -> `docs/decision/...`
- temporary execution coordination -> `docs/plans/...`
- temporary investigation -> `docs/research/...`

- `decision`: durable, non-obvious choice that should outlive the current PR
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

## Required frontmatter

### Common fields

- `type`: declare the controlled doc class so validation, indexing, and path checks can confirm the file’s contract.
- `status`: record the current lifecycle state for the doc type.
- `created`: capture the original doc date so the record can be placed in time without relying on git history.
- `links`: connect the doc to related issue, epic, PR, or decision identifiers without moving narrative context into frontmatter.
- `tags`: add lightweight discovery labels when they materially improve filtering or grouping.

### Decision

```yaml
---
type: decision
status: accepted
created: 2026-03-13
---
```

Status options: `proposed | accepted | superseded | rejected`

Allowed extras:

- `links`
- `tags`

### Plan

```yaml
---
type: plan
status: active
created: 2026-03-13
review_by: 2026-03-20
disposition: delete
---
```

- `review_by`: set the next date someone should confirm the plan is still current or close it out.
- `disposition`: state whether the plan should be deleted or archived when it stops being useful.

Status options: `draft | active | completed | abandoned`

Allowed extras:

- `links`
- `tags`

### Research

```yaml
---
type: research
status: active
created: 2026-03-13
question: "What should we do?"
review_by: 2026-03-20
disposition: archive
---
```

- `question`: state the exact question the research is trying to answer so scope stays explicit.
- `review_by`: set the date to re-check whether the investigation still needs to stay active.
- `disposition`: state whether the finished research should be archived for reuse or deleted as temporary scaffolding.

Status options: `active | concluded | abandoned`

Allowed extras:

- `links`
- `tags`

## Workflow

1. Decide whether the change belongs in `specs/spec.md`, a controlled doc, or both.
2. If creating a controlled doc, pick the correct doc type.
3. Name controlled docs with `YYYY-MM-DD-<slug>.md`.
4. Add only the required frontmatter plus any truly needed optional fields.
5. Keep rationale and nuance in the body, not frontmatter.
6. Keep `specs/spec.md` and code behavior in sync when the change is durable.
7. Run a validation script after changing controlled docs.
8. If the validator or its workflow changed, run the targeted file too.
