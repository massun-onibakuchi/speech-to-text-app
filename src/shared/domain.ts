export const TERMINAL_JOB_STATUSES = [
  'succeeded',
  'capture_failed',
  'transcription_failed',
  'transformation_failed',
  'output_failed_partial'
] as const

export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number]

export const JOB_PROCESSING_STATES = [
  'queued',
  'transcribing',
  'transforming',
  'applying_output'
] as const

export type JobProcessingState = (typeof JOB_PROCESSING_STATES)[number]

export type SttProvider = 'groq' | 'elevenlabs'
export type SttModel = 'whisper-large-v3-turbo' | 'scribe_v2'
export type TransformProvider = 'google'
export type TransformModel = 'gemini-1.5-flash-8b'

export const STT_MODEL_ALLOWLIST: Record<SttProvider, readonly SttModel[]> = {
  groq: ['whisper-large-v3-turbo'],
  elevenlabs: ['scribe_v2']
}

export const TRANSFORM_MODEL_ALLOWLIST: Record<TransformProvider, readonly TransformModel[]> = {
  google: ['gemini-1.5-flash-8b']
}

export interface OutputRule {
  copyToClipboard: boolean
  pasteAtCursor: boolean
}

export interface OutputSettings {
  transcript: OutputRule
  transformed: OutputRule
}

export interface Settings {
  recording: {
    mode: 'manual'
    method: 'ffmpeg'
    sampleRateHz: number
    channels: 1
  }
  transcription: {
    provider: SttProvider
    model: SttModel
    outputLanguage: 'auto' | string
    temperature: number
    networkRetries: 2
  }
  transformation: {
    enabled: boolean
    provider: TransformProvider
    model: TransformModel
    autoRunDefaultTransform: boolean
  }
  output: OutputSettings
}

export const DEFAULT_SETTINGS: Settings = {
  recording: {
    mode: 'manual',
    method: 'ffmpeg',
    sampleRateHz: 16000,
    channels: 1
  },
  transcription: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    outputLanguage: 'auto',
    temperature: 0,
    networkRetries: 2
  },
  transformation: {
    enabled: true,
    provider: 'google',
    model: 'gemini-1.5-flash-8b',
    autoRunDefaultTransform: false
  },
  output: {
    transcript: {
      copyToClipboard: true,
      pasteAtCursor: false
    },
    transformed: {
      copyToClipboard: true,
      pasteAtCursor: false
    }
  }
}

export interface ValidationError {
  field: string
  message: string
}

export const validateSettings = (settings: Settings): ValidationError[] => {
  const errors: ValidationError[] = []
  if (!STT_MODEL_ALLOWLIST[settings.transcription.provider].includes(settings.transcription.model)) {
    errors.push({
      field: 'transcription.model',
      message: `Model ${settings.transcription.model} is not allowed for provider ${settings.transcription.provider}`
    })
  }

  if (!TRANSFORM_MODEL_ALLOWLIST[settings.transformation.provider].includes(settings.transformation.model)) {
    errors.push({
      field: 'transformation.model',
      message: `Model ${settings.transformation.model} is not allowed for provider ${settings.transformation.provider}`
    })
  }

  return errors
}
