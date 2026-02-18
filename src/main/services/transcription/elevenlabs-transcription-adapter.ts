import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { TranscriptionAdapter, TranscriptionInput, TranscriptionResult } from './types'

interface ElevenLabsResponse {
  text?: string
}

export class ElevenLabsTranscriptionAdapter implements TranscriptionAdapter {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const audioBuffer = readFileSync(input.audioFilePath)

    const formData = new FormData()
    formData.append('model_id', input.model)
    formData.append('file', new Blob([audioBuffer]), basename(input.audioFilePath))

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

const ELEVENLABS_DEFAULT_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text'

const resolveElevenLabsEndpoint = (baseUrlOverride?: string | null): string => {
  if (!baseUrlOverride || baseUrlOverride.trim().length === 0) {
    return ELEVENLABS_DEFAULT_ENDPOINT
  }

  const normalizedBase = baseUrlOverride.replace(/\/+$/u, '')
  return `${normalizedBase}/v1/speech-to-text`
}
