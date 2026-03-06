// Where: src/main/services/transcription/stt-hints-normalizer.ts
// What: Shared STT hint normalization and provider-specific prompt construction.
// Why: Ensure deterministic hint handling and avoid duplicating normalization rules in adapters.

import type { TranscriptionInput } from './types'
import {
  ELEVENLABS_KEYTERMS_MAX_ITEMS,
  ELEVENLABS_KEYTERM_MAX_CHARS,
  ELEVENLABS_KEYTERM_MAX_WORDS,
  GROQ_PROMPT_MAX_CHARS
} from './stt-hints-policy'

export interface NormalizedSttHints {
  contextText: string
  dictionaryTerms: string[]
}

export const normalizeSttHints = (hints: TranscriptionInput['sttHints']): NormalizedSttHints => {
  const contextText = hints?.contextText?.trim() ?? ''
  const rawTerms = hints?.dictionaryTerms ?? []

  const terms: string[] = []
  const seenLower = new Set<string>()

  for (const raw of rawTerms) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      continue
    }
    const lower = trimmed.toLowerCase()
    if (seenLower.has(lower)) {
      continue
    }
    seenLower.add(lower)
    terms.push(trimmed)
  }

  return { contextText, dictionaryTerms: terms }
}

export const buildGroqPromptFromHints = (hints: TranscriptionInput['sttHints']): string => {
  const normalized = normalizeSttHints(hints)
  if (normalized.contextText.length === 0 && normalized.dictionaryTerms.length === 0) {
    return ''
  }

  let remaining = GROQ_PROMPT_MAX_CHARS
  const segments: string[] = []

  if (normalized.contextText.length > 0 && remaining > 0) {
    const context = normalized.contextText.slice(0, remaining).trimEnd()
    if (context.length > 0) {
      segments.push(context)
      remaining -= context.length
    }
  }

  if (normalized.dictionaryTerms.length > 0 && remaining > 0) {
    // Add separator when context is already present.
    if (segments.length > 0 && remaining > 1) {
      segments.push('\n')
      remaining -= 1
    }

    const label = 'Vocabulary: '
    if (remaining > label.length) {
      const terms: string[] = []
      remaining -= label.length

      for (const term of normalized.dictionaryTerms) {
        const separator = terms.length === 0 ? '' : ', '
        const needed = separator.length + term.length
        if (needed > remaining) {
          break
        }
        if (separator.length > 0) {
          terms.push(separator)
        }
        terms.push(term)
        remaining -= needed
      }

      if (terms.length > 0) {
        segments.push(label, ...terms)
      }
    }
  }

  return segments.join('').trimEnd()
}

export const buildElevenLabsKeyterms = (hints: TranscriptionInput['sttHints']): string[] => {
  const normalized = normalizeSttHints(hints)
  const keyterms: string[] = []

  for (const term of normalized.dictionaryTerms) {
    if (term.length > ELEVENLABS_KEYTERM_MAX_CHARS) {
      continue
    }
    const wordCount = term.split(/\s+/).filter((word) => word.length > 0).length
    if (wordCount > ELEVENLABS_KEYTERM_MAX_WORDS) {
      continue
    }
    keyterms.push(term)
    if (keyterms.length >= ELEVENLABS_KEYTERMS_MAX_ITEMS) {
      break
    }
  }

  return keyterms
}
