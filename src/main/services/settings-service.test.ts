import { describe, expect, it, vi } from 'vitest'

// Mock electron-store so the module can load without the Electron binary.
vi.mock('electron-store', () => ({ default: class { get() { return {} } set() {} } }))

import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import { SettingsService, type SettingsStoreSchema } from './settings-service'

/**
 * Lightweight in-memory mock of electron-store's get/set interface.
 * Avoids importing the real electron-store (which requires the Electron binary).
 */
const createMockStore = () => {
  const data: SettingsStoreSchema = { settings: structuredClone(DEFAULT_SETTINGS) }
  return {
    get: (key: 'settings') => data[key],
    set: (key: 'settings', value: Settings) => { data[key] = value }
  } as any // satisfies the Store<SettingsStoreSchema> shape used by SettingsService
}

describe('SettingsService', () => {
  it('returns a clone instead of mutable internal state', () => {
    const service = new SettingsService(createMockStore())
    const settings = service.getSettings()
    settings.transformation.enabled = false

    const reloaded = service.getSettings()
    expect(reloaded.transformation.enabled).toBe(DEFAULT_SETTINGS.transformation.enabled)
  })

  it('stores updated settings and reads them back', () => {
    const store = createMockStore()
    const serviceA = new SettingsService(store)
    const base = serviceA.getSettings()
    const next: Settings = {
      ...base,
      recording: {
        ...base.recording,
        device: 'Built-in Microphone'
      }
    }

    serviceA.setSettings(next)

    // Same store, new service instance — proves data comes from store, not instance state
    const serviceB = new SettingsService(store)
    expect(serviceB.getSettings().recording.device).toBe('Built-in Microphone')
  })

  it('rejects invalid settings payloads', () => {
    const service = new SettingsService(createMockStore())
    const invalid: Settings = {
      ...service.getSettings(),
      transcription: {
        ...service.getSettings().transcription,
        model: 'scribe_v2'
      }
    }

    expect(() => service.setSettings(invalid)).toThrow(/Invalid settings/)
  })

  it('persists transformation prompts across service instances', () => {
    const store = createMockStore()
    const serviceA = new SettingsService(store)
    const base = serviceA.getSettings()
    const next: Settings = {
      ...base,
      transformation: {
        ...base.transformation,
        presets: base.transformation.presets.map((preset, index) =>
          index === 0
            ? {
                ...preset,
                systemPrompt: 'custom system prompt',
                userPrompt: 'rewrite exactly: {{input}}'
              }
            : preset
        )
      }
    }

    serviceA.setSettings(next)

    const serviceB = new SettingsService(store)
    const reloaded = serviceB.getSettings()
    expect(reloaded.transformation.presets[0]?.systemPrompt).toBe('custom system prompt')
    expect(reloaded.transformation.presets[0]?.userPrompt).toBe('rewrite exactly: {{input}}')
  })
})
