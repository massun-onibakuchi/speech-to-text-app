#!/usr/bin/env node
// Where: scripts/scheduled-codex/render-launch-agent.mjs
// What: Renders the launchd plist used to schedule the host-side Docker runner.
// Why: Keeping plist generation in one place makes the schedule explicit and testable.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const THREE_DAY_INTERVAL_SECONDS = 3 * 24 * 60 * 60;
export const DEFAULT_LAUNCH_AGENT_LABEL = "com.massun.scheduled-codex";

const DEFAULT_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const xmlEscape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function renderLaunchAgentPlist({
  label = DEFAULT_LAUNCH_AGENT_LABEL,
  programArguments,
  workingDirectory,
  standardOutPath,
  standardErrorPath,
  startInterval = THREE_DAY_INTERVAL_SECONDS,
  pathEnv = DEFAULT_PATH,
}) {
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new Error("label must be a non-empty string");
  }

  if (!Array.isArray(programArguments) || programArguments.length === 0) {
    throw new Error("programArguments must contain at least one entry");
  }

  if (!Number.isInteger(startInterval) || startInterval <= 0) {
    throw new Error("startInterval must be a positive integer");
  }

  const keys = [
    ["Label", label],
    [
      "ProgramArguments",
      `<array>\n${programArguments
        .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
        .join("\n")}\n  </array>`,
    ],
    ["WorkingDirectory", workingDirectory],
    ["StartInterval", `<integer>${startInterval}</integer>`],
    ["StandardOutPath", standardOutPath],
    ["StandardErrorPath", standardErrorPath],
    [
      "EnvironmentVariables",
      `<dict>\n    <key>PATH</key>\n    <string>${xmlEscape(pathEnv)}</string>\n  </dict>`,
    ],
  ];

  const body = keys
    .map(([key, value]) => {
      const renderedValue =
        typeof value === "string" && !value.startsWith("<")
          ? `<string>${xmlEscape(value)}</string>`
          : value;
      return `  <key>${key}</key>\n  ${renderedValue}`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

function resolveWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function main() {
  const workspaceRoot = resolveWorkspaceRoot();
  const scheduleRoot = path.join(workspaceRoot, ".automation", "scheduled-codex");
  const logsRoot = path.join(scheduleRoot, "logs");
  const runnerPath = path.join(
    workspaceRoot,
    "scripts",
    "scheduled-codex",
    "run-container.sh",
  );

  process.stdout.write(
    renderLaunchAgentPlist({
      programArguments: ["/bin/bash", runnerPath],
      workingDirectory: workspaceRoot,
      standardOutPath: path.join(logsRoot, "launchd.stdout.log"),
      standardErrorPath: path.join(logsRoot, "launchd.stderr.log"),
    }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
