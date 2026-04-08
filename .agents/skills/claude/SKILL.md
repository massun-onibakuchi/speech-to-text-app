---
name: claude
description: Run Claude Code CLI in interactive or headless mode for coding, editing, review, discussing or any task delegation
---

# Claude Code CLI

Use this skill to run Claude Code CLI in **interactive** or **headless** mode.
Last verified against `claude --help` on 2026-02-20.

## Workflow

1. Think which mode to use: interactive or headless.
2. Assemble the command with appropriate options based on the following reference.
3. For headless review work, do not treat stdout silence as a liveness signal.
4. Use timeout only as a last-resort operational fuse, not as the normal review control path.
5. Prefer repo-owned execution control when a tracked runtime is available, and report status from explicit job state rather than from output timing.
6. Report output, exit code, and any next steps.

## When to use each mode

- Use **interactive** mode when you need multi-turn clarification, exploration, or iterative commands.
- Use **headless** mode for single-shot prompts, automation, or CI scripts.
- Prefer **interactive** if you must inspect outputs before proceeding or choose between options.
- Prefer **headless** if you already have a precise prompt and just need the result.
- Avoid mixing modes in one run unless the user asks for a follow-up.

## Headless Review Guidance

The current timeout-first review flow is transitional.

Direction for this skill:

- launch review work through repo-owned wrappers or runtimes instead of bare `claude -p` when the repository provides one
- treat timeout as a bounded fuse, not as the primary sign of progress or failure
- prefer explicit `start`, `status`, `result`, and `resume` control when the runtime supports it
- if only a compatibility wait path exists, describe the result as `timed out waiting for completion` rather than as a Claude hang unless there is direct error evidence

## Quick Reference

| Use case                   | Command                                       | Notes                                                                                         |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Interactive session        | `claude`                                      | Starts an interactive session by default.                                                     |
| Headless / non-interactive | `claude -p "Your prompt"`                     | `-p/--print` prints and exits. Use for scripts/CI.                                            |
| Headles multi-turn      | `claude -p "Your prompt" -c`                   | Continues the most recent conversation for multi-turn session |
| Choose model               | `claude --model sonnet -p "Your prompt"`      | For single-shot jobs, keep `-p` so output is non-interactive.                                |
| Resume session             | `claude --resume <session-id>` or `claude -r` | `--resume <id>` resumes directly. `-r` with no ID opens the resume picker.                   |
| Permission mode            | `claude --permission-mode plan`               | Current choices: `acceptEdits`, `bypassPermissions`, `default`, `delegate`, `dontAsk`, `plan`. Recheck via `claude --help`. |
| Help                       | `claude --help`                               | Source of truth for current flags/options.                                                    |
