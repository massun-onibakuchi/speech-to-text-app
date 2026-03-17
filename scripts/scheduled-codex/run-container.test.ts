// Where: scripts/scheduled-codex/run-container.test.ts
// What: Verifies the scheduled runner validates dry-run configuration before Docker execution.
// Why: launchd automation should fail early on host misconfiguration and expose the reporting contract clearly.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptRelativePath = path.join("scripts", "scheduled-codex", "run-container.sh");
const scriptPath = path.join(workspaceRoot, scriptRelativePath);

const createFakeGhBin = (token = "test-token") => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "scheduled-codex-gh-"));
  const ghPath = path.join(binDir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "auth" && "\${2:-}" == "token" ]]; then
  printf '%s\\n' "${token}"
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
    { encoding: "utf8", mode: 0o755 },
  );
  return binDir;
};

const createIsolatedWorkspace = () => {
  const isolatedRoot = mkdtempSync(path.join(os.tmpdir(), "scheduled-codex-workspace-"));
  const isolatedScriptDir = path.join(isolatedRoot, "scripts", "scheduled-codex");
  const isolatedAutomationDir = path.join(isolatedRoot, ".automation", "scheduled-codex");

  mkdirSync(isolatedScriptDir, { recursive: true });
  mkdirSync(isolatedAutomationDir, { recursive: true });
  copyFileSync(scriptPath, path.join(isolatedRoot, scriptRelativePath));
  writeFileSync(path.join(isolatedAutomationDir, "prompt.md"), "Test prompt\n", "utf8");

  return isolatedRoot;
};

const spawnDryRun = (env: NodeJS.ProcessEnv, ghToken = "test-token") => {
  const isolatedWorkspaceRoot = createIsolatedWorkspace();

  return spawnSync("bash", [path.join(isolatedWorkspaceRoot, scriptRelativePath)], {
    cwd: isolatedWorkspaceRoot,
    env: {
      ...process.env,
      SCHEDULED_CODEX_DRY_RUN: "1",
      PATH: `${createFakeGhBin(ghToken)}${path.delimiter}${process.env.PATH ?? ""}`,
      ...env,
    },
    encoding: "utf8",
  });
};

describe("run-container.sh", () => {
  it("uses the explicit scheduler git identity during dry runs", () => {
    const result = spawnDryRun({
      SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
      SCHEDULED_CODEX_GIT_USER_EMAIL: "scheduler@example.com",
      TAKOPI_PROJECT_ALIAS: "takopi-daily",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "123456",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("GH token configured: yes");
    expect(result.stdout).toContain("project alias: takopi-daily");
    expect(result.stdout).toContain(
      "scheduled git identity: Scheduler Bot <scheduler@example.com>",
    );
    expect(result.stdout).toContain("log retention (days): 2");
    expect(result.stdout).toContain("Telegram configured: yes");
    expect(result.stdout).toContain("Telegram topic title: takopi-daily");
    expect(result.stdout).toContain(" run ");
    expect(result.stdout).not.toContain("post-run");
    expect(result.stdout).not.toContain("start");
  });

  it("rejects partial scheduler identity overrides", () => {
    const result = spawnDryRun({
      SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
      SCHEDULED_CODEX_GIT_USER_EMAIL: "",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "scheduled git identity is incomplete: set SCHEDULED_CODEX_GIT_USER_EMAIL alongside SCHEDULED_CODEX_GIT_USER_NAME",
    );
  });

  it("rejects partial Telegram configuration", () => {
    const result = spawnDryRun({
      SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
      SCHEDULED_CODEX_GIT_USER_EMAIL: "scheduler@example.com",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "telegram configuration is incomplete: set TELEGRAM_CHAT_ID alongside TELEGRAM_BOT_TOKEN",
    );
  });

  it("rejects an invalid log retention value", () => {
    const result = spawnDryRun({
      SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
      SCHEDULED_CODEX_GIT_USER_EMAIL: "scheduler@example.com",
      SCHEDULED_CODEX_LOG_RETENTION_DAYS: "seven",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "invalid SCHEDULED_CODEX_LOG_RETENTION_DAYS: expected a non-negative integer, got 'seven'",
    );
  });

  it("fails when host gh auth cannot provide a token", () => {
    const result = spawnDryRun(
      {
        SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
        SCHEDULED_CODEX_GIT_USER_EMAIL: "scheduler@example.com",
      },
      "",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "missing GitHub auth token: run 'gh auth login' on the host; the scheduler derives GitHub auth at runtime via 'gh auth token'",
    );
  });
});
