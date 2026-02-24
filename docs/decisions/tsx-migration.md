<!--
Where: docs/decisions/tsx-migration.md
What: Decision record for the project-wide migration of renderer components from .ts (React.createElement) to .tsx (JSX syntax), plus related architectural clean-up.
Why: Enables JSX syntax across all renderer components, reducing verbosity and aligning with standard React conventions.
-->

# Decision Record: Project-Wide TSX Migration

## Context

All renderer React components were originally written in `.ts` files using verbose `React.createElement` calls. This was a pragmatic starting point, but as the component count grew it became harder to read and maintain.

Additionally, the codebase carried two legacy patterns that were removed alongside the syntax migration:
- `src/renderer/legacy-renderer.ts` — a compatibility shim that re-exported `startLegacyRenderer` as an alias for `startRendererApp`. `src/renderer/main.ts` was already the only renderer boot path, so the shim was dead code.
- A global `document.addEventListener('keydown', ...)` listener that handled Enter-to-save for settings forms — this was moved into a React-owned `onKeyDown` handler scoped to the settings container.

## Decision

Migrate all renderer React components and their test files from `.ts` to `.tsx`, enabling JSX syntax. Wire the required toolchain changes to support TSX throughout the build and test pipeline. Concurrently, remove the legacy-renderer compatibility shim and move Enter-to-save into React event ownership.

### Toolchain changes
- `tsconfig.json`: set `jsx: "react-jsx"` (automatic React 17+ JSX transform — no `import React` needed).
- `electron.vite.config.ts`: add `@vitejs/plugin-react` to the renderer pipeline.
- `vitest.config.ts`: add `@vitejs/plugin-react` so test runs handle `.tsx` files. Extend test exclude glob to cover both `.test.ts` and `.test.tsx`.

### Migration scope
- `src/renderer/shell-chrome-react.tsx` — proof-of-concept, migrated first as part of toolchain wiring.
- All other renderer React components: `home-react`, `settings-api-keys-react`, `settings-endpoint-overrides-react`, `settings-output-react`, `settings-recording-react`, `settings-save-react`, `settings-shortcut-editor-react`, `settings-shortcuts-react`, `settings-transformation-react`.
- `src/renderer/renderer-app.tsx` — central renderer orchestrator; renamed from `.ts` and converted from `createElement` to JSX.
- Corresponding test files migrated from `.test.ts` → `.test.tsx`.
- `src/renderer/legacy-renderer.ts` — deleted (dead compatibility shim).

## Rationale

- JSX is the idiomatic authoring format for React; it significantly reduces boilerplate.
- The automatic JSX transform (`react-jsx`) eliminates the need for `import React` at the top of every file.
- For leaf components the migration is mechanical — component behavior, selectors, event contracts, and prop shapes are unchanged.
- The `renderer-app` migration is also syntax-only for the JSX conversion; behavioral changes (shim removal, Enter-to-save ownership) are intentional clean-ups bundled in the same PR to reduce churn.
- Using `.tsx` extensions makes the intent of each file explicit to readers and tooling.

## Behavioral changes (non-mechanical)

### Legacy-renderer shim removed
- `startLegacyRenderer` no longer exists. Any code that called it must be updated to call `startRendererApp` directly. At the time of this change, no such callers existed outside the deleted shim.

### Enter-to-save moved from global DOM listener to React-owned onKeyDown
- Previously: `document.addEventListener('keydown', handler)` ran on every keydown in the renderer, guarded by a `data-page="settings"` DOM check.
- Now: `onKeyDown={handleSettingsEnterSaveKeydown}` is attached to the `<section data-page="settings">` container element; React's event delegation handles propagation from child inputs.
- The `.settings-form` scope guard is preserved: Enter-to-save only fires from inputs/selects inside the `.settings-form` wrapper. API key inputs, which live outside `.settings-form` and have their own save action, are intentionally excluded.
- Textarea elements are still exempt (Enter in textarea inserts a newline, not a save).
- Modifier-key chords (Shift+Enter, Cmd+Enter, Ctrl+Enter, Alt+Enter) are still exempt.

## Consequences

- All renderer React components now use `.tsx` extension.
- `@vitejs/plugin-react` is a required dev dependency for both build and test.
- `legacy-renderer.ts` is deleted; `startRendererApp` (exported from `renderer-app.tsx`) is the only renderer boot entrypoint.
- Enter-to-save is React-owned and scoped; no global `document` keydown listener remains for settings.
- Future renderer React components should be created as `.tsx` files from the start.
