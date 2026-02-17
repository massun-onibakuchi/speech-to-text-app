// src/main/routing/processing-mode-source.test.ts
// Verifies legacy mode source always returns 'default'.
// When canonical settings are introduced (Phase 1A), a new source will be added.

import { describe, expect, it } from 'vitest'
import { LegacyProcessingModeSource } from './processing-mode-source'

describe('LegacyProcessingModeSource', () => {
  it('always resolves to default mode', () => {
    const source = new LegacyProcessingModeSource()
    expect(source.resolve()).toBe('default')
  })

  it('returns consistent result on repeated calls', () => {
    const source = new LegacyProcessingModeSource()
    expect(source.resolve()).toBe(source.resolve())
  })
})
