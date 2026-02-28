// Where: src/shared/domain.test.ts
// What:  Unit tests for provider base URL override resolver behavior.
// Why:   Lock resolver precedence to avoid provider override regressions.

import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  resolveLlmBaseUrlOverride,
  resolveSttBaseUrlOverride,
  type Settings,
  validateSettings
} from './domain'

describe('resolveSttBaseUrlOverride', () => {
  it('prefers provider map override when present and scalar is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        provider: 'groq',
        baseUrlOverrides: {
          groq: 'https://stt-groq.local',
          elevenlabs: null
        }
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBe('https://stt-groq.local')
  })

  it('returns null when provider map key is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverrides: {
          groq: null,
          elevenlabs: null
        }
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBeNull()
  })

  it('returns selected provider key value from the map', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverrides: {
          groq: 'https://map-stt.local',
          elevenlabs: 'https://elevenlabs-map.local'
        }
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBe('https://map-stt.local')
    expect(resolveSttBaseUrlOverride(settings, 'elevenlabs')).toBe('https://elevenlabs-map.local')
  })
})

describe('resolveLlmBaseUrlOverride', () => {
  it('prefers provider map override when present and scalar is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: 'https://llm-google.local'
        }
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBe('https://llm-google.local')
  })

  it('returns null when provider map key is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: null
        }
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBeNull()
  })

  it('returns selected provider key value from the map', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: 'https://map-llm.local'
        }
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBe('https://map-llm.local')
  })
})

describe('SettingsSchema post-sunset contract', () => {
  it('accepts canonical current settings payload', () => {
    const parsed = v.parse(SettingsSchema, structuredClone(DEFAULT_SETTINGS))
    expect(parsed).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects invalid provider/model pair in validateSettings', () => {
    const invalid: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        provider: 'groq',
        model: 'scribe_v2'
      }
    }

    const errors = validateSettings(invalid)
    expect(errors.some((error) => error.field === 'transcription.model')).toBe(true)
  })

  it('strips unknown legacy keys when payload is otherwise valid', () => {
    const withLegacyKeys = {
      ...structuredClone(DEFAULT_SETTINGS),
      transcription: {
        ...structuredClone(DEFAULT_SETTINGS).transcription,
        baseUrlOverride: 'https://legacy-scalar.local'
      },
      transformation: {
        ...structuredClone(DEFAULT_SETTINGS).transformation,
        activePresetId: 'legacy-active'
      }
    } as Record<string, unknown>

    const parsed = v.parse(SettingsSchema, withLegacyKeys) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string }
      transformation: Settings['transformation'] & { activePresetId?: string }
    }
    expect(parsed.transcription.baseUrlOverride).toBeUndefined()
    expect(parsed.transformation.activePresetId).toBeUndefined()
  })
})
