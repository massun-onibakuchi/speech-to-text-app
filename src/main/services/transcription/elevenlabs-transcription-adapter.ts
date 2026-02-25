import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { resolveTranscriptionLanguageOverride, type TranscriptionAdapter, type TranscriptionInput, type TranscriptionResult } from './types'
import { resolveProviderEndpoint } from '../endpoint-resolver'

interface ElevenLabsResponse {
  text?: string
}

export class ElevenLabsTranscriptionAdapter implements TranscriptionAdapter {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const audioBuffer = readFileSync(input.audioFilePath)

    const formData = new FormData()
    formData.append('model_id', input.model)
    formData.append('file', new Blob([audioBuffer]), basename(input.audioFilePath))
    const languageOverride = resolveTranscriptionLanguageOverride(input.language)
    if (languageOverride) {
      formData.append('language_code', languageOverride)
    }

    const endpoint = resolveElevenLabsEndpoint(input.baseUrlOverride)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': input.apiKey
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs transcription failed with status ${response.status}`)
    }

    const data = (await response.json()) as ElevenLabsResponse
    return {
      text: data.text ?? '',
      provider: 'elevenlabs',
      model: input.model
    }
  }
}

const ELEVENLABS_DEFAULT_BASE = 'https://api.elevenlabs.io'
const ELEVENLABS_STT_PATH = '/v1/speech-to-text'

const resolveElevenLabsEndpoint = (baseUrlOverride?: string | null): string =>
  resolveProviderEndpoint(ELEVENLABS_DEFAULT_BASE, ELEVENLABS_STT_PATH, baseUrlOverride)
