# Ticket Plan

Status legend: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`
Priority legend: `P0` (critical), `P1` (high), `P2` (normal)

## Epic A: Paste Automation Hardening
- `A-01` `P0` `DONE` Choose paste backend (`AppleScript` vs `CGEvent`) and document tradeoffs.
  - Output: ADR note in repo.
  - Depends on: none.
- `A-02` `P0` `DONE` Implement production paste backend in `src/main/infrastructure/paste-automation-client.ts`.
  - Output: real paste-at-cursor behavior.
  - Depends on: `A-01`.
- `A-03` `P0` `DONE` Add accessibility permission preflight + actionable error mapping.
  - Output: reliable `output_failed_partial` behavior with guidance.
  - Depends on: `A-02`.
- `A-04` `P1` `DONE` Add integration tests for paste success/failure/permission-denied flows.
  - Output: automated coverage for paste matrix paths.
  - Depends on: `A-03`.

## Epic B: FFmpeg Device Strategy
- `B-01` `P0` `DONE` Implement device discovery and selection strategy for macOS (`avfoundation`).
  - Output: deterministic input source selection.
  - Depends on: none.
- `B-02` `P0` `DONE` Add fallback behavior when configured device is missing/unavailable.
  - Output: no silent capture failure.
  - Depends on: `B-01`.
- `B-03` `P1` `DONE` Add tests for device selection + fallback paths.
  - Output: regression protection for capture startup.
  - Depends on: `B-02`.

## Epic C: Provider Contract Smoke in CI
- `C-01` `P0` `DONE` Add CI job skeleton for provider contract smoke checks.
  - Output: workflow file and command entrypoint.
  - Depends on: none.
- `C-02` `P0` `DONE` Implement smoke command that validates endpoint/auth/model surfaces against manifest.
  - Output: executable check with pass/fail exit codes.
  - Depends on: `C-01`.
- `C-03` `P1` `DONE` Wire secure secrets usage for live checks (Groq/ElevenLabs/Gemini).
  - Output: documented secret names and safe failure behavior.
  - Depends on: `C-02`.

## Epic D: Release Readiness
- `D-01` `P1` `DONE` Add packaging/signing/notarization placeholders in build docs and scripts.
  - Output: release checklist draft.
  - Depends on: none.
- `D-02` `P1` `DONE` Add end-to-end dry run checklist (`typecheck`, `test`, `build`, `dist`).
  - Output: reproducible release dry run.
  - Depends on: `D-01`.

## Completed Foundation (Reference)
- `F-01`..`F-10` `DONE` Initial architecture scaffold, queue durability, providers, transformation, output matrix, diagnostics, and baseline tests.

## Current Chunk
- Hardening tickets complete. Next phase can be release execution on macOS signer/notarization environment.
