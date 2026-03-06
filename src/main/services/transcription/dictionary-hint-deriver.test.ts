// Where: src/main/services/transcription/dictionary-hint-deriver.test.ts
// What: Unit tests for deriving STT hints from dictionary entries.
// Why: Lock deterministic merge, append, and dedupe behavior.

import { describe, expect, it } from 'vitest'
import { deriveSttHintsFromDictionary } from './dictionary-hint-deriver'

describe('deriveSttHintsFromDictionary', () => {
  it('derives dictionaryTerms from dictionary entry keys only', () => {
    const hints = deriveSttHintsFromDictionary(
      { contextText: 'finance terms' },
      [
        { key: 'MRR', value: 'Monthly Recurring Revenue' },
        { key: 'NDR', value: 'Net Dollar Retention' }
      ]
    )

    expect(hints).toEqual({
      contextText: 'finance terms',
      dictionaryTerms: ['MRR', 'NDR']
    })
  })

  it('de-duplicates entry keys case-insensitively and trims whitespace', () => {
    const hints = deriveSttHintsFromDictionary(
      { contextText: '' },
      [
        { key: 'codex', value: 'Codex' },
        { key: '  ', value: 'ignored' },
        { key: 'SCRIBE', value: 'Scribe' },
        { key: 'Whisper', value: 'Whisper' }
      ]
    )

    expect(hints.dictionaryTerms).toEqual(['codex', 'SCRIBE', 'Whisper'])
  })

  it('ignores legacy transcription dictionaryTerms even when populated', () => {
    const hints = deriveSttHintsFromDictionary(
      { contextText: 'ctx' },
      [{ key: 'Codex', value: 'Codex' }]
    )

    expect(hints).toEqual({
      contextText: 'ctx',
      dictionaryTerms: ['Codex']
    })
  })
})
