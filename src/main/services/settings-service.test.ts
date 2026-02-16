import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import { SettingsService } from './settings-service'

describe('SettingsService', () => {
  it('returns a clone instead of mutable internal state', () => {
    const service = new SettingsService()
    const settings = service.getSettings()
    settings.transformation.enabled = false

    const reloaded = service.getSettings()
    expect(reloaded.transformation.enabled).toBe(DEFAULT_SETTINGS.transformation.enabled)
  })

  it('stores updated settings across service instances', () => {
    const serviceA = new SettingsService()
    const base = serviceA.getSettings()
    const next: Settings = {
      ...base,
      recording: {
        ...base.recording,
        device: 'Built-in Microphone'
      }
    }

    serviceA.setSettings(next)

    const serviceB = new SettingsService()
    expect(serviceB.getSettings().recording.device).toBe('Built-in Microphone')
  })

  it('rejects invalid settings payloads', () => {
    const service = new SettingsService()
    const invalid: Settings = {
      ...service.getSettings(),
      transcription: {
        ...service.getSettings().transcription,
        model: 'scribe_v2'
      }
    }

    expect(() => service.setSettings(invalid)).toThrow(/Invalid settings/)
  })

  it('rejects unsupported recording method and sample rate', () => {
    const service = new SettingsService()
    const invalid: Settings = {
      ...service.getSettings(),
      recording: {
        ...service.getSettings().recording,
        method: 'cpal',
        sampleRateHz: 16000
      }
    }

    const mutableRecording = invalid.recording as any
    mutableRecording.method = 'native_default'
    mutableRecording.sampleRateHz = 22050

    expect(() => service.setSettings(invalid)).toThrow(/recording.method/)
    expect(() => service.setSettings(invalid)).toThrow(/recording.sampleRateHz/)
  })

  it('persists transformation prompts across service instances', () => {
    const serviceA = new SettingsService()
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

    const serviceB = new SettingsService()
    const reloaded = serviceB.getSettings()
    expect(reloaded.transformation.presets[0]?.systemPrompt).toBe('custom system prompt')
    expect(reloaded.transformation.presets[0]?.userPrompt).toBe('rewrite exactly: {{input}}')
  })
})
