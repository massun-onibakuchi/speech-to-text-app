#!/usr/bin/env python
"""
Check whether a numbered "chunk" of work in a file has been implemented.

Notes:
- This script intentionally does NOT parse/extract the chunk text; it leaves chunk identification to the agent(s).
- Agents are instructed: DO NOT edit code. They MAY read files and run scripts/tests.

Updates:
- Gemini CLI: avoid deprecated --prompt/-p; pass prompt as positional argument.
- Stream each agent's output to stdout while also writing a transcript file.
- Report how long each agent took.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def _timestamp() -> str:
    return _dt.datetime.now().strftime("%Y%m%d-%H%M%S")


_VERDICT_RE = re.compile(r"\bVERDICT\s*:\s*(PASS|FAIL|UNCLEAR)\b", re.IGNORECASE)


def _parse_verdict(text_out: str) -> str:
    m = _VERDICT_RE.search(text_out or "")
    if not m:
        return "UNCLEAR"
    return m.group(1).upper()


def _overall(verdicts: dict[str, str]) -> str:
    vals = [v for v in verdicts.values() if v]
    if not vals:
        return "UNCLEAR"
    if any(v == "FAIL" for v in vals):
        return "FAIL"
    if all(v == "PASS" for v in vals):
        return "PASS"
    return "UNCLEAR"


def build_prompt(file_path: str, chunk: int) -> str:
    return f"""You are an automated code reviewer.

Task: determine whether chunk #{chunk} described in {file_path} has been implemented correctly in this repository.

Rules:
- DO NOT edit any code, do not apply patches, do not write files, do not commit.
- You MAY read files and run scripts/tests/linters to verify.
- Locate the exact section for chunk #{chunk} inside {file_path} yourself (e.g., using search/grep) and restate it briefly (1-3 sentences) before evaluating.
- Be strict: if requirements are ambiguous or partially implemented, say UNCLEAR or FAIL.
- Report with the exact format:

VERDICT: PASS|FAIL|UNCLEAR
CONFIDENCE: 0-100
EVIDENCE:
- bullet points referencing specific files/functions/lines (or test outputs)
GAPS:
- bullet points of what's missing/incorrect (if any)
COMMANDS_RUN:
- bullet list (or 'none')
"""


def _stream_process_output(
    label: str,
    proc: subprocess.Popen[str],
    out_fh,
    buffer: list[str],
) -> None:
    assert proc.stdout is not None
    for line in proc.stdout:
        # Stream to user
        sys.stdout.write(line)
        sys.stdout.flush()
        # Persist transcript
        out_fh.write(line)
        out_fh.flush()
        buffer.append(line)


def run_streaming(
    label: str,
    cmd: list[str],
    out_path: Path,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout_s: float | None = None,
) -> tuple[int, str, float]:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    start = time.monotonic()
    print(f"\n===== {label} =====", flush=True)
    print(f"$ {shlex.join(cmd)}\n", flush=True)

    buffer: list[str] = []
    with out_path.open("w", encoding="utf-8", errors="replace") as fh:
        fh.write(f"$ {shlex.join(cmd)}\n\n")
        fh.flush()

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,  # line-buffered (best-effort)
                cwd=str(cwd) if cwd else None,
                env=env,
            )
        except FileNotFoundError:
            msg = f"{label}: command not found: {cmd[0]}\n"
            fh.write(msg)
            fh.flush()
            return 127, msg, 0.0

        t = threading.Thread(
            target=_stream_process_output, args=(label, proc, fh, buffer), daemon=True
        )
        t.start()

        try:
            rc = proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            fh.write(f"\n[{label}] TIMEOUT after {timeout_s}s; terminating.\n")
            fh.flush()
            try:
                proc.terminate()
                rc = proc.wait(timeout=10)
            except Exception:
                proc.kill()
                rc = proc.wait()
        finally:
            # Ensure reader thread finishes
            try:
                if proc.stdout:
                    proc.stdout.close()
            except Exception:
                pass
            t.join(timeout=5)

    dur_s = time.monotonic() - start
    print(f"\n----- {label} finished (rc={rc}) in {dur_s:.2f}s -----\n", flush=True)
    return rc, "".join(buffer), dur_s


def _gemini_cmd(gemini: str, prompt: str) -> list[list[str]]:
    """
    Prefer positional prompt (avoids deprecated --prompt/-p).
    Try --approval-mode yolo first; fallback to --yolo for older CLIs.

    We keep both attempts because gemini-cli versions vary in flag support.
    """
    return [
        [gemini, "--approval-mode", "yolo", prompt],
        [gemini, "--yolo", prompt],
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--file",
        required=True,
        help="Path to the plan/todo/spec file containing numbered chunks",
    )
    ap.add_argument("--chunk", required=True, type=int, help="Chunk number to verify")
    ap.add_argument(
        "--outdir",
        default=str(Path(".codex") / "skill-runs" / "check-work-chunk"),
        help="Directory to write transcripts",
    )
    ap.add_argument(
        "--timeout-s",
        type=float,
        default=1800.0,
        help="Per-agent timeout in seconds (default: 1800). Use 0 to disable.",
    )
    args = ap.parse_args()

    file_path = args.file
    chunk = args.chunk
    timeout_s: float | None = None if args.timeout_s == 0 else args.timeout_s

    if not Path(file_path).exists():
        print(f"error: file not found: {file_path}", file=sys.stderr)
        return 2

    prompt = build_prompt(file_path=file_path, chunk=chunk)

    ts = _timestamp()
    run_dir = Path(args.outdir) / f"{ts}-chunk{chunk}"
    run_dir.mkdir(parents=True, exist_ok=True)

    verdicts: dict[str, str] = {}
    durations: dict[str, float] = {}
    rcs: dict[str, int] = {}

    # CODEX
    codex = _which("codex")
    if codex:
        cmd = [
            codex,
            "--disable",
            "skills",
            "--dangerously-bypass-approvals-and-sandbox",
            "exec",
            prompt,
        ]
        rc, out, dur = run_streaming(
            "codex", cmd, run_dir / "codex.txt", timeout_s=timeout_s
        )
        rcs["codex"] = rc
        durations["codex"] = dur
        verdicts["codex"] = _parse_verdict(out) if rc == 0 else "UNCLEAR"
    else:
        (run_dir / "codex.txt").write_text(
            "codex: not found on PATH\n", encoding="utf-8"
        )
        rcs["codex"] = 127
        durations["codex"] = 0.0
        verdicts["codex"] = "UNCLEAR"

    # GEMINI
    gemini = _which("gemini")
    if gemini:
        gemini_out = ""
        gemini_rc = 1
        gemini_dur = 0.0

        for attempt_i, cmd in enumerate(_gemini_cmd(gemini, prompt), start=1):
            out_path = run_dir / "gemini.txt"
            if attempt_i > 1:
                # Separate attempts visually in transcript
                with out_path.open("a", encoding="utf-8") as fh:
                    fh.write("\n\n===== RETRY (fallback flags) =====\n\n")

            rc, out, dur = run_streaming("gemini", cmd, out_path, timeout_s=timeout_s)
            gemini_rc, gemini_out, gemini_dur = rc, out, dur

            # If success, stop. If failure looks like "unknown option", try fallback.
            if rc == 0:
                break
            lower = (out or "").lower()
            if (
                "unknown argument" in lower
                or "unknown arguments" in lower
                or "unknown option" in lower
            ):
                continue
            # Otherwise, don't spam retries.
            break

        rcs["gemini"] = gemini_rc
        durations["gemini"] = gemini_dur
        verdicts["gemini"] = _parse_verdict(gemini_out) if gemini_rc == 0 else "UNCLEAR"
    else:
        (run_dir / "gemini.txt").write_text(
            "gemini: not found on PATH\n", encoding="utf-8"
        )
        rcs["gemini"] = 127
        durations["gemini"] = 0.0
        verdicts["gemini"] = "UNCLEAR"

    # CLAUDE
    claude = _which("claude")
    if claude:
        cmd = [
            claude,
            "-p",
            prompt,
            "--dangerously-skip-permissions",
            "--tools",
            "Bash,Read",
        ]
        rc, out, dur = run_streaming(
            "claude", cmd, run_dir / "claude.txt", timeout_s=timeout_s
        )
        rcs["claude"] = rc
        durations["claude"] = dur
        verdicts["claude"] = _parse_verdict(out) if rc == 0 else "UNCLEAR"
    else:
        (run_dir / "claude.txt").write_text(
            "claude: not found on PATH\n", encoding="utf-8"
        )
        rcs["claude"] = 127
        durations["claude"] = 0.0
        verdicts["claude"] = "UNCLEAR"

    overall = _overall(verdicts)

    print("===== SUMMARY =====")
    print(f"OVERALL: {overall}")
    for name in ("codex", "gemini", "claude"):
        print(
            f"- {name}: {verdicts.get(name, 'UNCLEAR')}  rc={rcs.get(name, 0)}  time={durations.get(name, 0.0):.2f}s"
        )
    print(f"transcripts: {run_dir}")

    # Exit code: PASS=0, FAIL=1, UNCLEAR=3
    if overall == "PASS":
        return 0
    if overall == "FAIL":
        return 1
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
