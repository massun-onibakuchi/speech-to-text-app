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

  it('strips additional deprecated keys when saving current-schema payload', () => {
    const raw = createRawStore(structuredClone(DEFAULT_SETTINGS))
    const service = new SettingsService(raw.store)
    const next = structuredClone(service.getSettings()) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
      transformation: Settings['transformation'] & { activePresetId?: string }
    }
    next.transcription.baseUrlOverride = 'https://legacy-scalar.local'
    next.transformation.activePresetId = 'legacy-active'

    const saved = service.setSettings(next as Settings) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
      transformation: Settings['transformation'] & { activePresetId?: string }
    }

    expect(saved.transcription.baseUrlOverride).toBeUndefined()
    expect(saved.transformation.activePresetId).toBeUndefined()
    const persisted = service.getSettings() as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
      transformation: Settings['transformation'] & { activePresetId?: string }
    }
    expect(persisted.transcription.baseUrlOverride).toBeUndefined()
    expect(persisted.transformation.activePresetId).toBeUndefined()
    expect(raw.set).toHaveBeenCalled()
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

  it('strips removed override maps on save payloads', () => {
    const service = new SettingsService(createMockStore())
    const next = structuredClone(service.getSettings()) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverrides?: unknown }
      transformation: Settings['transformation'] & { baseUrlOverrides?: unknown }
    }
    next.transcription.baseUrlOverrides = { groq: 'https://stt-proxy.local', elevenlabs: null }
    next.transformation.baseUrlOverrides = { google: 'https://llm-proxy.local' }

    const saved = service.setSettings(next as Settings)

    expect(('baseUrlOverrides' in (saved.transcription as Record<string, unknown>))).toBe(false)
    expect(('baseUrlOverrides' in (saved.transformation as Record<string, unknown>))).toBe(false)
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

  it('does not persist removed start/stop shortcut keys when current schema is otherwise valid', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.shortcuts.startRecording = 'Cmd+Opt+R'
    legacySettings.shortcuts.stopRecording = 'Cmd+Opt+S'
    const { store, set } = createRawStore(legacySettings)

    const service = new SettingsService(store)
    const loaded = service.getSettings() as Settings & {
      shortcuts: Settings['shortcuts'] & { startRecording?: string; stopRecording?: string }
    }

    expect(loaded.shortcuts.startRecording).toBeUndefined()
    expect(loaded.shortcuts.stopRecording).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('does not persist single removed start/stop shortcut key when payload is otherwise valid', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.shortcuts.startRecording = 'Cmd+Opt+R'
    delete legacySettings.shortcuts.stopRecording
    const { store, set } = createRawStore(legacySettings)

    const service = new SettingsService(store)
    const loaded = service.getSettings() as Settings & {
      shortcuts: Settings['shortcuts'] & { startRecording?: string; stopRecording?: string }
    }

    expect(loaded.shortcuts.startRecording).toBeUndefined()
    expect(loaded.shortcuts.stopRecording).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('rejects payloads missing lastPickedPresetId on startup (no migration)', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.activePresetId = 'legacy-active'
    delete legacySettings.transformation.lastPickedPresetId
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })

  it('strips legacy scalar override payloads on startup', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transcription.provider = 'elevenlabs'
    legacySettings.transcription.baseUrlOverride = 'https://legacy-stt.local'
    legacySettings.transformation.baseUrlOverride = 'https://legacy-llm.local'
    const { store, set } = createRawStore(legacySettings)

    const service = new SettingsService(store)
    const loaded = service.getSettings() as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
      transformation: Settings['transformation'] & { baseUrlOverride?: string }
    }

    expect(loaded.transcription.baseUrlOverride).toBeUndefined()
    expect(loaded.transformation.baseUrlOverride).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('strips legacy provider maps on startup', () => {
    const currentSettings = structuredClone(DEFAULT_SETTINGS)
    ;(currentSettings.transcription as Record<string, unknown>).baseUrlOverrides = {
      groq: 'https://groq-map.local',
      elevenlabs: null
    }
    ;(currentSettings.transformation as Record<string, unknown>).baseUrlOverrides = {
      google: 'https://google-map.local'
    }

    const data = { settings: currentSettings }
    const set = vi.fn((key: 'settings', value: Settings) => {
      data[key] = value
    })
    const store = {
      get: () => data.settings,
      set
    } as any

    const service = new SettingsService(store)
    const loaded = service.getSettings() as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverrides?: unknown }
      transformation: Settings['transformation'] & { baseUrlOverrides?: unknown }
    }

    expect(loaded.transcription.baseUrlOverrides).toBeUndefined()
    expect(loaded.transformation.baseUrlOverrides).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('strips deprecated autoRunDefaultTransform key through startup schema parsing', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.autoRunDefaultTransform = false
    const { store, set } = createRawStore(legacySettings)

    const service = new SettingsService(store)
    const loaded = service.getSettings()

    expect((loaded.transformation as Record<string, unknown>).autoRunDefaultTransform).toBeUndefined()
    expect(set).toHaveBeenCalledOnce()
  })

  it('rejects payloads containing multiple legacy-compat requirements in a single load', () => {
    const legacySettings = structuredClone(DEFAULT_SETTINGS) as any
    legacySettings.transformation.presets[0].model = 'gemini-1.5-flash-8b'
    legacySettings.transcription.baseUrlOverride = 'https://legacy-stt.local'
    legacySettings.transformation.baseUrlOverride = 'https://legacy-llm.local'
    const { store, set } = createRawStore(legacySettings)

    expect(() => new SettingsService(store)).toThrow(v.ValiError)
    expect(set).not.toHaveBeenCalled()
  })
})
