---
name: worktrunk
description: Guidance for Worktrunk, a CLI tool for managing git worktrees. Covers usage and troubleshooting.
---

# Worktrunk

Help users work with Worktrunk, a CLI tool for managing git worktrees.

## Quick Reference

| Use case                       | Command                                                 | Notes                                                |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| Create a worktree + branch     | `wt switch --base <base> --create <feature-name>` | Creates the worktree and branch.                     |
| Switch to an existing worktree | `wt switch <feature-name>`                              | Jumps to the worktree for that branch/name.          |
| List worktrees                 | `wt list`                                               | Shows worktrees and status.                          |
| Remove a worktree              | `wt remove`                                             | Removes worktree; deletes branch if merged.          |
| Manage config                  | `wt config`                                             | User/project config and shell integration.           |
| Help                           | `wt --help` or `wt <command> --help`                    | Source of truth for current flags/options.           |
| Verbose output                 | `wt -v <command>` / `wt -vv <command>`                  | `-v` shows more detail; `-vv` includes debug report. |

## Troubleshooting

**Homebrew (macOS & Linux):**

```bash
$ brew install max-sixty/worktrunk/wt
$ wt config shell install
```

- User config at `~/.config/worktrunk/config.toml`
- Project hooks at `.config/wt.toml`
