// Where: src/shared/domain.test.ts
// What:  Unit tests for provider base URL override resolver behavior.
// Why:   Lock resolver precedence to avoid provider override regressions.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, resolveLlmBaseUrlOverride, resolveSttBaseUrlOverride, type Settings } from './domain'

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
