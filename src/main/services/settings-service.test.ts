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

    // Same store, new service instance — proves data comes from store, not instance state
    const serviceB = new SettingsService(store)
    expect(serviceB.getSettings().recording.device).toBe('Built-in Microphone')
  })

  it('strips removed transformation.enabled key when saving', () => {
    const store = createMockStore()
    const service = new SettingsService(store)
    const next = structuredClone(service.getSettings()) as Settings & {
      transformation: Settings['transformation'] & { enabled?: boolean }
    }
    next.transformation.enabled = false

    const saved = service.setSettings(next as Settings)

    expect('enabled' in (saved.transformation as Record<string, unknown>)).toBe(false)
    expect('enabled' in (store.get('settings').transformation as Record<string, unknown>)).toBe(false)
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

  it('migrates deprecated gemini-1.5-flash-8b presets to gemini-2.5-flash on load', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].model = 'gemini-1.5-flash-8b'
    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transformation.presets[0]?.model).toBe('gemini-2.5-flash')
    expect(set).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        transformation: expect.objectContaining({
          presets: expect.arrayContaining([expect.objectContaining({ model: 'gemini-2.5-flash' })])
        })
      })
    )
  })

  it('migrates missing provider override maps to null-keyed maps on load', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.transcription.baseUrlOverrides
    delete legacySettings.transformation.baseUrlOverrides

    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transcription.baseUrlOverrides.groq).toBeNull()
    expect(loaded.transcription.baseUrlOverrides.elevenlabs).toBeNull()
    expect(loaded.transformation.baseUrlOverrides.google).toBeNull()
    expect(set).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        transcription: expect.objectContaining({
          baseUrlOverrides: expect.objectContaining({
            groq: null,
            elevenlabs: null
          })
        }),
        transformation: expect.objectContaining({
          baseUrlOverrides: expect.objectContaining({
            google: null
          })
        })
      })
    )
  })

  it('migrates missing output.selectedTextSource using transformed precedence', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.output.selectedTextSource
    legacySettings.output.transcript = { copyToClipboard: true, pasteAtCursor: true }
    legacySettings.output.transformed = { copyToClipboard: true, pasteAtCursor: true }

    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.output.selectedTextSource).toBe('transformed')
    expect(set).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        output: expect.objectContaining({
          selectedTextSource: 'transformed'
        })
      })
    )
  })

  it('removes legacy activePresetId and initializes lastPickedPresetId to null on load', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.activePresetId = 'legacy-active'
    delete legacySettings.transformation.lastPickedPresetId

    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transformation.lastPickedPresetId).toBeNull()
    expect((loaded.transformation as Record<string, unknown>).activePresetId).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('preserves legacy scalar override values during one-time map migration', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    delete legacySettings.transcription.baseUrlOverrides
    delete legacySettings.transformation.baseUrlOverrides
    legacySettings.transcription.provider = 'elevenlabs'
    legacySettings.transcription.baseUrlOverride = 'https://legacy-stt.local'
    legacySettings.transformation.baseUrlOverride = 'https://legacy-llm.local'

    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transcription.baseUrlOverrides.groq).toBeNull()
    expect(loaded.transcription.baseUrlOverrides.elevenlabs).toBe('https://legacy-stt.local')
    expect(loaded.transformation.baseUrlOverrides.google).toBe('https://legacy-llm.local')
    expect(set).toHaveBeenCalledOnce()
  })

  it('is idempotent when provider maps already exist', () => {
    const currentSettings = structuredClone(DEFAULT_SETTINGS)
    currentSettings.transcription.baseUrlOverrides.groq = 'https://groq-map.local'
    currentSettings.transformation.baseUrlOverrides.google = 'https://google-map.local'

    const data = { settings: currentSettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transcription.baseUrlOverrides.groq).toBe('https://groq-map.local')
    expect(loaded.transformation.baseUrlOverrides.google).toBe('https://google-map.local')
    expect(set).not.toHaveBeenCalled()
  })

  it('applies gemini and provider-map migrations in a single load', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].model = 'gemini-1.5-flash-8b'
    delete legacySettings.transcription.baseUrlOverrides
    delete legacySettings.transformation.baseUrlOverrides
    legacySettings.transcription.baseUrlOverride = 'https://legacy-stt.local'
    legacySettings.transformation.baseUrlOverride = 'https://legacy-llm.local'

    const data = { settings: legacySettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect(loaded.transformation.presets[0]?.model).toBe('gemini-2.5-flash')
    expect(loaded.transcription.baseUrlOverrides.groq).toBe('https://legacy-stt.local')
    expect(loaded.transformation.baseUrlOverrides.google).toBe('https://legacy-llm.local')
    expect(set).toHaveBeenCalledOnce()
  })
})
