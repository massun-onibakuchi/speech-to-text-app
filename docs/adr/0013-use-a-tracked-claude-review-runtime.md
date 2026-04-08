---
title: Use a tracked Claude review runtime instead of timeout-driven foreground control
description: Replace the timeout-first Claude review wrapper design with tracked jobs, durable job records, and explicit start, status, result, and resume control.
date: 2026-04-08
status: accepted
tags:
  - architecture
  - claude
  - runtime
  - review
  - process-control
---

# Context

The current Claude review integration is controlled like a fragile foreground shell command:

- launch a headless Claude review process
- wait for stdout
- infer liveness from whether output has arrived yet
- use timeout as the main safety and progress mechanism

That design has already produced the wrong operational behavior. Claude often spends long stretches doing tool work before it emits visible output, so a supervising caller can misclassify normal progress as a hang even when Claude is healthy.

The comparison point is now clearer after reviewing the `openai/codex-plugin-cc` runtime model:

- long-running work is launched through a repo-owned runtime rather than through bare shell calls
- state is tracked explicitly
- waiting is done against tracked job state rather than against stdout silence
- timeout exists only as a bounded operational guard in special synchronous flows

The problem is therefore architectural rather than purely parametric. Choosing a larger timeout helps, but it does not fix the fact that the caller is using the wrong signal for liveness.

## Decision

Dicta should move Claude review control to a tracked local runtime.

Specific decision points:

- the runtime surface should support explicit `start`, `status`, `result`, and `resume` commands
- repo-local automation and agent instructions should forbid bare Claude CLI invocations and point callers at the tracked wrapper entrypoint instead
- timeout should remain only as a last-resort operational fuse, not as the normal control path
- job records are the source of truth for state; process liveness is advisory only until a terminal state is written
- the initial public job lifecycle is:
  - `queued`
  - `running`
  - `completed`
  - `failed`
- `canceled` is reserved for a later cancel-specific ticket and is not part of the initial public runtime contract
- each review run should persist a durable job id and Claude session id
- each job record must write terminal metadata including:
  - `finishedAt`
  - `exitCode`
  - `resultCategory`
- terminal job results should include actionable next-step guidance for common failure categories such as auth, usage limits, missing CLI, and generic runtime errors
- runtime state should live outside the git worktree in a per-machine runtime root keyed by repository identity
- the existing `run-claude-runtime.sh --wait` entrypoint should remain temporarily as a compatibility layer, but only as a thin wrapper over tracked jobs
- terminal job directories may be pruned opportunistically after a bounded retention period, but non-terminal jobs should not be auto-removed

## Why this decision

This is the cleanest control model for the failure we have actually observed.

It improves correctness:

- silence is no longer interpreted as failure
- callers ask for job state instead of guessing from output timing
- terminal outcomes become explicit and inspectable

It improves maintainability:

- process supervision, status reporting, and result rendering become separate responsibilities
- compatibility behavior can be bounded explicitly instead of growing ad hoc
- future features such as cancel or richer status can extend the same state model

It improves reviewability:

- the rollout can be split into small PRs
- the first ticket can define the contract before any process-control code changes land

## Consequences

Positive:

- the main timeout-misclassification bug is addressed at the control-model level
- job state becomes durable and debuggable
- callers can support background execution and polling naturally
- resume can be built on explicit stored metadata instead of previous stdout

Negative:

- the runtime shape is larger than a single shell wrapper
- local state management and retention rules become a real concern
- compatibility behavior must be carried temporarily while callers migrate
- implementation complexity moves from shell invocation into a small runtime layer
- retention is intentionally conservative for non-terminal jobs, so orphaned queued or running state may still need manual investigation

## Options considered

## Option 1: keep the one-shot wrapper and only increase or clamp timeout

Rejected.

This reduces the frequency of false failures but keeps the core flaw: liveness is still inferred from output timing instead of tracked state.

## Option 2: use a tracked runtime with explicit job control

Accepted.

This matches the control model proven by `codex-plugin-cc` and addresses the real root cause rather than a symptom.

## Option 3: remove all synchronous waiting and require background-only behavior immediately

Rejected for now.

That would be clean in theory, but it would break current callers too abruptly. A temporary compatibility `--wait` layer is acceptable as long as it is implemented on top of tracked jobs rather than on top of raw foreground timeout logic.

## Implementation notes

Recommended rollout shape:

1. define the runtime contract and state vocabulary
2. add a launcher and durable job store
3. add `status` and `result`
4. add `resume`
5. migrate the Claude skill to the tracked runtime and keep `--wait` as a compatibility layer
6. polish retention, error surfaces, and regression coverage

Recommended job record shape:

```json
{
  "id": "review-20260408-001",
  "status": "running",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "startedAt": "2026-04-08T10:00:00.000Z",
  "finishedAt": null,
  "exitCode": null,
  "resultCategory": null
}
```

Operational rule:

- if a caller waits synchronously, it should wait on tracked job state with a bounded operational fuse and report `timed out waiting for completion`
- it should not report that the Claude run itself is hung solely because stdout is still quiet
- terminal job output should surface an actionable next step when the failure category is known
- terminal job directories older than 72 hours may be pruned opportunistically before new launches to keep the runtime root bounded
- queued and running jobs should be retained until a later cancel-or-repair ticket defines stronger automated cleanup semantics
- repo instructions should direct Claude-driven review and automation flows through `bash .agents/skills/claude/scripts/run-claude-runtime.sh ...` instead of any direct `claude` shell invocation
