import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { TranscriptionAdapter, TranscriptionInput, TranscriptionResult } from './types'

interface GroqResponse {
  text?: string
}

export class GroqTranscriptionAdapter implements TranscriptionAdapter {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const audioBuffer = readFileSync(input.audioFilePath)

    const formData = new FormData()
    formData.append('model', input.model)
    formData.append('file', new Blob([audioBuffer]), basename(input.audioFilePath))

    if (input.language) {
      formData.append('language', input.language)
    }

    if (typeof input.temperature === 'number') {
      formData.append('temperature', String(input.temperature))
    }

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
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
