<!--
Where: docs/decisions/devcontainer-worktrunk-install-method.md
What: Decision record for installing Worktrunk in the devcontainer.
Why: Keep setup reproducible while avoiding unnecessary package-manager overhead.
-->

# Decision: Install Worktrunk via Cargo in Devcontainer Post-Create

## Context
- The devcontainer already runs `.devcontainer/post_install.py` from `postCreateCommand`.
- We need Worktrunk available by default for the branch/worktree workflow.
- Worktrunk user config must live at `~/.config/worktrunk/config.toml`.

## Decision
- Install Worktrunk via Cargo in `post_install.py` when `wt` is missing.
- If Cargo is missing, install Rust toolchain with rustup first.
- Write/update `worktree-path = ".worktrees/{{ branch | sanitize }}"` in
  `~/.config/worktrunk/config.toml`.
- Run `wt config shell install` after installation/config setup.

## Rationale
- Cargo is a lightweight and common path for Linux-based devcontainers.
- This avoids adding Homebrew and its extra bootstrap/runtime overhead.
- Keeping setup in `post_install.py` matches existing container lifecycle wiring.

## Consequences
- First container create may take longer while rustup/cargo install runs.
- Setup remains idempotent: reruns skip install when `wt` already exists.
- Worktree directories are sanitized to avoid branch-name path issues.
