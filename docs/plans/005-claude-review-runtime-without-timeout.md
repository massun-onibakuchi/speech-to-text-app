---
title: Replace timeout-driven Claude review control with a tracked runtime
description: Plan a small-PR rollout that stops relying on foreground timeouts for Claude review runs by introducing tracked start, status, result, and resume commands.
date: 2026-04-08
status: active
review_by: 2026-04-15
tags:
  - plan
  - claude
  - runtime
  - review
  - codex
---

# Replace timeout-driven Claude review control with a tracked runtime

## Goal

Replace the current timeout-oriented Claude review wrapper approach with a small local runtime that:

- starts a Claude review run and returns a durable job id immediately
- stores session and process metadata locally
- reports explicit job state through status polling rather than stdout silence
- returns final results through a separate result command
- supports resume without guessing from previous output

The immediate product goal is to stop Codex from misclassifying normal silent Claude progress as a hang.

## Locked decisions

- the runtime uses tracked jobs with explicit `start`, `status`, `result`, and `resume` commands
- timeout is a last-resort operational fuse only, not the primary liveness signal
- job records are the source of truth for state; process liveness is advisory only until a terminal state is written
- the initial public state machine is:
  - `queued`
  - `running`
  - `completed`
  - `failed`
- `canceled` is reserved for a future explicit cancel ticket and is not part of the initial public runtime contract
- runtime state is stored outside the git worktree in a per-machine runtime root keyed by repository identity
- `run-claude-runtime.sh --wait` remains supported through this rollout as a thin wrapper over tracked jobs

## Cleaner option considered

Two rollout shapes were considered:

1. keep the current single wrapper and only harden the timeout policy
2. introduce a tracked runtime with `start`, `status`, `result`, and `resume`

This plan chooses option 2.

Why this is cleaner:

- it matches the proven control model used by `codex-plugin-cc`
- it separates execution control from result rendering
- it treats silence as neutral instead of as a failure signal
- it makes auth, usage-limit, timeout, resume, and cancellation explicit states rather than implicit shell behavior

Trade-off:

- the implementation is slightly larger than a single wrapper script
- a small local state model is required
- callers must move from one monolithic command to a start-plus-status workflow

That trade-off is acceptable because the current failure mode is architectural, not just parameter tuning.

## Branch strategy

Target branch for every ticket PR:

- `main`

Branch naming rule:

- `chore/claude-runtime-<ticket-id>-<slug>`

Why:

- each ticket is intentionally small and independently reviewable
- the runtime can be introduced incrementally without an integration branch
- each PR should leave `main` in a coherent working state

## Dependency graph

```text
CR-001 -> CR-002
CR-002 -> CR-003
CR-003 -> CR-004
CR-003 -> CR-005
CR-004 -> CR-006
CR-005 -> CR-006

Can run in parallel:
- CR-004 and CR-005 after CR-003

Must remain sequential:
- CR-002 must land before status or result work because it defines the authoritative job record
- CR-003 must land before resume because resume depends on stable stored metadata and result files
- CR-003 must land before the primary skill migration because the migration depends on stable `status` and `result`
- CR-006 waits for both resume support and the primary skill migration so polish can cover the full runtime surface
```

## Priority order

| ID | Title | Priority | Confidence | Depends on | Parallelizable |
| --- | --- | --- | --- | --- | --- |
| CR-001 | Record the runtime decision and define the tracked job contract | P0 | 92 | — | No |
| CR-002 | Add the local Claude review job state and launcher primitives | P0 | 86 | CR-001 | No |
| CR-003 | Add status and result commands on top of tracked jobs | P0 | 83 | CR-002 | No |
| CR-004 | Add explicit resume support for tracked Claude jobs | P1 | 78 | CR-003 | No |
| CR-005 | Migrate the Claude skill to the tracked runtime and keep `--wait` as a compatibility layer | P0 | 76 | CR-003 | Yes |
| CR-006 | Polish failure surfaces, retention rules, and regression coverage | P1 | 88 | CR-004, CR-005 | No |

Confidence flags below 80:

- CR-004 confidence is 78 because resume semantics depend on stable session persistence and a clean mapping from job ids to resumable sessions
- CR-005 confidence is 76 because compatibility callers may still assume one-shot behavior and some local instructions may reference the current wrapper shape

## Risks and compatibility notes

Backward compatibility:

- existing one-shot wrapper behavior may be referenced by local instructions or scripts
- `run-claude-runtime.sh --wait` remains supported through CR-006 and must be implemented as a thin wrapper over tracked jobs
- removal of compatibility wait mode requires a later follow-up ticket after known callers are migrated

Forward compatibility:

- the state model should be generic enough to support future `cancel` and non-review task execution
- job metadata should not assume only one Claude invocation mode forever
- the runtime root and retention rules must work across multiple worktrees for the same repository without collision

Maintainability:

- keep state management and CLI rendering separate
- do not bury status logic in shell polling loops
- prefer plain JSON state files plus focused helpers over an overbuilt daemon model
- require a terminal-state write with `finishedAt`, `exitCode`, and `resultCategory` so status does not depend on PID heuristics

## Ticket details

## CR-001 - Record the runtime decision and define the tracked job contract

**Priority**: P0  
**Confidence**: 92  
**Target branch**: `main`  
**PR size target**: small

### Goal

Define the durable runtime shape before changing execution behavior.

### Proposed approach

Add an ADR and a small shared design contract for Claude review jobs:

- one job id per launched review
- one persisted session id per Claude run
- one runtime root strategy outside the git worktree, keyed by repository identity
- explicit job statuses:
  - `queued`
  - `running`
  - `completed`
  - `failed`
- distinct result categories:
  - `success`
  - `auth_error`
  - `usage_limit`
  - `missing_cli`
  - `error`
- authoritative terminal state fields:
  - `finishedAt`
  - `exitCode`
  - `resultCategory`
- timeout is demoted to a last-resort operational fuse, not the primary liveness check
- process liveness is advisory only before a terminal state is written

This is cleaner than starting in the launcher because every later PR depends on the same state vocabulary.

### Files in scope

- `docs/adr/0013-use-a-tracked-claude-review-runtime.md`
- `docs/plans/005-claude-review-runtime-without-timeout.md`
- `.agents/skills/claude/SKILL.md`

### Checklist

- [x] Add an ADR for the tracked runtime decision
- [x] Define the job state vocabulary and result categories
- [x] Decide the runtime root strategy and retention rules
- [x] Document why timeout is no longer the normal control path
- [x] Update the Claude skill narrative to reference the planned start/status/result flow

### Tasks

1. Write the ADR with options, trade-offs, and decision outcome.
2. Choose the runtime root strategy and document collision and cleanup rules.
3. Define the runtime job and result contract in the plan and skill docs.
4. Document the migration rule that foreground timeout is only a fallback fuse.

### Definition of Done

- The runtime contract is documented in one ADR and one plan.
- The runtime root strategy is chosen and not left to implementation tickets.
- The job lifecycle and result categories are clear enough to implement without re-deciding semantics.
- The Claude skill no longer implies that stdout silence should be treated as liveness failure.

### Trade-offs

- Pros: later PRs can stay implementation-focused and smaller.
- Cons: this PR adds no runtime behavior by itself.

### Example snippet

```json
{
  "id": "review-20260408-001",
  "jobClass": "review",
  "status": "running",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "startedAt": "2026-04-08T10:00:00.000Z",
  "resultCategory": null
}
```

## CR-002 - Add the local Claude review job state and launcher primitives

**Priority**: P0  
**Confidence**: 86  
**Target branch**: `main`  
**PR size target**: medium

### Goal

Introduce the minimal local runtime needed to launch Claude reviews and persist durable job state.

### Proposed approach

Split the current wrapper into:

- a launcher command that creates a job id
- a small JSON state store
- a process runner that records pid, session id, timestamps, and streaming output locations
- a terminal-state writer that records `finishedAt`, `exitCode`, and `resultCategory`

Use the runtime root chosen in CR-001. Prefer a helper module over shell-only state handling.

This is cleaner than embedding more behavior in a single shell script because process management, state persistence, and rendering remain separable.

### Files in scope

- `.agents/skills/claude/scripts/run-claude-runtime.mjs`
- `.agents/skills/claude/scripts/run-claude-runtime.sh`
- `.agents/skills/claude/scripts/lib/review-job-state.mjs`
- `.agents/skills/claude/scripts/lib/review-launcher.mjs`
- `.agents/skills/claude/scripts/run-claude-review.test.ts`

### Checklist

- [x] Create a job record format and storage location
- [x] Launch Claude with a durable session id and capture stdout/stderr locations
- [x] Persist pid, job id, session id, timestamps, and initial `running` state
- [x] Persist an authoritative terminal state with exit metadata
- [x] Avoid using a short foreground timeout to decide liveness
- [x] Add tests for job creation and stored metadata

### Tasks

1. Add state helpers for creating, loading, and updating job records.
2. Refactor the current wrapper into a launcher plus state persistence.
3. Keep the old shell entrypoint as a stable thin shim while the runtime evolves.
4. Add terminal-state persistence on successful and failed process exits.
5. Add tests for the launcher and job store.

### Definition of Done

- A launched review returns a durable job id.
- Session id and process metadata are persisted locally.
- The runtime writes a terminal state with `finishedAt`, `exitCode`, and `resultCategory`.
- No normal-path launcher behavior depends on a short foreground timeout.
- Tests cover job creation and basic metadata persistence.

### Trade-offs

- Pros: this creates the foundation for status and result commands.
- Cons: process lifecycle edge cases appear sooner and need careful tests.

### Example snippet

```ts
export type ReviewJobRecord = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  sessionId: string
  pid: number | null
  stdoutFile: string
  stderrFile: string
  finishedAt: string | null
  exitCode: number | null
  resultCategory: 'success' | 'auth_error' | 'usage_limit' | 'missing_cli' | 'error' | null
}
```

## CR-003 - Add status and result commands on top of tracked jobs

**Priority**: P0  
**Confidence**: 83  
**Target branch**: `main`  
**PR size target**: small

### Goal

Make Claude review control explicit: query status and fetch results without relying on prior shell output.

### Proposed approach

Extend the runtime with subcommands:

- `start`
- `status`
- `result`

`status` should read the persisted job record as the source of truth. Process liveness is advisory only until a terminal state has been written. `result` should return final Claude output only when the job is completed or failed.

This is cleaner than extending the one-shot wrapper because each command now has one responsibility.

### Files in scope

- `.agents/skills/claude/scripts/run-claude-runtime.mjs`
- `.agents/skills/claude/scripts/lib/review-job-state.mjs`
- `.agents/skills/claude/scripts/lib/review-result.mjs`
- `.agents/skills/claude/scripts/run-claude-review.test.ts`

### Checklist

- [x] Add `status` and `result` command parsing on top of `start`
- [x] Derive status from tracked job state and terminal markers
- [x] Return final output separately from live execution control
- [x] Add tests for status transitions and result retrieval

### Tasks

1. Add command parsing for `status` and `result`.
2. Implement status lookup against stored job records.
3. Implement result retrieval from stored output files.
4. Add tests for running, completed, and failed job states.

### Definition of Done

- Callers can start a review, poll it, and fetch the result.
- Status does not depend on whether Claude has emitted stdout yet.
- Result retrieval is test-covered for running, completed, and failed jobs.

### Trade-offs

- Pros: removes the root cause behind false “hung” classification.
- Cons: increases the amount of runtime state that must be kept tidy.

### Example snippet

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh start --cwd /repo --prompt-file /tmp/review.txt
bash .agents/skills/claude/scripts/run-claude-runtime.sh status --job-id review-20260408-001
bash .agents/skills/claude/scripts/run-claude-runtime.sh result --job-id review-20260408-001
```

## CR-004 - Add explicit resume support for tracked Claude jobs

**Priority**: P1  
**Confidence**: 78  
**Target branch**: `main`  
**PR size target**: small

### Goal

Support explicit continuation of prior tracked Claude review jobs without relying on prior stdout or manual session-id hunting.

### Proposed approach

Add `resume` as a separate runtime concern after `status` and `result` are stable.

Allow resume by:

- `--job-id`
- explicit `--session-id`
- optional `--resume-last` only if the runtime can resolve it deterministically from stored state

This is cleaner than bundling resume into the initial status/result PR because the stored-state rules can be stabilized first.

### Files in scope

- `.agents/skills/claude/scripts/run-claude-runtime.sh`
- `.agents/skills/claude/scripts/run-claude-runtime.mjs`
- `.agents/skills/claude/scripts/lib/review-job-state.mjs`
- `.agents/skills/claude/scripts/run-claude-review.test.ts`

### Checklist

- [x] Add `resume` command parsing
- [x] Support resume by job id and by explicit session id
- [x] Keep resume resolution deterministic and test-covered
- [x] Document any resume-last limitations

### Tasks

1. Add command parsing for `resume`.
2. Resolve session ids from stored job state.
3. Define resume-last behavior only if it is deterministic from persisted state.
4. Add tests for job-id and session-id resume paths.

### Definition of Done

- Callers can resume prior tracked jobs without relying on previous stdout.
- Resume rules are explicit and deterministic.
- Tests cover successful and invalid resume paths.

### Trade-offs

- Pros: resume semantics stay isolated and reviewable.
- Cons: resume depends on stable stored metadata and may surface additional edge cases.

### Example snippet

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh start --cwd /repo --prompt-file /tmp/review.txt
bash .agents/skills/claude/scripts/run-claude-runtime.sh resume --job-id review-20260408-001
```

## CR-005 - Migrate the Claude skill to the tracked runtime and keep `--wait` as a compatibility layer

**Priority**: P0  
**Confidence**: 76  
**Target branch**: `main`  
**PR size target**: small

### Goal

Change the Claude skill contract so callers use the tracked runtime instead of one-shot waiting while preserving a compatibility path for existing callers.

### Proposed approach

Update the Claude skill examples and rules to:

- default to `start`
- use `status` and `result` for follow-up
- mention `resume` only as an optional follow-up capability if CR-004 has already landed
- preserve `--wait` as a thin wrapper over tracked jobs through CR-006

If `--wait` remains, it must poll tracked job state with a long operational fuse and report `timed out waiting for completion` rather than implying the Claude run itself was hung.

This is cleaner than preserving the old one-shot wrapper as the main interface because it aligns caller behavior with the runtime’s actual model while keeping backward compatibility explicit.
It intentionally does not block the migration on resume support because resume is not required to eliminate the timeout misclassification bug.

### Files in scope

- `.agents/skills/claude/SKILL.md`
- `.agents/skills/claude/scripts/run-claude-runtime.sh`
- `.agents/skills/claude/scripts/run-claude-runtime.mjs`
- any local command docs that reference the old one-shot flow

### Checklist

- [x] Update the skill to default to `start` plus `status` or background flow
- [x] Keep `--wait` clearly secondary and compatibility-only
- [x] Remove wording that encourages short foreground timeout control
- [x] Add tests for any remaining wait-mode behavior

### Tasks

1. Update skill examples and command guidance.
2. Migrate the wrapper interface toward subcommands.
3. Keep `--wait` behavior as a thin compatibility layer over tracked jobs.
4. Add tests around wait-mode behavior.

### Definition of Done

- The primary documented usage path is tracked-runtime based, not timeout based.
- Callers can no longer reasonably misread silence as failure from the skill docs.
- Compatibility wait behavior is explicit and bounded.

### Trade-offs

- Pros: the misuse path becomes much less likely without abruptly breaking existing callers.
- Cons: one-shot wait semantics remain temporarily available and must be maintained through the rollout.

### Example snippet

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh start --cwd /repo --prompt-file /tmp/review.txt
# later
bash .agents/skills/claude/scripts/run-claude-runtime.sh status --job-id review-20260408-001
bash .agents/skills/claude/scripts/run-claude-runtime.sh result --job-id review-20260408-001
```

## CR-006 - Polish failure surfaces, retention rules, and regression coverage

**Priority**: P1  
**Confidence**: 88  
**Target branch**: `main`  
**PR size target**: small

### Goal

Make the tracked runtime easy to operate and hard to regress.

### Proposed approach

Polish:

- user-facing auth and usage-limit messages
- stale-job cleanup rules
- docs for common workflows
- tests for backward compatibility and state edge cases

This is cleaner than folding polish into the migration PR because it keeps the critical control-plane rewrite smaller.

### Files in scope

- `.agents/skills/claude/SKILL.md`
- `.agents/skills/claude/scripts/run-claude-runtime.mjs`
- `.agents/skills/claude/scripts/lib/*.mjs`
- `.agents/skills/claude/scripts/run-claude-review.test.ts`
- `docs/adr/0013-use-a-tracked-claude-review-runtime.md`

### Checklist

- [x] Improve auth and usage-limit result messaging
- [x] Document stale-job cleanup and retention behavior
- [x] Add tests for backward compatibility and edge cases
- [x] Re-run doc validation and targeted runtime tests

### Tasks

1. Improve final user-facing error strings.
2. Add cleanup rules for stale or orphaned jobs.
3. Expand tests for result rendering and state repair.
4. Validate the controlled docs.

### Definition of Done

- The runtime reports actionable failure messages.
- State cleanup behavior is documented and tested.
- The plan, ADR, and skill docs are validated.

### Trade-offs

- Pros: improves maintainability and operational clarity.
- Cons: some cleanup behavior may remain heuristic until real usage data accumulates.

### Example snippet

```text
CLAUDE_REVIEW_RESULT job_id=review-20260408-001 status=failed category=auth_error
Next step: run claude auth login, then rerun resume --job-id review-20260408-001
```
