// Where: src/main/services/transcription/dictionary-replacement.test.ts
// What: Tests for transcript dictionary replacement semantics.
// Why: Lock exact, case-insensitive, deterministic transcript-only correction behavior.

import { describe, expect, it } from 'vitest'
import { applyDictionaryReplacement } from './dictionary-replacement'

describe('applyDictionaryReplacement', () => {
  it('replaces exact matches case-insensitively', () => {
    const result = applyDictionaryReplacement('teh quick brown fox', [
      { key: 'TEH', value: 'the' }
    ])
    expect(result).toBe('the quick brown fox')
  })

  it('does not replace inside larger alphanumeric tokens', () => {
    const result = applyDictionaryReplacement('this is a bus and a US thing', [
      { key: 'us', value: 'US' }
    ])
    expect(result).toBe('this is a bus and a US thing')
  })

  it('prefers longer keys when overlaps exist', () => {
    const result = applyDictionaryReplacement('I use AB and A.', [
      { key: 'A', value: 'Alpha' },
      { key: 'AB', value: 'Alphabet' }
    ])
    expect(result).toBe('I use Alphabet and Alpha.')
  })

  it('replaces repeated non-overlapping matches left-to-right', () => {
    const result = applyDictionaryReplacement('teh teh teh', [
      { key: 'teh', value: 'the' }
    ])
    expect(result).toBe('the the the')
  })

  it('supports punctuation boundaries and trims keys', () => {
    const result = applyDictionaryReplacement('hello,teh world! teh?', [
      { key: '  teh  ', value: 'the' }
    ])
    expect(result).toBe('hello,the world! the?')
  })

  it('handles large dictionary/transcript inputs within the test timeout budget', () => {
    const entries = Array.from({ length: 500 }, (_value, index) => ({
      key: `word-${index}`,
      value: `term-${index}`
    }))
    const transcript = Array.from({ length: 4000 }, (_value, index) => `word-${index % 500}`).join(' ')

    const result = applyDictionaryReplacement(transcript, entries)

    expect(result.startsWith('term-0 term-1 term-2')).toBe(true)
    expect(result.includes('word-')).toBe(false)
  })
})
