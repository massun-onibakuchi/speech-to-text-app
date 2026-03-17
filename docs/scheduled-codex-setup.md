<!--
Where: docs/scheduled-codex-setup.md
What: Operator guide for the scheduled macOS launchd + Docker Codex runner.
Why: The repo needs one place that explains the supported host-seeded auth flow, local artifacts, and Telegram reporting.
-->

# Scheduled Codex Setup

This repo includes a macOS `launchd` setup that runs one Docker container every 3 days and executes `codex exec` with a prompt loaded from a file.

## Files

- `.automation/scheduled-codex/prompt.md`: prompt passed to `codex exec`
- `.automation/scheduled-codex/config.env.example`: example token/image configuration
- `scripts/scheduled-codex/seed-auth-from-host.sh`: one-time seed from an already-authenticated host `~/.codex`
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

The host runner resolves a GitHub token at runtime with `gh auth token`, then forwards that token to the container as both `GH_TOKEN` and `GITHUB_TOKEN`.
The runner also forwards an explicit git identity into the container. By default it uses the host repo's current `git config user.name` and `git config user.email`, and you can override that with `SCHEDULED_CODEX_GIT_USER_NAME` and `SCHEDULED_CODEX_GIT_USER_EMAIL` in `config.env`.
Inside the container, scheduled GitHub automation uses the injected `GH_TOKEN` directly: the runner rewrites GitHub SSH remotes to HTTPS for the duration of the run and runs `gh auth setup-git --hostname github.com --force` so `git fetch`, `git push`, and `gh pr create` can authenticate non-interactively without editing the Docker image.
On the host, the runner prunes old timestamped run artifacts from `.automation/scheduled-codex/logs` before each run. By default it keeps 2 days of `run-*.log`, `run-*-report.txt`, and `message-*.txt` files, and you can override that with `SCHEDULED_CODEX_LOG_RETENTION_DAYS` in `config.env`.

After each run, the host script writes:

- `.automation/scheduled-codex/logs/last-message.txt`: the `codex exec` output file
- `.automation/scheduled-codex/logs/last-run.log`: combined container stdout/stderr from the most recent run
- `.automation/scheduled-codex/logs/last-report.txt`: the most recent generated report

If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, the runner creates one Telegram forum topic per scheduled run, posts a start notification before Docker begins, and then posts the post-run report into that same topic after the run completes.

## Setup

1. Create the local config file:

```bash
cp .automation/scheduled-codex/config.env.example .automation/scheduled-codex/config.env
```

2. Authenticate GitHub CLI on the host:

```bash
gh auth login
```

3. Edit `.automation/scheduled-codex/config.env` and set `TAKOPI_PROJECT_ALIAS`.

   If you want the scheduler to commit with a GitHub-specific identity that differs from your host git config, also set:

```bash
SCHEDULED_CODEX_GIT_USER_NAME="Your Name"
SCHEDULED_CODEX_GIT_USER_EMAIL="123456+your-user@users.noreply.github.com"
```

   If you want Telegram delivery, also set:

```bash
TELEGRAM_BOT_TOKEN="123456:your-bot-token"
TELEGRAM_CHAT_ID="-1001234567890"
```

   The target chat must be a Telegram forum-enabled supergroup, and the bot must be an administrator with topic-management permission.

   If you want a different retention window for old timestamped run artifacts, also set:

```bash
SCHEDULED_CODEX_LOG_RETENTION_DAYS="2"
```

   Set `0` to disable pruning.

4. Review `.automation/scheduled-codex/prompt.md`. It is preloaded with the legacy controlled-doc audit prompt for this scheduled runner.

5. Seed the repo-local OAuth state from an already-authenticated host Codex home:

```bash
bash scripts/scheduled-codex/seed-auth-from-host.sh
```

If your authenticated Codex state lives somewhere other than `~/.codex`, override it:

```bash
CODEX_SOURCE_HOME=/path/to/existing/.codex \
  bash scripts/scheduled-codex/seed-auth-from-host.sh
```

6. Install the launch agent:

```bash
bash scripts/scheduled-codex/install-launch-agent.sh
```

7. Optional immediate run:

```bash
launchctl kickstart -k gui/$(id -u)/com.massun.scheduled-codex
```

## Notes

- The setup does not modify files outside this repository.
- The generated launch agent plist is stored under `.automation/scheduled-codex`.
- The supported auth setup is to copy an existing authenticated host Codex home into the repo-local `CODEX_HOME`.
- GitHub auth for scheduled runs is derived on the host at runtime from `gh auth token`; `config.env` no longer stores `GH_TOKEN`.
- launchd captures stdout/stderr separately from the container output file. Check `.automation/scheduled-codex` for logs.
- Telegram posting is optional, but if you set one Telegram variable you must set both.
- Telegram delivery creates one topic per run, posts the start notification before Docker begins, and posts the generated report into that same topic after the run completes.
- Git commit attribution is not derived from `GH_TOKEN`. Git writes author/committer metadata from `user.name` / `user.email` or the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables, and GitHub links commits to accounts by the commit email address.
