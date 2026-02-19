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
        },
        baseUrlOverride: null
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBe('https://stt-groq.local')
  })

  it('falls back to scalar when provider map key is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverrides: {
          groq: null,
          elevenlabs: null
        },
        baseUrlOverride: 'https://legacy-stt.local'
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBe('https://legacy-stt.local')
  })

  it('returns null when both provider map and scalar are null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverrides: {
          groq: null,
          elevenlabs: null
        },
        baseUrlOverride: null
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'elevenlabs')).toBeNull()
  })

  it('uses provider map over scalar when both are set', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverrides: {
          groq: 'https://map-stt.local',
          elevenlabs: null
        },
        baseUrlOverride: 'https://legacy-stt.local'
      }
    }

    expect(resolveSttBaseUrlOverride(settings, 'groq')).toBe('https://map-stt.local')
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
        },
        baseUrlOverride: null
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBe('https://llm-google.local')
  })

  it('falls back to scalar when provider map key is null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: null
        },
        baseUrlOverride: 'https://legacy-llm.local'
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBe('https://legacy-llm.local')
  })

  it('returns null when both provider map and scalar are null', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: null
        },
        baseUrlOverride: null
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBeNull()
  })

  it('uses provider map over scalar when both are set', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverrides: {
          google: 'https://map-llm.local'
        },
        baseUrlOverride: 'https://legacy-llm.local'
      }
    }

    expect(resolveLlmBaseUrlOverride(settings, 'google')).toBe('https://map-llm.local')
  })
})
