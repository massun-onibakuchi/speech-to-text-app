Goal (incl. success criteria):
- Build the v1 macOS speech-to-text app per `specs/ARCTECTURE.md`.
- Success criteria: architecture-conformant Electron app with durable queue, canonical terminal states, provider integrations, output matrix behavior, and required acceptance tests.

Constraints/Assumptions:
- Must follow architecture contracts in `specs/ARCTECTURE.md` and behavior constraints in `specs/v1-spec.md`.
- Keep core dependency pins exact for `electron`, `electron-vite`, `electron-builder`.
- Canonical terminal statuses are fixed: `succeeded`, `capture_failed`, `transcription_failed`, `transformation_failed`, `output_failed_partial`.

Key decisions:
- Work in small, status-tracked chunks using a 10-step implementation plan.
- Start from foundation and move sequentially through services and tests.

State:
- Done: cleared old context and re-read architecture spec.
- Now: maintain step-by-step implementation tracker before coding.
- Next: execute Step 1 (project scaffold).

Done:
- Re-read `specs/ARCTECTURE.md`.
- Produced granular implementation sequence mapped to architecture modules.

Now:
- Tracking plan and statuses for small chunks of work.

Next:
- Step 1: Baseline workspace and initialize Electron scaffold.

Open questions (UNCONFIRMED if needed):
- UNCONFIRMED: preferred package manager (`npm` or `pnpm`).
- UNCONFIRMED: confirm project root location (`/workspace` root vs subdirectory).

Working set (files/ids/commands):
- `/workspace/CONTINUITY.md`
- `/workspace/specs/ARCTECTURE.md`
- Tracker steps:
  1. [PENDING] Baseline workspace and initialize Electron+Vite+Builder scaffold with pinned versions.
  2. [PENDING] Define shared domain contracts (states, statuses, settings, allowlists).
  3. [PENDING] Implement app lifecycle and window/tray shell in main process.
  4. [PENDING] Implement secure preload bridge and typed IPC handlers.
  5. [PENDING] Implement CaptureService and FFmpeg runner lifecycle.
  6. [PENDING] Implement durable JobQueueService journal + replay.
  7. [PENDING] Implement STT adapters (Groq, ElevenLabs) with allowlist checks.
  8. [PENDING] Implement TransformationService (Gemini) and output matrix.
  9. [PENDING] Implement permissions, keychain store, and network diagnostics.
  10. [PENDING] Add required reliability tests and run typecheck/tests/build.
