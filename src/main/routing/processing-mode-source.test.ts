// src/main/routing/processing-mode-source.test.ts
// Verifies both the legacy fixed-default source and the settings-backed source.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { DefaultProcessingModeSource, SettingsBackedProcessingModeSource } from './processing-mode-source'

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

describe('SettingsBackedProcessingModeSource', () => {
  it('resolves default mode from persisted settings', () => {
    const source = new SettingsBackedProcessingModeSource({
      getSettings: () => structuredClone(DEFAULT_SETTINGS)
    })

    expect(source.resolve()).toBe('default')
  })

  it('resolves streaming mode from persisted settings', () => {
    const source = new SettingsBackedProcessingModeSource({
      getSettings: () => ({
        processing: {
          ...DEFAULT_SETTINGS.processing,
          mode: 'streaming'
        }
      })
    })

    expect(source.resolve()).toBe('streaming')
  })
})
