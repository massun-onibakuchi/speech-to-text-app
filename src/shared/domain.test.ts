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

  it('rejects payloads containing unknown legacy keys', () => {
    const withLegacyKeys = {
      ...structuredClone(DEFAULT_SETTINGS),
      transcription: {
        ...structuredClone(DEFAULT_SETTINGS).transcription,
        baseUrlOverride: 'https://legacy-scalar.local'
      }
    }

    const result = v.safeParse(SettingsSchema, withLegacyKeys)
    expect(result.success).toBe(false)
  })

  it('rejects legacy {{input}} placeholder in preset prompts', () => {
    const withLegacyPrompt = structuredClone(DEFAULT_SETTINGS)
    withLegacyPrompt.transformation.presets[0] = {
      ...withLegacyPrompt.transformation.presets[0],
      userPrompt: 'Rewrite: {{input}}'
    }

    const result = v.safeParse(SettingsSchema, withLegacyPrompt)
    expect(result.success).toBe(false)
  })

  it('rejects transcription hints when dictionaryTerms exceed max length', () => {
    const oversizedHints = structuredClone(DEFAULT_SETTINGS)
    oversizedHints.transcription.hints.dictionaryTerms = Array.from({ length: 101 }, (_, idx) => `term-${idx}`)

    const result = v.safeParse(SettingsSchema, oversizedHints)
    expect(result.success).toBe(false)
  })

})
