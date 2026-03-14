---
type: research
status: archived
created: 2026-03-13
question: "What metadata and PR-CI validation model should decision, plan, and research docs use?"
links:
  issue: 500
  pr: 503
review_by: 2026-03-20
tags:
  - docs
  - validation
---

<!--
Where: docs/research/2026-03-13-doc-lifecycle-frontmatter-validation-report.md
What: Report defining frontmatter, validation, and lifecycle rules for decision, plan, and research docs.
Why: Capture the agreed policy from discussion so it can be reviewed and later turned into repo standards or automation.
-->

# Goal

Define a minimal, durable, and enforceable metadata and validation policy for `docs/decision`, `docs/plans`, and `docs/research` so that:

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

- `specs/spec.md`: a durable product and engineering reference describing current behavior, important rules, boundaries, and lifecycle expectations
- `decision`: a durable record of a non-obvious and lasting choice
- `plan`: a temporary execution artifact used to coordinate work
- `research`: a temporary uncertainty-reduction artifact used to gather evidence before or during implementation

The frontmatter should do only three jobs:

- classify the document
- express lifecycle state
- link the document to related work

Anything requiring nuance or explanation should stay in the document body rather than in frontmatter.

`specs/spec.md` should stay at durable behavior level. It should help code review and future changes by describing stable user-facing behavior and important engineering-facing constraints, while excluding ticket-level execution notes, temporary rollout steps, and one-off investigation details.

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

## Context 4: Single Lifecycle Source Of Truth

Lifecycle policy is easier to apply consistently when temporary docs express state in one place only. Adding path-based semantics on top of frontmatter introduces a second source of truth and increases drift risk.

# Proposed Approaches

## Approach 1: Flat Controlled Paths

The controlled paths should remain:

- `docs/decision/`
- `docs/plans/`
- `docs/research/`

Lifecycle state for temporary docs should live in frontmatter `status`, not in subdirectory names. Changed controlled docs should use the filename pattern `YYYY-MM-DD-<slug>.md`. Older files can be migrated incrementally as they are touched.

## Approach 2: Minimal Frontmatter

Use minimal schemas that match each doc type.

### Decision Doc Frontmatter

```yaml
---
type: decision
status: accepted
created: 2026-03-13
review_by: 2026-09-30
review_trigger: "Recheck if vendor pricing, retention policy, or quality/cost tradeoff changes materially."
links:
  issue: 500
  pr: 503
tags:
  - docs
  - policy
---
```

`review_by` and `review_trigger` should remain optional on decisions. Use them only for accepted decisions that depend on external assumptions that may change without a new internal decision being written.

### Plan Doc Frontmatter

```yaml
---
type: plan
status: active
created: 2026-03-13
links:
  issue: 501
review_by: 2026-03-20
tags:
  - execution
---
```

### Research Doc Frontmatter

```yaml
---
type: research
status: archived
created: 2026-03-13
question: "What metadata and validation model should docs use?"
links:
  issue: 500
  pr: 503
review_by: 2026-03-20
tags:
  - docs
  - validation
---
```

Optional fields should be omitted rather than set to empty values or `null`. For example, if a doc has no linked PR yet, omit `links.pr` entirely instead of leaving it blank.

For plan docs, `disposition` should be implied by policy rather than repeated in frontmatter. Completed plans default to deletion, so the extra field adds friction without adding useful information.

For research docs, retention should be expressed in `status` rather than a second field. `concluded` means the investigation finished but has not been intentionally retained, while `archived` means the investigation finished and is intentionally kept for reuse.

Temporary-doc completion handling should also be explicit:

- completed plans should be deleted by default unless they preserve reusable process or rationale not kept elsewhere
- completed research should be archived only when it preserves reusable evidence or context; otherwise it should be deleted
- leaving completed temporary docs in place for later cleanup should not be the policy, because it creates drift by design

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
- `supersedes` duplicates lineage and is unnecessary in the minimal schema

One narrow exception is justified for decision docs: an optional `review_by` plus `review_trigger` pair for assumption-sensitive accepted decisions. That pair is useful because it turns silent external drift into an explicit review prompt without forcing date churn onto every durable decision.

## Approach 4: PR CI Validation

PR CI should validate only changed docs in controlled paths.

Checks:

- frontmatter exists
- `type` matches path
- `status` is valid for the given `type`
- required fields exist for the given `type`
- date fields use `YYYY-MM-DD` and represent real calendar dates
- `links` only uses allowed keys
- plan docs must set `review_by`
- decision docs may set `review_by` only when paired with `review_trigger`, and only for `status: accepted`
- research docs must set `question` and `review_by`, and must use a valid research status
- unknown frontmatter fields fail validation

## Approach 5: Scheduled Audit Validation

Run a scheduled audit, for example weekly, across active temporary docs as a future follow-on if the team wants stale-doc reporting beyond PR CI.

Audit checks:

- `review_by` is in the past
- concluded docs that should have been either archived or deleted have not been resolved after related work closes

These should surface as audit findings rather than blocking unrelated PRs.

## Approach 6: Validation Run Points

Validation should run at these moments:

- before creating or materially updating a controlled doc
- in every non-trivial PR via a checklist line such as `Doc outcome: none / add / update / archive / delete`
- in PR CI when files under controlled doc paths change
- optionally on issue or epic closure for linked plan and research docs, or when the last linked PR merges
- optionally in a weekly scheduled stale-doc audit

# Discussion

The main policy tension is between traceability and clutter.

The discussion with the subagent and Claude converged on a few strong conclusions:

- durable and temporary docs should not share the same lifecycle expectations
- plans are usually execution scaffolding and should be deleted aggressively
- research is more likely than plans to contain expensive-to-rediscover evidence, so archive should be available but selective
- review dates are useful for audits, but they should not become blanket PR blockers
- temporary-doc lifecycle should have one source of truth: frontmatter `status`

The conclusion ends up being asymmetric for three major reasons:

- purpose determines lifecycle more than file format does, so durable records and temporary execution artifacts need different defaults
- deletion must be the default for temporary docs because team inertia naturally favors keeping clutter rather than cleaning it up
- lifecycle changes must attach to ordinary workflow events, otherwise the policy will remain conceptual and never be enforced consistently

Research should not retain a separate `disposition` field. The archive outcome is better modeled as a terminal research status, because it is not a truly independent axis from lifecycle state and it is only meaningful once the investigation has ended.

There were also two important design tradeoffs:

First, whether to keep `type` when the path already implies type. Claude argued that `type` is redundant. The recommended approach here keeps `type` anyway because it makes linting, indexing, and future file moves easier and provides an explicit machine-readable contract.

Second, whether to keep `updated` or `closed` timestamps. Claude argued these help auditing, but they are likely to become stale when maintained manually. The recommended approach leaves them out of frontmatter and instead relies on git history plus explicit lifecycle transitions.

The resulting policy is intentionally asymmetric:

- decisions are durable records and should remain lean but traceable
- plans are temporary and should default to deletion when complete
- research is temporary and should default to deletion unless it clearly preserves reusable knowledge

This asymmetry is appropriate because the docs serve different purposes. Trying to force them into one unified schema would likely create more metadata debt rather than less.

The policy is operationally credible because the implemented enforcement point in this change set is PR CI on changed controlled docs. That catches malformed frontmatter at the moment a doc is introduced or edited, without blocking unrelated work or depending on later memory-based cleanup. PR checklist prompts, issue-close cleanup, and weekly stale-doc audits can strengthen the process later, but they should be treated as follow-on automation or team workflow rather than as already-implemented guarantees.
