// Where: Shared module (main + renderer).
// What: Local STT provider/model constants and platform capability helpers.
// Why: Keep the local streaming contract explicit and reusable across settings,
//      UI gating, and runtime validation without duplicating string literals.

export const LOCAL_STT_PROVIDER = 'local_whisperlivekit' as const
export const LOCAL_STT_MODEL = 'voxtral-mini-4b-realtime-mlx' as const

export const CLOUD_STT_PROVIDERS = ['groq', 'elevenlabs'] as const
export const CLOUD_STT_MODELS = ['whisper-large-v3-turbo', 'scribe_v2'] as const

export type LocalSttProvider = typeof LOCAL_STT_PROVIDER
export type LocalSttModel = typeof LOCAL_STT_MODEL
export type CloudSttProvider = (typeof CLOUD_STT_PROVIDERS)[number]
export type CloudSttModel = (typeof CLOUD_STT_MODELS)[number]

export interface RuntimePlatformInfo {
  platform: string
  arch: string
}

export const STT_PROVIDER_LABELS = {
  groq: 'Groq',
  elevenlabs: 'ElevenLabs',
  [LOCAL_STT_PROVIDER]: 'Local WhisperLiveKit'
} as const

export const STT_MODEL_LABELS = {
  'whisper-large-v3-turbo': 'whisper-large-v3-turbo',
  scribe_v2: 'scribe_v2',
  [LOCAL_STT_MODEL]: 'Voxtral Mini 4B Realtime [streaming]'
} as const

export const isLocalSttProvider = (provider: string): provider is LocalSttProvider =>
  provider === LOCAL_STT_PROVIDER

export const isCloudSttProvider = (provider: string): provider is CloudSttProvider =>
  CLOUD_STT_PROVIDERS.includes(provider as CloudSttProvider)

export const isCloudSttModel = (model: string): model is CloudSttModel =>
  CLOUD_STT_MODELS.includes(model as CloudSttModel)

export const isAppleSiliconMac = (runtimePlatform: RuntimePlatformInfo): boolean =>
  runtimePlatform.platform === 'darwin' && runtimePlatform.arch === 'arm64'

export const supportsLocalSttSelection = (runtimePlatform: RuntimePlatformInfo): boolean =>
  isAppleSiliconMac(runtimePlatform)
