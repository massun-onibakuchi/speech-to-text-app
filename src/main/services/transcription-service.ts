import { STT_MODEL_ALLOWLIST, type SttProvider } from '../../shared/domain'
import { ElevenLabsTranscriptionAdapter } from './transcription/elevenlabs-transcription-adapter'
import { GroqTranscriptionAdapter } from './transcription/groq-transcription-adapter'
import type { TranscriptionAdapter, TranscriptionInput, TranscriptionResult } from './transcription/types'

export class TranscriptionService {
  private readonly adapters: Record<SttProvider, TranscriptionAdapter>

  constructor(adapters?: Partial<Record<SttProvider, TranscriptionAdapter>>) {
    this.adapters = {
      groq: adapters?.groq ?? new GroqTranscriptionAdapter(),
      elevenlabs: adapters?.elevenlabs ?? new ElevenLabsTranscriptionAdapter()
    }
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const allowedModels = STT_MODEL_ALLOWLIST[input.provider]
    if (!allowedModels.includes(input.model)) {
      throw new Error(`Model ${input.model} is not allowed for provider ${input.provider}`)
    }

    const adapter = this.adapters[input.provider]
    return adapter.transcribe(input)
  }
}
