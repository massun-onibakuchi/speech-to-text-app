---
name: claude
description: Run Claude Code CLI in interactive or headless mode for coding, editing, review, discussing or any task delegation
---

# Claude Code CLI

Use this skill to run Claude Code CLI for coding, editing, review, discussion, or task delegation.
Last verified against `claude --help` on 2026-02-20.

## Workflow

1. Decide whether the task needs interactive exploration or a tracked headless review run.
2. In this repo, do not invoke `claude`, `claude -p`, or similar direct CLI entrypoints for agent work.
3. Use the tracked runtime wrapper for Claude-assisted work in this repo.
4. Start work explicitly, then use `status`, `result`, and `resume` against the tracked job id.
5. Treat `--wait` as compatibility-only; it polls tracked state and is not the primary review flow.
6. Do not treat stdout silence as a liveness signal.
7. Report output, exit code, and any next steps.

## Repo rule

For this repository, the allowed agent path is the tracked wrapper:

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh ...
```

Use the wrapper instead of direct `claude` shell invocations when operating in this repo.

## Headless Review Guidance

Primary path for this repo:

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh start \
  --cwd /path/to/worktree \
  --prompt-file /tmp/review-prompt.txt \
  --json
```

Follow-up control:

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh status \
  --cwd /path/to/worktree \
  --job-id <job-id> \
  --json

bash .agents/skills/claude/scripts/run-claude-runtime.sh result \
  --cwd /path/to/worktree \
  --job-id <job-id> \
  --json
```

Optional follow-up if you need to continue a prior tracked run:

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh resume \
  --cwd /path/to/worktree \
  --job-id <job-id> \
  --json
```

Compatibility path only:

```bash
bash .agents/skills/claude/scripts/run-claude-runtime.sh start \
  --cwd /path/to/worktree \
  --prompt-file /tmp/review-prompt.txt \
  --wait
```

Rules:

- prefer `start`, then `status` and `result`, over any waiting path
- treat `--wait` as a bounded convenience layer over tracked job state, not as proof of Claude liveness
- if a wait expires, describe it as `timed out waiting for completion`, not as a Claude hang
- do not use `--resume-last`; the tracked runtime intentionally keeps resume resolution deterministic

## Quick Reference

| Use case                     | Command                                                                 | Notes                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Tracked review start         | `bash .agents/skills/claude/scripts/run-claude-runtime.sh start ...`    | Preferred repo-local review path. Returns a tracked job id unless `--wait` is used.          |
| Tracked review status        | `bash .agents/skills/claude/scripts/run-claude-runtime.sh status ...`   | Reads persisted job state instead of inferring progress from stdout timing.                   |
| Tracked review result        | `bash .agents/skills/claude/scripts/run-claude-runtime.sh result ...`   | Fetches final Claude output only after the job reaches a terminal state.                      |
| Tracked review resume        | `bash .agents/skills/claude/scripts/run-claude-runtime.sh resume ...`   | Resume by tracked job id or explicit session id. `--resume-last` stays unsupported on purpose. |
| Compatibility wait           | `bash .agents/skills/claude/scripts/run-claude-runtime.sh start ... --wait` | Secondary path only. Polls tracked state and may report `timed out waiting for completion`. |
