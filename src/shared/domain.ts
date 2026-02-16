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
export type TransformModel = 'gemini-1.5-flash-8b' | 'gemini-2.5-flash'
export type RecordingMethod = 'cpal'
export type RecordingSampleRateHz = 16000 | 44100 | 48000

export const STT_MODEL_ALLOWLIST: Record<SttProvider, readonly SttModel[]> = {
  groq: ['whisper-large-v3-turbo'],
  elevenlabs: ['scribe_v2']
}

export const TRANSFORM_MODEL_ALLOWLIST: Record<TransformProvider, readonly TransformModel[]> = {
  google: ['gemini-1.5-flash-8b', 'gemini-2.5-flash']
}

export const RECORDING_METHOD_ALLOWLIST: readonly RecordingMethod[] = ['cpal']
export const RECORDING_SAMPLE_RATE_ALLOWLIST: readonly RecordingSampleRateHz[] = [16000, 44100, 48000]

export interface OutputRule {
  copyToClipboard: boolean
  pasteAtCursor: boolean
}

export interface OutputSettings {
  transcript: OutputRule
  transformed: OutputRule
}

export interface TransformationPreset {
  id: string
  name: string
  provider: TransformProvider
  model: TransformModel
  systemPrompt: string
  userPrompt: string
  shortcut: string
}

export interface Settings {
  recording: {
    mode: 'manual'
    method: RecordingMethod
    device: string
    autoDetectAudioSource: boolean
    detectedAudioSource: string
    maxDurationSec: number | null
    sampleRateHz: RecordingSampleRateHz
    channels: 1
  }
  transcription: {
    provider: SttProvider
    model: SttModel
    compressAudioBeforeTranscription: boolean
    compressionPreset: 'recommended'
    outputLanguage: 'auto' | string
    temperature: number
    networkRetries: 2
  }
  transformation: {
    enabled: boolean
    activePresetId: string
    defaultPresetId: string
    presets: TransformationPreset[]
    autoRunDefaultTransform: boolean
  }
  output: OutputSettings
  shortcuts: {
    startRecording: string
    stopRecording: string
    toggleRecording: string
    cancelRecording: string
    runTransform: string
    pickTransformation: string
    changeTransformationDefault: string
  }
  interfaceMode: {
    value: 'standard_app' | 'menu_bar_utility'
  }
  history: {
    maxItems: number
  }
  runtime: {
    minMacosVersion: string
    distribution: 'direct_only'
    crashReporting: 'local_only'
  }
}

export const DEFAULT_SETTINGS: Settings = {
  recording: {
    mode: 'manual',
    method: 'cpal',
    device: 'system_default',
    autoDetectAudioSource: true,
    detectedAudioSource: 'system_default',
    maxDurationSec: null,
    sampleRateHz: 16000,
    channels: 1
  },
  transcription: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    compressAudioBeforeTranscription: true,
    compressionPreset: 'recommended',
    outputLanguage: 'auto',
    temperature: 0,
    networkRetries: 2
  },
  transformation: {
    enabled: true,
    activePresetId: 'default',
    defaultPresetId: 'default',
    presets: [
      {
        id: 'default',
        name: 'Default',
        provider: 'google',
        model: 'gemini-1.5-flash-8b',
        systemPrompt: '',
        userPrompt: '',
        shortcut: 'Cmd+Opt+L'
      }
    ],
    autoRunDefaultTransform: false,
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
  },
  shortcuts: {
    startRecording: 'Cmd+Opt+R',
    stopRecording: 'Cmd+Opt+S',
    toggleRecording: 'Cmd+Opt+T',
    cancelRecording: 'Cmd+Opt+C',
    runTransform: 'Cmd+Opt+L',
    pickTransformation: 'Cmd+Opt+P',
    changeTransformationDefault: 'Cmd+Opt+M'
  },
  interfaceMode: {
    value: 'standard_app'
  },
  history: {
    maxItems: 10
  },
  runtime: {
    minMacosVersion: '15.0',
    distribution: 'direct_only',
    crashReporting: 'local_only'
  }
}

export interface ValidationError {
  field: string
  message: string
}

export const validateSettings = (settings: Settings): ValidationError[] => {
  const errors: ValidationError[] = []

  if (!RECORDING_METHOD_ALLOWLIST.includes(settings.recording.method)) {
    errors.push({
      field: 'recording.method',
      message: `Recording method ${settings.recording.method} is not supported`
    })
  }

  if (!RECORDING_SAMPLE_RATE_ALLOWLIST.includes(settings.recording.sampleRateHz)) {
    errors.push({
      field: 'recording.sampleRateHz',
      message: `Recording sample rate ${settings.recording.sampleRateHz} is not supported`
    })
  }

  if (!STT_MODEL_ALLOWLIST[settings.transcription.provider].includes(settings.transcription.model)) {
    errors.push({
      field: 'transcription.model',
      message: `Model ${settings.transcription.model} is not allowed for provider ${settings.transcription.provider}`
    })
  }

  if (settings.transformation.presets.length < 1) {
    errors.push({
      field: 'transformation.presets',
      message: 'At least one transformation preset is required'
    })
  }

  const presetIds = new Set(settings.transformation.presets.map((preset) => preset.id))
  if (!presetIds.has(settings.transformation.activePresetId)) {
    errors.push({
      field: 'transformation.activePresetId',
      message: 'Active transformation preset must reference an existing preset id'
    })
  }

  if (!presetIds.has(settings.transformation.defaultPresetId)) {
    errors.push({
      field: 'transformation.defaultPresetId',
      message: 'Default transformation preset must reference an existing preset id'
    })
  }

  for (const preset of settings.transformation.presets) {
    if (!TRANSFORM_MODEL_ALLOWLIST[preset.provider].includes(preset.model)) {
      errors.push({
        field: `transformation.presets.${preset.id}.model`,
        message: `Model ${preset.model} is not allowed for provider ${preset.provider}`
      })
    }
  }

  if (settings.history.maxItems < 1) {
    errors.push({
      field: 'history.maxItems',
      message: 'History maxItems must be at least 1'
    })
  }

  return errors
}
