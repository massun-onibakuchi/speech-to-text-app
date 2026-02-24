/*
Where: vitest.config.ts
What: Vitest configuration (plugins + test coverage/exclude settings).
Why: Keep test discovery scoped to the repo by excluding generated or external
     directories like worktrees and pnpm store.
*/

import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
