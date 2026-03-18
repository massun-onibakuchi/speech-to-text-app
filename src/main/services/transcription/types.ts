import type { CloudSttModel, CloudSttProvider } from '../../../shared/local-stt'

export interface TranscriptionInput {
  provider: CloudSttProvider
  model: CloudSttModel
  apiKey: string
  baseUrlOverride?: string | null
  audioFilePath: string
  language?: string
  temperature?: number
  sttHints?: {
    contextText?: string
    dictionaryTerms?: readonly string[]
  }
}

export interface TranscriptionResult {
  text: string
  provider: CloudSttProvider
  model: CloudSttModel
}

export interface TranscriptionAdapter {
  transcribe: (input: TranscriptionInput) => Promise<TranscriptionResult>
}

/**
 * Treats blank/"auto" as provider auto-detect (omit provider language parameter).
 * Explicit language overrides (e.g. `ja`, `en`, `eng`) are preserved.
 */
export const resolveTranscriptionLanguageOverride = (language: string | undefined): string | null => {
  if (typeof language !== 'string') {
    return null
  }
  const trimmed = language.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.toLowerCase() === 'auto') {
    return null
  }
  return trimmed
}
