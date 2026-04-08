---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans
Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

## Decide the output

- Save plans to `docs/plans/<number>-<slug>.md`.
- Prefer one plan per coherent workstream. If the request spans loosely related subsystems, recommend splitting it into separate plans.

## Plan doc format 

- Use this frontmatter shape defined by repo-docs skill.

## Read before planning

Before writing the plan:

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.
- If a major technical choice is still unresolved, say so and recommend an ADR or research doc instead of pretending the plan is settled.
- Flag anything with task confidence score below 80 points.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

For larger or high-risk plans, use [plan-document-reviewer-prompt.md](./plan-document-reviewer-prompt.md) after drafting. Replace its placeholder paths with the real plan path and the spec path when a spec exists. If no formal spec exists, point the reviewer at the ticket, research doc, or user requirements instead.

## What a good plan contains

Write for an engineer who is competent but new to this codebase. Optimize for correct execution, not maximal verbosity.

Include:

- Goal: one short statement of what the plan delivers.
- Target branch: the base branch that changes made are merged to.
- Explain the appraoch in great details.
- Scope and non-goals: define what is in and out.
- Relevant files or modules: identify the code and test surfaces that matter.
- Risks or open questions: only the ones that could change sequencing or design.
- Validation strategy: the concrete tests, checks, or manual verification needed.
- Ordered tasks: small, reviewable chunks with clear exit criteria.

## Task design

Make tasks sequential and implementation-ready.

- Keep tasks reviewable. A task should usually correspond to one coherent code review slice, not a full project phase.
- A task is considered complete when all its Definition of Done (DoD) criteria have been met.
- Outline the necessary changes with code snippets.
- Name the files, modules, or interfaces each task is expected to touch.
- State dependencies when a later task relies on an earlier one.
- Include test and doc work in the task where it belongs, not as an afterthought.
- Prefer root-cause work over patches around symptoms.
- Do not require commits, branch management, or subagent orchestration unless the user asked for that workflow.

## No placeholders

Do not leave:

- `TODO`, `TBD`, or `figure this out later`
- vague instructions such as `add error handling` or `write tests`
- references to unnamed files, functions, or abstractions
- tasks that say `same as above`

If detail is necessary for correct execution, write it into the plan.

## Self-review

Before finishing:

1. Check every requirement against at least one task or explicit non-goal.
2. Confirm file paths, module names, and test targets are real.
3. Remove placeholders and duplicated tasks.
4. Verify the saved plan uses the expected filename, frontmatter, and status rules from this skill.
5. Confirm optional frontmatter fields are present only when needed and `links` uses allowed keys.
6. Confirm the controlled-doc validation script ran after the change, or explicitly note that the repo still lacks the required validator.
7. Call out any residual uncertainty instead of hiding it.

## Handoff

When the plan is complete:

- If saved in the repo, report the exact file path.
- Summarize the main workstreams in a few lines.
