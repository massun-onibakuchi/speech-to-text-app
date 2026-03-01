# Speech-to-Text v1

Electron-based macOS utility that captures speech, transcribes via STT providers (Groq, ElevenLabs), optionally transforms with an LLM (Google Gemini), and outputs to clipboard/paste.

## Prerequisites

- Node.js 22+
- pnpm 10+ (enforced — npm/yarn are blocked)
- macOS 15+ (runtime target)

## Setup

```sh
pnpm install
```

## Development

```sh
pnpm dev          # launch electron-vite dev server
pnpm build        # production build
pnpm typecheck    # type-check without emitting
```

## Testing

```sh
pnpm test              # unit tests (vitest)
pnpm test:coverage     # unit tests with coverage
pnpm test:e2e          # end-to-end tests (playwright)
```

Vitest excludes `.worktrees` and `.pnpm-store` from test discovery to avoid running tests from external worktrees or cached stores.

## CI E2E Strategy

- Default CI e2e runs on macOS to match the runtime support target.
- macOS e2e on pull request/push is intentionally minimized to smoke checks.
- Workflow concurrency cancels redundant in-progress runs on the same ref.
- Dependency install uses pnpm cache via `actions/setup-node`.

Manual run options (`.github/workflows/e2e-playwright-electron.yml`):

- `run_macos=true` runs macOS smoke e2e tests (`@macos`) for manual dispatch.
- `run_live_provider_checks=true` additionally runs live provider tests (`@live-provider`).

Available CI secrets used by e2e workflows:

- `GOOGLE_APIKEY`
- `ELEVENLABS_APIKEY`

## Distribution

```sh
pnpm dist:mac     # build + package dmg/zip for macOS
```

## Project Structure

```
src/
  main/              # Electron main process
    core/            # CommandRouter (IPC -> pipeline entrypoint)
    coordination/    # OrderedOutputCoordinator, ClipboardStatePolicy
    infrastructure/  # ClipboardClient, PasteAutomationClient, SafeStorageClient
    ipc/             # IPC handler registration (composition root)
    orchestrators/   # RecordingOrchestrator, ProcessingOrchestrator
    queues/          # CaptureQueue, TransformQueue (FIFO lanes)
    routing/         # ModeRouter, ExecutionContext, request snapshots
    services/        # SettingsService, SecretStore, SoundService,
                     # TranscriptionService, TransformationService, etc.
    test-support/    # Factories, harnesses, fixtures for tests
  preload/           # contextBridge IPC binding
  renderer/          # UI components
  shared/
    domain.ts        # Settings schema (valibot), types, defaults
    ipc.ts           # IpcApi interface, IPC channel constants
specs/               # Normative spec, user flows, tech options
docs/                # Refactor plan, release checklist
```

## Architecture

Commands flow from renderer -> IPC -> `CommandRouter` -> queue-based pipeline:

- **Capture path**: `CaptureQueue` (FIFO) -> Transcription -> optional Transformation -> `OrderedOutputCoordinator` -> Output
- **Transform shortcut path**: `TransformQueue` -> Transformation -> Output

Immutable snapshots (`CaptureRequestSnapshot`, `TransformationRequestSnapshot`) are frozen at enqueue time so in-flight jobs are isolated from concurrent settings changes.
Profile/settings updates apply to subsequent requests only; already-enqueued requests keep their bound snapshot.

Phase 4 adds provider contract hardening:

- STT and LLM requests use provider defaults only (base URL override fields were removed in #248).
- Gemini uses explicit model endpoints (`/v1beta/models/{model}:generateContent`) with no silent model fallback.
- Unsupported provider/model pairs are rejected in preflight before any network call.

See [specs/spec.md](specs/spec.md) for the full normative specification
