---
name: repo-docs
description: Standardize spec, decision, plan, and research docs in this repo. Use when creating, updating, validating, renaming, archiving, or deleting files under specs/spec.md, docs/decision, docs/plans, or docs/research, or when asked about frontmatter, filename rules, or PR-CI doc validation.
---

# Repo Docs

Use this skill when work involves controlled repo docs:

- `specs/spec.md`
- `docs/decision/`
- `docs/plans/`
- `docs/research/`

## Quick rules

- Use filenames in the form `YYYY-MM-DD-<slug>.md`.
- New or changed controlled docs must use YAML frontmatter.
- Omit optional fields when absent. Do not use `null`.
- Temporary docs must set explicit `disposition`.
- Run `pnpm run docs:validate` after changing controlled docs.
- If you change the validator or workflow, also run `pnpm vitest run scripts/validate-doc-frontmatter.test.ts`.
- Keep `specs/spec.md` and the codebase aligned. If implementation changes durable product or engineering behavior, update the spec in the same change.

## Choose the doc type

- `decision`: durable, non-obvious choice that should outlive the current PR
- `plan`: temporary execution artifact for coordinating work
- `research`: temporary investigation artifact for reducing uncertainty

Default retention:

- `specs/spec.md` is durable and should stay aligned with the current codebase
- decisions are kept while valid
- plans default toward delete when complete
- research defaults toward delete unless it preserves reusable evidence

## Spec handling

Treat `specs/spec.md` as the durable canonical description of current behavior.

- Update it when code changes durable user-facing or engineering-facing behavior.
- Do not use it for temporary planning notes or live task tracking.
- If a detail belongs only to one ticket or investigation, keep it out of the spec and use plan/research docs instead.
- If code and spec disagree, resolve the mismatch in the same change whenever feasible.

## Required frontmatter

### Decision

```yaml
---
type: decision
status: accepted
created: 2026-03-13
---
```

Allowed extras:

- `links`
- `tags`
- `superseded_by` when `status: superseded`

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
7. Run `pnpm run docs:validate` after changing controlled docs.
8. If the validator or its workflow changed, run the targeted Vitest file too.

## Source of truth

For exact repo policy and rationale, read:

- `docs/decision/2026-03-13-doc-frontmatter-pr-ci-validation.md`
- `docs/research/2026-03-13-doc-lifecycle-frontmatter-validation-report.md`
- `scripts/validate-doc-frontmatter.mjs`
