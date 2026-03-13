// Where: src/shared/domain.test.ts
// What:  Unit tests for settings domain schema and validation behavior.
// Why:   Lock the post-sunset settings contract and prevent legacy-field regressions.

import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  normalizeDictionaryEntriesForPersistence,
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

  it('rejects dictionary entries with duplicate keys (case-insensitive)', () => {
    const withDuplicates = structuredClone(DEFAULT_SETTINGS)
    withDuplicates.correction.dictionary.entries = [
      { key: 'Codex', value: 'Codex' },
      { key: 'codex', value: 'CODEX' }
    ]

    const errors = validateSettings(withDuplicates)
    expect(errors.some((error) => error.field === 'correction.dictionary.entries')).toBe(true)
  })

  it('sorts dictionary entries deterministically for persistence', () => {
    const sorted = normalizeDictionaryEntriesForPersistence([
      { key: 'beta', value: '2' },
      { key: 'Alpha', value: '1' },
      { key: 'Gamma', value: '3' }
    ])

    expect(sorted).toEqual([
      { key: 'Alpha', value: '1' },
      { key: 'beta', value: '2' },
      { key: 'Gamma', value: '3' }
    ])
  })

  it('rejects dictionary entry values longer than 256 chars', () => {
    const withLongValue = structuredClone(DEFAULT_SETTINGS)
    withLongValue.correction.dictionary.entries = [
      { key: 'onibakuti', value: 'x'.repeat(257) }
    ]

    const result = v.safeParse(SettingsSchema, withLongValue)
    expect(result.success).toBe(false)
  })

  it('rejects prompt templates with {{text}} outside <input_text> boundary', () => {
    const withUnsafePrompt = structuredClone(DEFAULT_SETTINGS)
    withUnsafePrompt.transformation.presets[0] = {
      ...withUnsafePrompt.transformation.presets[0],
      userPrompt: 'Rewrite this: {{text}}'
    }

    const result = v.safeParse(SettingsSchema, withUnsafePrompt)
    expect(result.success).toBe(false)
  })

  it('rejects prompt templates with multiple {{text}} placeholders', () => {
    const withDuplicatePlaceholders = structuredClone(DEFAULT_SETTINGS)
    withDuplicatePlaceholders.transformation.presets[0] = {
      ...withDuplicatePlaceholders.transformation.presets[0],
      userPrompt: '<input_text>{{text}}</input_text>\n<input_text>{{text}}</input_text>'
    }

    const result = v.safeParse(SettingsSchema, withDuplicatePlaceholders)
    expect(result.success).toBe(false)
  })

})
