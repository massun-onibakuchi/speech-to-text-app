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
- STT and LLM requests can use per-provider `baseUrlOverride` values from settings.
- Gemini uses explicit model endpoints (`/v1beta/models/{model}:generateContent`) with no silent model fallback.
- Unsupported provider/model pairs are rejected in preflight before any network call.

## Home UI (Phase 5A)

- Top-level navigation is limited to `Home` and `Settings`; app launches on `Home`.
- Home keeps only operational cards (Recording Controls, Transform Shortcut).
- Shortcut Contract reference is available on Settings.
- Recording status badge supports `Idle`, `Recording`, `Busy`, and `Error`.
- Recording and transform cards show blocked reasons and provide direct Settings navigation when prerequisites are missing.
- Legacy history/timeline/output-matrix renderer paths are removed from active Home UI code.

## Settings UI (Phase 5B)

- Provider API key fields include save/test flows and per-provider mask toggles.
- Transformation configuration supports add/remove/edit, active/default selection, and prompt persistence.
- Settings include shortcut editors, recording/audio source controls, and output copy/paste toggles.
- STT + LLM `baseUrlOverride` fields support optional URL input, inline validation feedback, and reset-to-default controls.

## Cross-Cutting UI Behavior (Phase 5C)

- Home action controls now disable when prerequisites are missing and always show explicit `reason` plus `next step`.
- Blocked cards provide direct Settings deep-links when remediation is configuration-related.
- Toast coverage includes recording command outcomes (`start`, `stop`, `cancel`), transform completion outcomes, and validation/API failures.

## Hardening (Phase 6)

- Main process now has a concrete `SoundService` implementation backed by Electron system beeps.
- Recording start/stop/cancel and transformation completion outcomes are wired to sound events.
- Audio source discovery now attempts real macOS input-device enumeration and falls back safely to `System Default` when unavailable.
- Failure feedback now maps `preflight`, `api_auth`, and `network` categories to actionable next-step guidance in the renderer.

See [specs/spec.md](specs/spec.md) for the full normative specification and [docs/p0-p1-p2-react-execution-plan.md](docs/p0-p1-p2-react-execution-plan.md) for the phased implementation plan.
