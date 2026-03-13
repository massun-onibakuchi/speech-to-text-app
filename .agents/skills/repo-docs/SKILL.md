---
name: repo-docs
description: Standardize decision, plan, and research docs in this repo. Use when creating, updating, validating, renaming, archiving, or deleting files under docs/decision, docs/plans, or docs/research, or when asked about frontmatter, filename rules, or PR-CI doc validation.
---

# Repo Docs

Use this skill when work involves controlled repo docs:

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

## Choose the doc type

- `decision`: durable, non-obvious choice that should outlive the current PR
- `plan`: temporary execution artifact for coordinating work
- `research`: temporary investigation artifact for reducing uncertainty

Default retention:

- decisions are kept while valid
- plans default toward delete when complete
- research defaults toward delete unless it preserves reusable evidence

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

1. Decide whether the doc should exist at all.
2. Pick the correct doc type.
3. Name the file with `YYYY-MM-DD-<slug>.md`.
4. Add only the required frontmatter plus any truly needed optional fields.
5. Keep rationale and nuance in the body, not frontmatter.
6. Run `pnpm run docs:validate`.
7. If the validator or its workflow changed, run the targeted Vitest file too.

## Source of truth

For exact repo policy and rationale, read:

- `docs/decision/2026-03-13-doc-frontmatter-pr-ci-validation.md`
- `docs/research/2026-03-13-doc-lifecycle-frontmatter-validation-report.md`
- `scripts/validate-doc-frontmatter.mjs`
