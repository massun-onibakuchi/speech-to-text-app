# Implementation Plan

Status legend: `PENDING` | `IN_PROGRESS` | `DONE`

1. `IN_PROGRESS` Baseline workspace and initialize Electron+Vite+Builder scaffold with pinned versions.
2. `PENDING` Define shared domain contracts (states, statuses, settings, allowlists).
3. `PENDING` Implement app lifecycle and window/tray shell in main process.
4. `PENDING` Implement secure preload bridge and typed IPC handlers.
5. `PENDING` Implement CaptureService and FFmpeg runner lifecycle.
6. `PENDING` Implement durable JobQueueService journal + replay.
7. `PENDING` Implement STT adapters (Groq, ElevenLabs) with allowlist checks.
8. `PENDING` Implement TransformationService (Gemini) and output matrix.
9. `PENDING` Implement permissions, keychain store, and network diagnostics.
10. `PENDING` Add required reliability tests and run typecheck/tests/build.

## Current Focus
- Create TypeScript Electron project structure (`main`, `preload`, `renderer`).
- Pin core dependencies: `electron@38.0.0`, `electron-vite@4.0.0`, `electron-builder@26.0.12`.
- Ensure scripts exist for dev/build/package/test.
