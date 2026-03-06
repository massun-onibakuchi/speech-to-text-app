// Where: src/main/services/transcription/dictionary-replacement.ts
// What: Applies transcript-stage dictionary replacements with deterministic precedence.
// Why: Keep correction behavior isolated, testable, and transcript-only.

import type { DictionaryEntry } from '../../../shared/domain'

interface ReplacementRule {
  key: string
  keyLower: string
  value: string
}

const UTF8_ENCODER = new TextEncoder()
const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u

const isWordChar = (char: string | undefined): boolean => {
  if (!char) {
    return false
  }
  return WORD_CHAR_REGEX.test(char)
}

const compareUtf8Bytes = (left: string, right: string): number => {
  const leftBytes = UTF8_ENCODER.encode(left)
  const rightBytes = UTF8_ENCODER.encode(right)
  const max = Math.min(leftBytes.length, rightBytes.length)
  for (let idx = 0; idx < max; idx += 1) {
    const diff = leftBytes[idx]! - rightBytes[idx]!
    if (diff !== 0) {
      return diff
    }
  }
  return leftBytes.length - rightBytes.length
}

const toReplacementRules = (entries: readonly DictionaryEntry[]): ReplacementRule[] =>
  entries
    .map((entry) => ({
      key: entry.key.trim(),
      keyLower: entry.key.trim().toLowerCase(),
      value: entry.value
    }))
    .filter((rule) => rule.key.length > 0)
    .sort((left, right) => {
      if (right.key.length !== left.key.length) {
        return right.key.length - left.key.length
      }
      if (left.keyLower < right.keyLower) {
        return -1
      }
      if (left.keyLower > right.keyLower) {
        return 1
      }
      return compareUtf8Bytes(left.key, right.key)
    })

const matchesBoundary = (text: string, index: number, key: string): boolean => {
  const first = key[0]
  const last = key[key.length - 1]
  const before = index > 0 ? text[index - 1] : undefined
  const afterIndex = index + key.length
  const after = afterIndex < text.length ? text[afterIndex] : undefined

  if (isWordChar(first) && isWordChar(before)) {
    return false
  }
  if (isWordChar(last) && isWordChar(after)) {
    return false
  }
  return true
}

export const applyDictionaryReplacement = (transcript: string, entries: readonly DictionaryEntry[]): string => {
  if (transcript.length === 0 || entries.length === 0) {
    return transcript
  }

  const rules = toReplacementRules(entries)
  if (rules.length === 0) {
    return transcript
  }

  let output = ''
  let cursor = 0

  while (cursor < transcript.length) {
    let matched = false

    for (const rule of rules) {
      if (cursor + rule.key.length > transcript.length) {
        continue
      }
      const slice = transcript.slice(cursor, cursor + rule.key.length)
      if (slice.toLowerCase() !== rule.keyLower) {
        continue
      }
      if (!matchesBoundary(transcript, cursor, rule.key)) {
        continue
      }

      output += rule.value
      cursor += rule.key.length
      matched = true
      break
    }

    if (!matched) {
      output += transcript[cursor]
      cursor += 1
    }
  }

  return output
}
