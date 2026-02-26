# Vitest React Plugin Type Compatibility Workaround

## Context

- `vitest.config.ts` imports `defineConfig` from `vitest/config`.
- In this repository, `vitest@2.x` brings Vite 5 config types.
- `@vitejs/plugin-react@5.x` is typed against Vite 6 plugin types.
- `tsc --noEmit` failed because the `plugins` array in `vitest.config.ts` mixed Vite 5 and Vite 6 `PluginOption` types.

## Decision

- Keep using `@vitejs/plugin-react` in `vitest.config.ts`.
- Apply a narrow compatibility cast at the plugin return boundary in `vitest.config.ts` instead of:
  - removing the plugin from Vitest config, or
  - changing package versions as part of an unrelated review-fixes PR.

## Rationale

- The failure was a TypeScript type compatibility issue, not a known runtime failure.
- A narrow cast restores `tsc` while keeping plugin factory parameter typing.
- Version alignment (Vitest/Vite/plugin-react) should be handled separately as a dependency maintenance task.

## Follow-up

- Align Vitest and Vite/plugin-react versions in a dedicated dependency update PR to remove the workaround cast.
