<!--
Where: docs/decision/2026-03-14-scheduled-codex-docker-launchd-decision.md
What: Decision note for the macOS launchd + Docker wrapper around unattended `codex exec`.
Why: The scheduler setup needs a durable record for why OAuth state is seeded into a repo-local `CODEX_HOME`.
-->

# Decision: Run Scheduled Codex Exec Through macOS launchd And Docker

Date: 2026-03-14

## Context

The requested setup must:

- reuse the existing `.devcontainer/Dockerfile` if possible
- run on a macOS host without writing files outside the repository workspace
- execute `codex exec` automatically every 3 days
- pass the Codex prompt from a file
- make a GitHub CLI token available to commands in the container
- assume Codex OAuth authentication

## Decision

Use `launchd` on the macOS host to start a one-shot Docker container every `259200` seconds.

The container is built from the existing devcontainer Dockerfile and launched by
`scripts/scheduled-codex/run-container.sh`.
All mutable state stays inside the repository under `.automation/scheduled-codex`:

- `prompt.txt` stores the scheduled Codex prompt
- `config.env` stores host-provided environment such as `GH_TOKEN`
- `state/codex-home` stores the Codex OAuth refresh token and session data
- `logs/` stores launchd logs and the last Codex message

The launch agent plist is generated into the same repo-local directory and bootstrapped from there, so no file copy into `~/Library/LaunchAgents` is required.

## Authentication Rationale

Current local Codex CLI help exposes:

- `codex login --device-auth`
- `codex login --with-api-key`

There is no documented non-interactive OAuth token injection flow in the local CLI help.
That means fully unattended recurring runs are only realistic after valid OAuth state already exists in the mounted `CODEX_HOME`.

Because the host workspace is the only writable location allowed by this request, the setup stores `CODEX_HOME` in the repo-local schedule state directory and mounts that path into the container on every run.
The preferred bootstrap path is to copy an already-authenticated host Codex home into that repo-local directory once, then run unattended from the copied state. The interactive device-auth script remains available only as a fallback.

## Operational Shape

1. Seed repo-local Codex auth state from an existing authenticated host Codex home.
2. Keep host-provided secrets in `.automation/scheduled-codex/config.env`.
3. Let `launchd` call the host runner every three days.
4. Build from the existing `.devcontainer/Dockerfile`.
5. Run `codex exec` non-interactively with the prompt read from `.automation/scheduled-codex/prompt.txt`.

## Consequences

Positive:

- reuses the existing Docker image definition
- keeps scheduler state, prompt, and logs inside the repo
- avoids cron inside the container and relies on the native macOS scheduler
- supports autonomous recurring `codex exec` after the repo-local OAuth state has been seeded once

Trade-offs:

- zero-interaction setup depends on an already-authenticated host Codex home being available
- fallback first-time OAuth still requires an interactive device-auth step
- launch timing is based on `StartInterval`, so exact wall-clock cadence can shift after sleeps/restarts
- scheduled runs rebuild the image before execution, which favors correctness over startup speed
