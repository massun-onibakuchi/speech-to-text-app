# autonomous coding sandbox

a devcontainer for running claude code and codex in yolo mode.

based on anthropic's claude code devcontainer.

## requirements

- docker (or [orbstack](https://orbstack.dev/))
- devcontainer cli (`npm install -g @devcontainers/cli`)

## quickstart

install `./devcontainer/install.sh self-install`

run `devc <repo>` or `devc .` inside project folder.

you're now in tmux with claude and codex ready to go, with permissions preconfigured.

to use with vscode, run `devc install <repo>` and choose "reopen in container" in the editor.
the built in terminal would login inside the container.

## notes

- **overwrites `.devcontainer/`** on every run
- default shell is fish, zsh available for agents
- auth and history persist across rebuilds via docker volumes
- git config is mounted from host `${HOME}/.config/git/config` to `/home/node/.gitconfig`
- post-create setup installs `worktrunk` via `cargo` (if missing) and writes
  `~/.config/worktrunk/config.toml` with
  `worktree-path = ".worktrees/{{ branch }}"`
- post-create setup sets global git config
  `[worktree] useRelativePaths = true`
- post-create setup adds fish aliases:
  `ga`, `gd`, `gs`, `gp`, `gl`, `gb`, `gco`, `gsc`, `gci`

## troubleshooting

- if `devcontainer up` fails with `bind source path does not exist` for `.config/git/config`, create that host file or adjust the mount in `devcontainer.json`
- run `./.devcontainer/test_devcontainer_config.sh` to verify the configured gitconfig mount path
- run `./.devcontainer/test_worktrunk_post_install.sh` to verify worktrunk post-install defaults
