import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { resolveTranscriptionLanguageOverride, type TranscriptionAdapter, type TranscriptionInput, type TranscriptionResult } from './types'
import { resolveProviderEndpoint } from '../endpoint-resolver'

interface GroqResponse {
  text?: string
}

export class GroqTranscriptionAdapter implements TranscriptionAdapter {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const audioBuffer = readFileSync(input.audioFilePath)

    const formData = new FormData()
    formData.append('model', input.model)
    formData.append('file', new Blob([audioBuffer]), basename(input.audioFilePath))

    const languageOverride = resolveTranscriptionLanguageOverride(input.language)
    if (languageOverride) {
      formData.append('language', languageOverride)
    }

    if (typeof input.temperature === 'number') {
      formData.append('temperature', String(input.temperature))
    }

    const endpoint = resolveGroqEndpoint(input.baseUrlOverride)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Groq transcription failed with status ${response.status}`)
    }

    const data = (await response.json()) as GroqResponse
    return {
      text: data.text ?? '',
      provider: 'groq',
      model: input.model
    }
  }
}

const GROQ_DEFAULT_BASE = 'https://api.groq.com'
const GROQ_STT_PATH = '/openai/v1/audio/transcriptions'

const resolveGroqEndpoint = (baseUrlOverride?: string | null): string =>
  resolveProviderEndpoint(GROQ_DEFAULT_BASE, GROQ_STT_PATH, baseUrlOverride)
