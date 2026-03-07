import { describe, expect, it, vi } from 'vitest'
import * as v from 'valibot'

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

const createRawStore = (rawSettings: unknown) => {
  const data = { settings: rawSettings }
  const set = vi.fn((key: 'settings', value: Settings) => {
    data[key] = value
  })
  return {
    store: {
      get: (key: 'settings') => data[key],
      set
    } as any,
    set
  }
}

describe('SettingsService', () => {
  it('returns a clone instead of mutable internal state', () => {
    const service = new SettingsService(createMockStore())
    const settings = service.getSettings()
    settings.recording.device = 'Mutated Device'

    const reloaded = service.getSettings()
    expect(reloaded.recording.device).toBe(DEFAULT_SETTINGS.recording.device)
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

    // Same store, new service instance - proves data comes from store, not instance state.
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

  it('rejects unsupported recording method', () => {
    const service = new SettingsService(createMockStore())
    const base = service.getSettings()
    const invalid = structuredClone(base) as any
    invalid.recording.method = 'native_default'

    expect(() => service.setSettings(invalid)).toThrow(/Invalid settings/)
  })

  it('rejects unsupported recording sample rate', () => {
    const service = new SettingsService(createMockStore())
    const base = service.getSettings()
    const invalid = structuredClone(base) as any
    invalid.recording.sampleRateHz = 22050

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
                userPrompt: 'rewrite exactly.\n<input_text>{{text}}</input_text>'
              }
            : preset
        )
      }
    }

    serviceA.setSettings(next)

    const serviceB = new SettingsService(store)
    const reloaded = serviceB.getSettings()
    expect(reloaded.transformation.presets[0]?.systemPrompt).toBe('custom system prompt')
    expect(reloaded.transformation.presets[0]?.userPrompt).toBe('rewrite exactly.\n<input_text>{{text}}</input_text>')
  })

  it('rejects legacy preset model payloads on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].model = 'gemini-1.5-flash-8b'
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects payloads missing output.selectedTextSource on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.output.selectedTextSource
    legacySettings.output.transcript = { copyToClipboard: true, pasteAtCursor: true }
    legacySettings.output.transformed = { copyToClipboard: true, pasteAtCursor: true }
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects payloads missing lastPickedPresetId on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.transformation.lastPickedPresetId
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects payloads missing correction.dictionary on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.correction
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects unknown legacy keys on startup (no normalization)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transcription.baseUrlOverride = 'https://legacy-stt.local'
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects unknown legacy keys on setSettings', () => {
    const service = new SettingsService(createMockStore())
    const next = structuredClone(service.getSettings()) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
    }
    next.transcription.baseUrlOverride = 'https://legacy-stt.local'

    expect(() => service.setSettings(next as Settings)).toThrow(/Invalid settings/)
  })

  it('rejects malformed setSettings payloads before persistence normalization', () => {
    const service = new SettingsService(createMockStore())
    const malformed = structuredClone(service.getSettings()) as any
    delete malformed.correction

    expect(() => service.setSettings(malformed as Settings)).toThrow(/Invalid settings/)
  })

  it('rejects legacy {{input}} placeholders on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].userPrompt = 'Rewrite: {{input}}'
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects unsafe {{text}} prompt templates on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].userPrompt = 'Rewrite: {{text}}'
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects case-insensitive duplicate dictionary keys on startup', () => {
    const invalidSettings = structuredClone(DEFAULT_SETTINGS) as any
    invalidSettings.correction.dictionary.entries = [
      { key: 'Codex', value: 'Codex' },
      { key: 'codex', value: 'CODEX' }
    ]
    const { store, set } = createRawStore(invalidSettings)

    expect(() => new SettingsService(store)).toThrow(/Invalid settings/)
    expect(set).not.toHaveBeenCalled()
  })

  it('persists dictionary entries in deterministic sorted order on setSettings', () => {
    const service = new SettingsService(createMockStore())
    const next = structuredClone(service.getSettings())
    next.correction.dictionary.entries = [
      { key: 'beta', value: '2' },
      { key: 'delta', value: '4' },
      { key: 'Alpha', value: '1' }
    ]

    const saved = service.setSettings(next)
    expect(saved.correction.dictionary.entries).toEqual([
      { key: 'Alpha', value: '1' },
      { key: 'beta', value: '2' },
      { key: 'delta', value: '4' }
    ])
  })
})
