// src/main/routing/processing-mode-source.test.ts
// Verifies default mode source always returns 'default'.
// When canonical settings are introduced (Phase 1A), a new source will be added.

import { describe, expect, it } from 'vitest'
import { DefaultProcessingModeSource } from './processing-mode-source'

describe('DefaultProcessingModeSource', () => {
  it('always resolves to default mode', () => {
    const source = new DefaultProcessingModeSource()
    expect(source.resolve()).toBe('default')
  })

  it('returns consistent result on repeated calls', () => {
    const source = new DefaultProcessingModeSource()
    expect(source.resolve()).toBe(source.resolve())
  })
})
