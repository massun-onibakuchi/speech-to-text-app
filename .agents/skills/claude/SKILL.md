---
name: claude
description: Run Claude Code CLI in interactive or headless mode for coding, editing, review, disscussing or any task delegation
---

# Claude Code CLI

Use this skill to run Claude Code CLI in **interactive** or **headless** mode

## Workflow

1. Think which mode to use: interactive or headless.
2. Assemble the command with the appropriate options based on the following reference.
3. Run the CLI
4. Report output and any next steps.

## When to use each mode

- Use **interactive** mode when you need multi-turn clarification, exploration, or iterative commands.
- Use **headless** mode for single-shot prompts, automation, or CI scripts.
- Prefer **interactive** if you must inspect outputs before proceeding or choose between options.
- Prefer **headless** if you already have a precise prompt and just need the result.
- Avoid mixing modes in one run unless the user asks for a follow-up.

## Quick Reference

| Use case                   | Command                                       | Notes                                                                                       |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Interactive session        | `claude`                                      | Starts an interactive session by default.                                                   |
| Headless / non-interactive | `claude -p "Your prompt"`                     | `-p/--print` prints and exits. Use for scripts/CI.                                          |
| Choose model               | `claude --model sonnet "Your prompt"`         | An alias for the latest model (e.g. 'sonnet' or 'opus')                                     |
| Resume session             | `claude -r` or `claude --resume <session-id>` | `-r` opens picker; provide ID to resume directly.                                           |
| Continue last session      | `claude -c`                                   | Continues the most recent conversation in the current directory.                            |
| Permission mode            | `claude --permission-mode plan`               | Modes include `acceptEdits`, `bypassPermissions`, `default`, `delegate`, `dontAsk`, `plan`. |
| Help                       | `claude --help`                               | Use it as the source of truth                                                               |
