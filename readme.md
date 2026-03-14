# Dicta

Electron-based macOS utility that captures speech, transcribes via STT providers (Groq, ElevenLabs), optionally transforms with an LLM (Google Gemini), and outputs to clipboard/paste.

## Prerequisites

- Node.js 22+
- pnpm 10+ (enforced — npm/yarn are blocked)
- macOS 15+ (runtime target)

## Initial Setup

```sh
gh auth login
 ```

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

For the current local development commands, see the `scripts` section in [`package.json`](package.json).

## Testing

For the current test and verification commands, see the `scripts` section in [`package.json`](package.json).

Vitest excludes `.worktrees` and `.pnpm-store` from test discovery to avoid running tests from external worktrees or cached stores.

## CI E2E Strategy

- Default CI e2e runs on macOS to match the runtime support target.
- macOS e2e on pull request/push is intentionally minimized to smoke checks.
- Workflow concurrency cancels redundant in-progress runs on the same ref.
- Dependency install uses pnpm cache via `actions/setup-node`.

## GitHub Pages Deploys

- `.github/workflows/github-pages.yml` deploys on `main` only when the Pages site inputs change.
- The tracked inputs are `site/index.html`, `site/public/**`, `site/src/**`, `site/vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, the two shared icon assets the site imports, and the workflow file itself.
- Manual deploy remains available through `workflow_dispatch`.

Manual run options (`.github/workflows/e2e-playwright-electron.yml`):

- `run_macos=true` runs macOS smoke e2e tests (`@macos`) for manual dispatch.
- `run_live_provider_checks=true` additionally runs live provider tests (`@live-provider`).

Available CI secrets used by e2e workflows:

- `GOOGLE_APIKEY`
- `ELEVENLABS_APIKEY`
- `GROQ_APIKEY`

## Distribution

For packaging and release-related commands, see the `scripts` section in [`package.json`](package.json) and the release process in [`docs/release-checklist.md`](docs/release-checklist.md).

- GitHub Releases now ship direct-download `.dmg` and `.zip` assets.
- The app does not use GitHub-hosted auto-update metadata.
- Releases are unsigned, so macOS Gatekeeper warnings are expected.
- Renderer and site typography intentionally use `@fontsource` `latin` and `latin-ext` subsets to keep shipped font assets smaller.
- See [docs/release-checklist.md](docs/release-checklist.md) for the release workflow inputs/secrets.

## Architecture

See [specs/spec.md](specs/spec.md) for the full normative specification
