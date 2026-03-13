<!--
Where: docs/research/2026-03-13-doc-lifecycle-frontmatter-validation-report.md
What: Report defining frontmatter, validation, and lifecycle rules for decision, plan, and research docs.
Why: Capture the agreed policy from discussion so it can be reviewed and later turned into repo standards or automation.
-->

# Goal

Define a minimal, durable, and enforceable metadata and validation policy for `docs/decisions`, `docs/plans`, and `docs/research` so that:

- durable docs remain trustworthy
- temporary docs do not silently become long-term debt
- validation is strong enough to catch inconsistency without blocking unrelated work

# Assumptions

- The repository may see high PR volume, so markdown files cannot be treated as a live status tracker.
- GitHub issues, PRs, and project boards are better suited than repo docs for fast-moving execution status.
- Decision docs are durable by default.
- Plan docs are temporary by default and should usually be deleted after completion.
- Research docs are temporary by default and should be archived only when they preserve useful evidence or reusable context.
- CI should validate schema and lifecycle consistency, not documentation quality.
- Staleness checks should not become a general PR blocker for unrelated work.

# Definition

For this report, the doc types mean:

- `decision`: a durable record of a non-obvious and lasting choice
- `plan`: a temporary execution artifact used to coordinate work
- `research`: a temporary uncertainty-reduction artifact used to gather evidence before or during implementation

The frontmatter should do only three jobs:

- classify the document
- express lifecycle state
- link the document to related work

Anything requiring nuance or explanation should stay in the document body rather than in frontmatter.

# Contexts

## Context 1: High Change Velocity

When many PRs can open in a single day, execution details in markdown drift quickly. Repo docs should therefore be treated as snapshots or durable references, not as live status boards.

## Context 2: Different Retention Needs

The three doc types have different retention behavior:

- decisions are kept while valid
- plans are usually deleted when work completes
- research is deleted unless it preserves substantive findings worth reusing later

## Context 3: Validation Must Be Cheap

If doc validation blocks unrelated work, engineers will either resent it or route around it. The validation model should therefore separate:

- strict PR checks for changed controlled docs
- scheduled audits for stale temporary docs

## Context 4: Path Structure Affects Policy

Lifecycle validation is much easier if active and archived temporary docs live in different paths. Without that split, rules such as "completed docs should not remain active" become vague and hard to enforce.

# Proposed Approaches

## Approach 1: Path Model

Use explicit doc paths:

- `docs/decisions/`
- `docs/plans/active/`
- `docs/plans/archive/`
- `docs/research/active/`
- `docs/research/archive/`

This path split lets CI enforce lifecycle state with clear rules rather than interpretation.

## Approach 2: Minimal Frontmatter

Use minimal schemas that match each doc type.

### Decision Doc Frontmatter

```yaml
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
```

### Plan Doc Frontmatter

```yaml
---
type: plan
status: active
created: 2026-03-13
links:
  issue: 501
review_by: 2026-03-20
disposition: delete
tags:
  - execution
---
```

### Research Doc Frontmatter

```yaml
---
type: research
status: active
created: 2026-03-13
question: "What metadata and validation model should docs use?"
links:
  issue: 500
  pr: 503
review_by: 2026-03-20
disposition: archive
tags:
  - docs
  - validation
---
```

Optional fields should be omitted rather than set to empty values or `null`. For example, if a doc has no linked PR yet, omit `links.pr` entirely instead of leaving it blank.

## Approach 3: Remove Redundant Or Fragile Metadata

Do not require these fields in frontmatter:

- `updated`
- `title`
- `source_of_truth`
- `sunset_on`
- `scope`
- `decision_output`
- `supersedes`

Reasoning:

- `updated` is easy to let drift unless automated
- `title` is redundant with filename and heading
- `source_of_truth` is often ambiguous
- `sunset_on` overlaps with `review_by`
- `scope` belongs in body sections
- `decision_output` belongs in the body
- `supersedes` duplicates lineage and increases sync risk when paired with `superseded_by`

## Approach 4: PR CI Validation

PR CI should validate only changed docs in controlled paths.

Checks:

- frontmatter exists
- `type` matches path
- `status` is valid for the given `type`
- required fields exist for the given `type`
- date fields are valid ISO dates
- `links` only uses allowed keys
- decision docs with `status: superseded` must set `superseded_by`
- decision docs without `status: superseded` must not set `superseded_by`
- plan docs in active paths may only have `draft` or `active`
- plan docs in archive paths may only have `completed` or `abandoned`
- research docs in active paths may only have `active`
- research docs in archive paths may only have `concluded` or `abandoned`
- temporary docs must set `review_by` and `disposition`

Unknown-field handling should be chosen explicitly:

- either reject unknown fields
- or allow them only under `extra:`

## Approach 5: Scheduled Audit Validation

Run a scheduled audit, for example weekly, across active temporary docs.

Audit checks:

- `review_by` is in the past
- terminal-state temporary docs still live in active paths
- docs intended for `archive` or `delete` have not been resolved after related work closes

These should surface as audit findings rather than blocking unrelated PRs.

## Approach 6: Validation Run Points

Validation should run at these moments:

- before creating or materially updating a controlled doc
- in every non-trivial PR via a checklist line such as `Doc outcome: none / add / update / archive / delete`
- in PR CI when files under controlled doc paths change
- on issue or epic closure for linked plan and research docs, or when the last linked PR merges
- in a weekly scheduled stale-doc audit

# Discussion

The main policy tension is between traceability and clutter.

The discussion with the subagent and Claude converged on a few strong conclusions:

- durable and temporary docs should not share the same lifecycle expectations
- plans are usually execution scaffolding and should be deleted aggressively
- research is more likely than plans to contain expensive-to-rediscover evidence, so archive should be available but selective
- review dates are useful for audits, but they should not become blanket PR blockers
- path structure is part of the policy, not just file organization

The conclusion ends up being asymmetric for three major reasons:

- purpose determines lifecycle more than file format does, so durable records and temporary execution artifacts need different defaults
- deletion must be the default for temporary docs because team inertia naturally favors keeping clutter rather than cleaning it up
- lifecycle changes must attach to ordinary workflow events, otherwise the policy will remain conceptual and never be enforced consistently

There were also two important design tradeoffs:

First, whether to keep `type` when the path already implies type. Claude argued that `type` is redundant. The recommended approach here keeps `type` anyway because it makes linting, indexing, and future file moves easier and provides an explicit machine-readable contract.

Second, whether to keep `updated` or `closed` timestamps. Claude argued these help auditing, but they are likely to become stale when maintained manually. The recommended approach leaves them out of frontmatter and instead relies on git history plus explicit lifecycle transitions.

The resulting policy is intentionally asymmetric:

- decisions are durable records and should remain lean but traceable
- plans are temporary and should default to deletion when complete
- research is temporary and should default to deletion unless it clearly preserves reusable knowledge

This asymmetry is appropriate because the docs serve different purposes. Trying to force them into one unified schema would likely create more metadata debt rather than less.

The policy is operationally credible rather than merely conceptual because its enforcement is attached to existing workflow events. Plan and research docs are resolved when their linked issue or epic closes or when the last linked PR merges, so temporary docs do not sit in active paths indefinitely after work ends. The PR checklist line `Doc outcome: none / add / update / archive / delete` surfaces doc state during code review, which is already the point of highest attention for a change. The weekly stale-doc audit covers the residual case where work drifted or a temporary doc was forgotten. This means the policy does not depend on perfect discipline to work; it depends on ordinary PR and issue workflow.
