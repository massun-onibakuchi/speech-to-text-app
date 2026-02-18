// Where: Shared module (main + renderer).
// What: Domain types, valibot schemas, defaults, and validation for Settings.
// Why: Single source of truth for app configuration shape and business rules.

import * as v from 'valibot'

// ---------------------------------------------------------------------------
// Job lifecycle types (unchanged — not part of Settings validation)
// ---------------------------------------------------------------------------

export const TERMINAL_JOB_STATUSES = [
  'succeeded',
  'capture_failed',
  'transcription_failed',
  'transformation_failed',
  'output_failed_partial'
] as const

export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number]

// Categorizes why a job failed — enables consumers to distinguish
// pre-network validation failures from post-network API/runtime errors.
// - preflight: missing API key, unsupported model/provider (blocked before network call)
// - api_auth:  HTTP 401/403 from provider API (key invalid or expired)
// - network:   connectivity / DNS / TLS errors
// - unknown:   any other runtime error
export type FailureCategory = 'preflight' | 'api_auth' | 'network' | 'unknown'

export const JOB_PROCESSING_STATES = [
  'queued',
  'transcribing',
  'transforming',
  'applying_output'
] as const

export type JobProcessingState = (typeof JOB_PROCESSING_STATES)[number]

// ---------------------------------------------------------------------------
// Provider / model / recording schemas — types inferred from schemas
// ---------------------------------------------------------------------------

export const SttProviderSchema = v.picklist(['groq', 'elevenlabs'])
export type SttProvider = v.InferOutput<typeof SttProviderSchema>

export const SttModelSchema = v.picklist(['whisper-large-v3-turbo', 'scribe_v2'])
export type SttModel = v.InferOutput<typeof SttModelSchema>

export const TransformProviderSchema = v.picklist(['google'])
export type TransformProvider = v.InferOutput<typeof TransformProviderSchema>

export const TransformModelSchema = v.picklist(['gemini-2.5-flash'])
export type TransformModel = v.InferOutput<typeof TransformModelSchema>

export const RecordingMethodSchema = v.picklist(['cpal'])
export type RecordingMethod = v.InferOutput<typeof RecordingMethodSchema>

export const RecordingSampleRateHzSchema = v.picklist([16000, 44100, 48000])
export type RecordingSampleRateHz = v.InferOutput<typeof RecordingSampleRateHzSchema>

// ---------------------------------------------------------------------------
// Model / recording allowlists — used by services for runtime validation
// ---------------------------------------------------------------------------

export const STT_MODEL_ALLOWLIST: Record<SttProvider, readonly SttModel[]> = {
  groq: ['whisper-large-v3-turbo'],
  elevenlabs: ['scribe_v2']
}

export const TRANSFORM_MODEL_ALLOWLIST: Record<TransformProvider, readonly TransformModel[]> = {
  google: ['gemini-2.5-flash']
}

export const RECORDING_METHOD_ALLOWLIST: readonly RecordingMethod[] = ['cpal']
export const RECORDING_SAMPLE_RATE_ALLOWLIST: readonly RecordingSampleRateHz[] = [16000, 44100, 48000]

// ---------------------------------------------------------------------------
// Nested object schemas
// ---------------------------------------------------------------------------

export const OutputRuleSchema = v.object({
  copyToClipboard: v.boolean(),
  pasteAtCursor: v.boolean()
})
export type OutputRule = v.InferOutput<typeof OutputRuleSchema>

export const OutputSettingsSchema = v.object({
  transcript: OutputRuleSchema,
  transformed: OutputRuleSchema
})
export type OutputSettings = v.InferOutput<typeof OutputSettingsSchema>

export const TransformationPresetSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  provider: TransformProviderSchema,
  model: TransformModelSchema,
  systemPrompt: v.string(),
  userPrompt: v.string(),
  shortcut: v.string()
})
export type TransformationPreset = v.InferOutput<typeof TransformationPresetSchema>

// ---------------------------------------------------------------------------
// Settings schema — structural + referential-integrity constraints
// ---------------------------------------------------------------------------

export const SettingsSchema = v.object({
  recording: v.object({
    mode: v.literal('manual'),
    method: RecordingMethodSchema,
    device: v.string(),
    autoDetectAudioSource: v.boolean(),
    detectedAudioSource: v.string(),
    maxDurationSec: v.nullable(v.number()),
    sampleRateHz: RecordingSampleRateHzSchema,
    channels: v.literal(1)
  }),
  transcription: v.object({
    provider: SttProviderSchema,
    model: SttModelSchema,
    baseUrlOverride: v.nullable(v.string()),
    compressAudioBeforeTranscription: v.boolean(),
    compressionPreset: v.literal('recommended'),
    outputLanguage: v.string(),
    temperature: v.number(),
    networkRetries: v.literal(2)
  }),
  transformation: v.pipe(
    v.object({
      enabled: v.boolean(),
      activePresetId: v.string(),
      defaultPresetId: v.string(),
      baseUrlOverride: v.nullable(v.string()),
      presets: v.pipe(v.array(TransformationPresetSchema), v.minLength(1)),
      autoRunDefaultTransform: v.boolean()
    }),
    v.check((val) => {
      const ids = new Set(val.presets.map((p) => p.id))
      return ids.has(val.activePresetId)
    }, 'Active transformation preset must reference an existing preset id'),
    v.check((val) => {
      const ids = new Set(val.presets.map((p) => p.id))
      return ids.has(val.defaultPresetId)
    }, 'Default transformation preset must reference an existing preset id')
  ),
  output: OutputSettingsSchema,
  shortcuts: v.object({
    startRecording: v.string(),
    stopRecording: v.string(),
    toggleRecording: v.string(),
    cancelRecording: v.string(),
    runTransform: v.string(),
    pickTransformation: v.string(),
    changeTransformationDefault: v.string()
  }),
  interfaceMode: v.object({
    value: v.picklist(['standard_app', 'menu_bar_utility'])
  }),
  history: v.object({
    maxItems: v.pipe(v.number(), v.integer(), v.minValue(1))
  }),
  runtime: v.object({
    minMacosVersion: v.string(),
    distribution: v.literal('direct_only'),
    crashReporting: v.literal('local_only')
  })
})

export type Settings = v.InferOutput<typeof SettingsSchema>

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

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
    baseUrlOverride: null,
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
    baseUrlOverride: null,
    presets: [
      {
        id: 'default',
        name: 'Default',
        provider: 'google',
        model: 'gemini-2.5-flash',
        systemPrompt: '',
        userPrompt: '',
        shortcut: 'Cmd+Opt+L'
      }
    ],
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string
  message: string
}

/**
 * Validates a Settings object: structural checks via valibot schema,
 * then cross-field business rules (model-provider allowlist pairing).
 */
export const validateSettings = (settings: Settings): ValidationError[] => {
  const errors: ValidationError[] = []

  // Structural validation via valibot (covers recording method/sampleRate,
  // preset count, preset id references, history.maxItems, etc.)
  const result = v.safeParse(SettingsSchema, settings)
  if (!result.success) {
    for (const issue of result.issues) {
      const path = issue.path?.map((p) => p.key).join('.') ?? 'unknown'
      errors.push({ field: path, message: issue.message })
    }
    // Return early — cross-field checks assume valid structure
    return errors
  }

  // Cross-field: STT model must be in allowlist for the chosen provider
  if (!STT_MODEL_ALLOWLIST[settings.transcription.provider].includes(settings.transcription.model)) {
    errors.push({
      field: 'transcription.model',
      message: `Model ${settings.transcription.model} is not allowed for provider ${settings.transcription.provider}`
    })
  }

  // Cross-field: each preset model must be in allowlist for its provider
  for (const preset of settings.transformation.presets) {
    if (!TRANSFORM_MODEL_ALLOWLIST[preset.provider].includes(preset.model)) {
      errors.push({
        field: `transformation.presets.${preset.id}.model`,
        message: `Model ${preset.model} is not allowed for provider ${preset.provider}`
      })
    }
  }

  return errors
}
