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

See [specs/spec.md](specs/spec.md) for the full normative specification and [docs/refactor-baseline-plan.md](docs/refactor-baseline-plan.md) for the phased implementation plan.
