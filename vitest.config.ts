/*
Where: vitest.config.ts
What: Vitest configuration (plugins + test coverage/exclude settings).
Why: Keep test discovery scoped to the repo by excluding generated or external
     directories like worktrees and pnpm store.
*/

import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `vitest/config` in this repo resolves to Vitest 2 (Vite 5 types), while
// `@vitejs/plugin-react` is typed against Vite 6. The plugin works at runtime
// for our test config, but TS sees incompatible `PluginOption` versions.
const reactForVitest = (...args: Parameters<typeof react>) => react(...args) as any

export default defineConfig({
  plugins: [reactForVitest()],
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.worktrees/**',
      '**/.pnpm-store/**'
    ],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/main/index.ts',
        'src/main/core/**',
        'src/main/ipc/**',
        'src/main/infrastructure/*-client.ts',
        'src/main/services/transcription/*.ts',
        'src/main/services/transformation/types.ts',
        'src/shared/ipc.ts'
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70
      }
    }
  }
})
