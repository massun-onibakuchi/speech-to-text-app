<!--
Where: docs/scheduled-codex-setup.md
What: Operator guide for the scheduled macOS launchd + Docker Codex runner.
Why: The repo needs one place that explains the preferred host-seeded OAuth flow and the fallback interactive flow.
-->

# Scheduled Codex Setup

This repo includes a macOS `launchd` setup that runs one Docker container every 3 days and executes `codex exec` with a prompt loaded from a file.

## Files

- `.automation/scheduled-codex/prompt.md`: prompt passed to `codex exec`
- `.automation/scheduled-codex/config.env.example`: example token/image configuration
- `scripts/scheduled-codex/seed-auth-from-host.sh`: preferred one-time seed from an already-authenticated host `~/.codex`
- `scripts/scheduled-codex/bootstrap-oauth.sh`: one-time OAuth bootstrap inside the same mounted `CODEX_HOME`
- `scripts/scheduled-codex/run-container.sh`: single unattended execution
- `scripts/scheduled-codex/install-launch-agent.sh`: generate + install the launchd agent
- `scripts/scheduled-codex/uninstall-launch-agent.sh`: remove the launchd agent

## How It Works

1. `launchd` invokes the host script every `259200` seconds.
2. The host script builds from `.devcontainer/Dockerfile`.
3. Docker mounts the repo as `/workspace`.
4. Docker mounts `.automation/scheduled-codex/state/codex-home` as `/home/node/.codex`.
5. The container runs:

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  --skip-git-repo-check \
  -C /workspace \
  -o /workspace/.automation/scheduled-codex/logs/last-message.txt \
  - < /workspace/.automation/scheduled-codex/prompt.md
```

`GH_TOKEN` from `config.env` is forwarded to the container as both `GH_TOKEN` and `GITHUB_TOKEN`.
The runner also forwards an explicit git identity into the container. By default it uses the host repo's current `git config user.name` and `git config user.email`, and you can override that with `SCHEDULED_CODEX_GIT_USER_NAME` and `SCHEDULED_CODEX_GIT_USER_EMAIL` in `config.env`.

## Setup

1. Create the local config file:

```bash
cp .automation/scheduled-codex/config.env.example .automation/scheduled-codex/config.env
```

2. Edit `.automation/scheduled-codex/config.env` and set `GH_TOKEN`.

   If you want the scheduler to commit with a GitHub-specific identity that differs from your host git config, also set:

```bash
SCHEDULED_CODEX_GIT_USER_NAME="Your Name"
SCHEDULED_CODEX_GIT_USER_EMAIL="123456+your-user@users.noreply.github.com"
```

3. Review `.automation/scheduled-codex/prompt.md`. It is preloaded with the legacy controlled-doc audit prompt that used to live in `scripts/send-docs-audit-task.mjs`.

4. Seed the repo-local OAuth state from an already-authenticated host Codex home:

```bash
bash scripts/scheduled-codex/seed-auth-from-host.sh
```

If your authenticated Codex state lives somewhere other than `~/.codex`, override it:

```bash
CODEX_SOURCE_HOME=/path/to/existing/.codex \
  bash scripts/scheduled-codex/seed-auth-from-host.sh
```

If you need a fallback interactive flow instead, run:

```bash
bash scripts/scheduled-codex/bootstrap-oauth.sh
```

5. Install the launch agent:

```bash
bash scripts/scheduled-codex/install-launch-agent.sh
```

6. Optional immediate run:

```bash
launchctl kickstart -k gui/$(id -u)/com.massun.scheduled-codex
```

## Notes

- The setup does not modify files outside this repository.
- The generated launch agent plist is stored under `.automation/scheduled-codex`.
- The preferred setup is to copy an existing authenticated host Codex home into the repo-local `CODEX_HOME`.
- The interactive `codex login --device-auth` path remains available only as a fallback.
- launchd captures stdout/stderr separately from the container output file. Check `.automation/scheduled-codex` for logs.
- Git commit attribution is not derived from `GH_TOKEN`. Git writes author/committer metadata from `user.name` / `user.email` or the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables, and GitHub links commits to accounts by the commit email address.
