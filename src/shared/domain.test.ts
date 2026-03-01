// Where: src/shared/domain.test.ts
// What:  Unit tests for settings domain schema and validation behavior.
// Why:   Lock the post-sunset settings contract and prevent legacy-field regressions.

import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  type Settings,
  validateSettings
} from './domain'

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
        baseUrlOverride: 'https://legacy-scalar.local',
        baseUrlOverrides: { groq: 'https://stt.local', elevenlabs: null }
      },
      transformation: {
        ...structuredClone(DEFAULT_SETTINGS).transformation,
        activePresetId: 'legacy-active',
        baseUrlOverride: 'https://legacy-llm.local',
        baseUrlOverrides: { google: 'https://llm.local' }
      }
    } as Record<string, unknown>

    const parsed = v.parse(SettingsSchema, withLegacyKeys) as Settings & {
      transcription: Settings['transcription'] & { baseUrlOverride?: string; baseUrlOverrides?: unknown }
      transformation: Settings['transformation'] & { activePresetId?: string; baseUrlOverride?: string; baseUrlOverrides?: unknown }
    }
    expect(parsed.transcription.baseUrlOverride).toBeUndefined()
    expect(parsed.transcription.baseUrlOverrides).toBeUndefined()
    expect(parsed.transformation.activePresetId).toBeUndefined()
    expect(parsed.transformation.baseUrlOverride).toBeUndefined()
    expect(parsed.transformation.baseUrlOverrides).toBeUndefined()
  })
})
