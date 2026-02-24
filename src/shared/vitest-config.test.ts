/*
Where: src/shared/vitest-config.test.ts
What: Vitest config coverage for exclude patterns.
Why: Guard against accidental removal of worktree/pnpm-store exclusions that
     would slow or break local test discovery.
*/

import { describe, expect, it } from 'vitest'
import config from '../../vitest.config'

describe('vitest config', () => {
  it('excludes worktrees and pnpm store from test discovery', () => {
    const excluded = Array.isArray(config.test?.exclude) ? config.test?.exclude : []
    expect(excluded).toContain('**/.worktrees/**')
    expect(excluded).toContain('**/.pnpm-store/**')
  })
})
