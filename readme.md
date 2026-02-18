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
Profile/settings updates apply to subsequent requests only; already-enqueued requests keep their bound snapshot.

## Home UI (Phase 5A)

- Top-level navigation is limited to `Home` and `Settings`; app launches on `Home`.
- Home keeps only operational cards (Recording Controls, Transform Shortcut, Shortcut Contract).
- Recording status badge supports `Idle`, `Recording`, `Busy`, and `Error`.
- Recording and transform cards show blocked reasons and provide direct Settings navigation when prerequisites are missing.
- Legacy history/timeline/output-matrix renderer paths are removed from active Home UI code.

## Settings UI (Phase 5B)

- Provider API key fields include save/test flows and per-provider mask toggles.
- Transformation configuration supports add/remove/edit, active/default selection, and prompt persistence.
- Settings include shortcut editors, recording/audio source controls, and output copy/paste toggles.
- STT + LLM `baseUrlOverride` fields support optional URL input, inline validation feedback, and reset-to-default controls.

Phase 4 adds provider contract hardening:
- STT and LLM requests can use per-provider `baseUrlOverride` values from settings.
- Gemini uses explicit model endpoints (`/v1beta/models/{model}:generateContent`) with no silent model fallback.
- Unsupported provider/model pairs are rejected in preflight before any network call.

See [specs/spec.md](specs/spec.md) for the full normative specification and [docs/refactor-baseline-plan.md](docs/refactor-baseline-plan.md) for the phased implementation plan.
