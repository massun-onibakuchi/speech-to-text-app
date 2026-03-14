// Where: scripts/scheduled-codex/render-launch-agent.test.ts
// What: Verifies the generated launchd plist keeps the expected schedule and host runner wiring.
// Why: the scheduler setup is infrastructure code, so the key launchd contract should stay under test.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAUNCH_AGENT_LABEL,
  THREE_DAY_INTERVAL_SECONDS,
  renderLaunchAgentPlist,
} from "./render-launch-agent.mjs";

describe("renderLaunchAgentPlist", () => {
  it("renders the three-day launch agent contract", () => {
    const plist = renderLaunchAgentPlist({
      programArguments: ["/bin/bash", "/tmp/run-container.sh"],
      workingDirectory: "/workspace/repo",
      standardOutPath: "/workspace/repo/.automation/scheduled-codex/logs/stdout.log",
      standardErrorPath:
        "/workspace/repo/.automation/scheduled-codex/logs/stderr.log",
    });

    expect(plist).toContain(`<key>Label</key>\n  <string>${DEFAULT_LAUNCH_AGENT_LABEL}</string>`);
    expect(plist).toContain(
      `<key>StartInterval</key>\n  <integer>${THREE_DAY_INTERVAL_SECONDS}</integer>`,
    );
    expect(plist).toContain("<string>/bin/bash</string>");
    expect(plist).toContain("<string>/tmp/run-container.sh</string>");
    expect(plist).toContain("<key>EnvironmentVariables</key>");
  });

  it("rejects an empty program argument list", () => {
    expect(() =>
      renderLaunchAgentPlist({
        programArguments: [],
        workingDirectory: "/workspace/repo",
        standardOutPath: "/tmp/stdout.log",
        standardErrorPath: "/tmp/stderr.log",
      }),
    ).toThrow("programArguments must contain at least one entry");
  });
});
