// Where: src/main/services/transcription/dictionary-hint-deriver.ts
// What: Derives STT hint terms from dictionary entries while preserving base context text.
// Why: Keep adapter-agnostic dictionary-to-hints mapping deterministic and reusable.

import type { DictionaryEntry, SttHints } from '../../../shared/domain'

export const deriveSttHintsFromDictionary = (
  baseHints: Pick<SttHints, 'contextText'>,
  entries: readonly DictionaryEntry[]
): SttHints => {
  const mergedTerms = dedupeCaseInsensitive(entries.map((entry) => entry.key))

  return {
    contextText: baseHints.contextText,
    dictionaryTerms: mergedTerms
  }
}

const dedupeCaseInsensitive = (terms: readonly string[]): string[] => {
  const deduped: string[] = []
  const seenLower = new Set<string>()

  for (const term of terms) {
    const normalized = term.trim()
    if (normalized.length === 0) {
      continue
    }
    const lower = normalized.toLowerCase()
    if (seenLower.has(lower)) {
      continue
    }
    seenLower.add(lower)
    deduped.push(normalized)
  }

  return deduped
}
