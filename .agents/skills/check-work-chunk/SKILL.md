---
name: check-work-chunk
description: Verify whether a numbered chunk of work in a spec/todo file has been implemented by consulting Codex, Gemini CLI, and Claude Code non-interactively (YOLO / dangerously skip permissions) without editing any code.
metadata:
  short-description: Triangulate “is this chunk done?” via Codex + Gemini + Claude (no code edits)
---

# check-work-chunk

Use this skill when you want an evidence-based answer to: **“Is chunk N from FILE implemented correctly?”**

This skill runs **three independent verification passes** using:
- Codex CLI
- Gemini CLI
- Claude Code CLI

…and then summarizes the results for you.

## Hard rules (apply to Codex and all sub-agents)

- **Do NOT edit any code or files.** No patches, no commits, no formatting-only changes.
- You **may** run scripts/tests/linters if needed to validate behavior.
- Prefer commands that are safe and reversible (tests, greps, read-only inspection).

## What to do when this skill is invoked

1. Get the inputs:
   - `file`: path to the work/spec file (e.g., `PLAN.md`, `TODO.md`)
   - `chunk`: the chunk number (e.g., `3`)
2. Run the helper script (script-backed part of this skill):

```bash
uv run .codex/skills/check-work-chunk/scripts/verify_work_chunk.py --file <FILE> --chunk <N>
```

3. Summarize the script output:
   - Overall verdict (PASS/FAIL/UNCLEAR)
   - Per-agent verdicts + confidence
   - Evidence (tests run, files checked)
   - Any disagreements and next steps to resolve

## Notes on autonomy / permissions

This skill uses each agent’s “auto-approve / skip permission prompts” option so it can run without interactive approvals:
- Codex: `--dangerously-bypass-approvals-and-sandbox` with `exec`
- Gemini CLI: `--approval-mode=yolo` (or fallback `--yolo`)
- Claude Code: `--dangerously-skip-permissions`

Because those modes are powerful, the prompts explicitly forbid file edits.

If you want additional safety, run in a sandbox/container.

## Example invocation

User: “Use check-work-chunk to check chunk 4 in PLAN.md.”

Codex should run:

```bash
uv run .codex/skills/check-work-chunk/scripts/verify_work_chunk.py --file PLAN.md --chunk 4
```

Then summarize the results.
