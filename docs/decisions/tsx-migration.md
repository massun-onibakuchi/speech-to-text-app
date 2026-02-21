<!--
Where: docs/decisions/tsx-migration.md
What: Decision record for the project-wide migration of renderer components from .ts (React.createElement) to .tsx (JSX syntax).
Why: Enables JSX syntax across all renderer components, reducing verbosity and aligning with standard React conventions.
-->

# Decision Record: Project-Wide TSX Migration

## Context

All renderer React components were originally written in `.ts` files using verbose `React.createElement` calls. This was a pragmatic starting point, but as the component count grew it became harder to read and maintain.

## Decision

Migrate all renderer React components and their test files from `.ts` to `.tsx`, enabling JSX syntax. Wire the required toolchain changes to support TSX throughout the build and test pipeline.

### Toolchain changes
- `tsconfig.json`: set `jsx: "react-jsx"` (automatic React 17+ JSX transform — no `import React` needed).
- `electron.vite.config.ts`: add `@vitejs/plugin-react` to the renderer pipeline.
- `vitest.config.ts`: add `@vitejs/plugin-react` so test runs handle `.tsx` files.

### Migration scope
- `src/renderer/shell-chrome-react.tsx` — proof-of-concept, migrated first as part of toolchain wiring.
- All other renderer React components: `home-react`, `settings-api-keys-react`, `settings-endpoint-overrides-react`, `settings-output-react`, `settings-recording-react`, `settings-save-react`, `settings-shortcut-editor-react`, `settings-shortcuts-react`, `settings-transformation-react`.
- Corresponding test files migrated from `.test.ts` → `.test.tsx`.

## Rationale

- JSX is the idiomatic authoring format for React; it significantly reduces boilerplate.
- The automatic JSX transform (`react-jsx`) eliminates the need for `import React` at the top of every file.
- The migration is purely mechanical — component behavior, selectors, event contracts, and prop shapes are unchanged.
- Using `.tsx` extensions makes the intent of each file explicit to readers and tooling.

## Consequences

- All renderer React components now use `.tsx` extension.
- `@vitejs/plugin-react` is a required dev dependency for both build and test.
- No runtime behavior changes — the migration is a syntax-level transformation only.
- Future renderer React components should be created as `.tsx` files from the start.
