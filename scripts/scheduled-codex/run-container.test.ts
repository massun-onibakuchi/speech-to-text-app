// Where: scripts/scheduled-codex/run-container.test.ts
// What: Verifies the scheduled runner validates dry-run configuration before Docker execution.
// Why: launchd automation should fail early on host misconfiguration and expose the reporting contract clearly.

import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.join(workspaceRoot, "scripts", "scheduled-codex", "run-container.sh");

const spawnDryRun = (env: NodeJS.ProcessEnv) =>
  spawnSync("bash", [scriptPath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      SCHEDULED_CODEX_DRY_RUN: "1",
      GH_TOKEN: "test-token",
      ...env,
    },
    encoding: "utf8",
  });

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
    expect(result.stdout).toContain("Telegram configured: yes");
    expect(result.stdout).toContain("Telegram topic title: takopi-daily");
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
});
