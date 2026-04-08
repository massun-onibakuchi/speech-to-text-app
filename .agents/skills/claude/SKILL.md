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
3. For headless review tasks, do not call `claude -p` directly.
4. Run `scripts/run-claude-review.sh` with a minimum 600 second deadline unless the user explicitly asks for a different limit.
5. Report the wrapper status, exit code, and any resumable session id.

## When to use each mode

- Use **interactive** mode when you need multi-turn clarification, exploration, or iterative commands.
- Use **headless** mode for single-shot prompts, automation, or CI scripts.
- Prefer **interactive** if you must inspect outputs before proceeding or choose between options.
- Prefer **headless** if you already have a precise prompt and just need the result.
- Avoid mixing modes in one run unless the user asks for a follow-up.

## Headless Review

Use the bundled wrapper for code review, diff review, or verification prompts that may stay silent while Claude works.

```bash
bash .agents/skills/claude/scripts/run-claude-review.sh \
  --cwd /path/to/worktree \
  --prompt-file /tmp/review-prompt.txt \
  --deadline-seconds 900
```

Resume a timed-out or interrupted review:

```bash
bash .agents/skills/claude/scripts/run-claude-review.sh \
  --cwd /path/to/worktree \
  --resume-session-id <session-id> \
  --deadline-seconds 900
```

The wrapper is the source of truth for timeout, auth, usage-limit, and resumable-session reporting. Do not classify a silent running Claude process as hung before the wrapper deadline expires.

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
