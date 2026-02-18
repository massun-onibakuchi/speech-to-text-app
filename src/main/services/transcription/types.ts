import type { SttModel, SttProvider } from '../../../shared/domain'

export interface TranscriptionInput {
  provider: SttProvider
  model: SttModel
  apiKey: string
  baseUrlOverride?: string | null
  audioFilePath: string
  language?: string
  temperature?: number
}

export interface TranscriptionResult {
  text: string
  provider: SttProvider
  model: SttModel
}

export interface TranscriptionAdapter {
  transcribe: (input: TranscriptionInput) => Promise<TranscriptionResult>
}
