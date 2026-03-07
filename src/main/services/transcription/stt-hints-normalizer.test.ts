// Where: src/main/services/transcription/stt-hints-normalizer.test.ts
// What: Unit tests for STT hint normalization and Groq prompt generation.
// Why: Lock deterministic handling of context text and dictionary terms.

import { describe, expect, it } from 'vitest'
import { GROQ_PROMPT_MAX_CHARS } from './stt-hints-policy'
import { buildElevenLabsKeyterms, buildGroqPromptFromHints, normalizeSttHints } from './stt-hints-normalizer'

describe('normalizeSttHints', () => {
  it('normalizes context and de-duplicates dictionary terms case-insensitively', () => {
    const normalized = normalizeSttHints({
      contextText: '  finance meeting terms  ',
      dictionaryTerms: [' ARR ', 'arr', 'MRR', ' ', 'mrr']
    })

    expect(normalized).toEqual({
      contextText: 'finance meeting terms',
      dictionaryTerms: ['ARR', 'MRR']
    })
  })

  it('returns empty normalized hints when input is undefined', () => {
    expect(normalizeSttHints(undefined)).toEqual({
      contextText: '',
      dictionaryTerms: []
    })
  })
})

describe('buildGroqPromptFromHints', () => {
  it('builds a labeled prompt from context and dictionary terms', () => {
    const prompt = buildGroqPromptFromHints({
      contextText: 'Use product spellings.',
      dictionaryTerms: ['Codex', 'Scribe v2']
    })

    expect(prompt).toBe('Use product spellings.\nVocabulary: Codex, Scribe v2')
  })

  it('keeps the vocabulary label when only dictionary terms are present', () => {
    const prompt = buildGroqPromptFromHints({
      contextText: '   ',
      dictionaryTerms: ['Whisper']
    })

    expect(prompt).toBe('Vocabulary: Whisper')
  })

  it('caps prompt length to configured max chars', () => {
    const longContext = 'x'.repeat(GROQ_PROMPT_MAX_CHARS + 100)
    const prompt = buildGroqPromptFromHints({
      contextText: longContext,
      dictionaryTerms: ['Codex']
    })

    expect(prompt.length).toBeLessThanOrEqual(GROQ_PROMPT_MAX_CHARS)
  })
})

describe('buildElevenLabsKeyterms', () => {
  it('builds keyterms from normalized dictionary terms and ignores context text', () => {
    const keyterms = buildElevenLabsKeyterms({
      contextText: 'unused context',
      dictionaryTerms: ['Codex', '  Scribe v2  ', 'codex']
    })

    expect(keyterms).toEqual(['Codex', 'Scribe v2'])
  })

  it('drops terms that exceed provider char or word limits', () => {
    const keyterms = buildElevenLabsKeyterms({
      contextText: '',
      dictionaryTerms: [
        'one two three four five six',
        'x'.repeat(60),
        'valid term'
      ]
    })

    expect(keyterms).toEqual(['valid term'])
  })
})
