// Where: scripts/scheduled-codex/run-container.test.ts
// What: Verifies the scheduled runner resolves and validates the git identity it forwards into Docker.
// Why: commit attribution must stay explicit and stable instead of depending on container-local git defaults.

import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.join(workspaceRoot, "scripts", "scheduled-codex", "run-container.sh");

describe("run-container.sh", () => {
  it("uses the explicit scheduler git identity during dry runs", () => {
    const result = spawnSync("bash", [scriptPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        SCHEDULED_CODEX_DRY_RUN: "1",
        GH_TOKEN: "test-token",
        SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
        SCHEDULED_CODEX_GIT_USER_EMAIL: "scheduler@example.com",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("GH token configured: yes");
    expect(result.stdout).toContain(
      "scheduled git identity: Scheduler Bot <scheduler@example.com>",
    );
  });

  it("rejects partial scheduler identity overrides", () => {
    const result = spawnSync("bash", [scriptPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        SCHEDULED_CODEX_DRY_RUN: "1",
        GH_TOKEN: "test-token",
        SCHEDULED_CODEX_GIT_USER_NAME: "Scheduler Bot",
        SCHEDULED_CODEX_GIT_USER_EMAIL: "",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "scheduled git identity is incomplete: set SCHEDULED_CODEX_GIT_USER_EMAIL alongside SCHEDULED_CODEX_GIT_USER_NAME",
    );
  });
});
