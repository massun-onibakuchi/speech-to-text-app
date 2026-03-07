/*
Where: src/renderer/streaming-settings.ts
What: Pure helpers and labels for streaming settings UX and autosave mutations.
Why: Keep provider/mode defaults centralized so renderer UI and mutations stay
     aligned with the canonical streaming contracts in shared/domain.
*/

import {
  STREAMING_MODEL_ALLOWLIST,
  STREAMING_PROVIDER_TRANSPORT_ALLOWLIST,
  type ProcessingSettings,
  type SettingsProcessingMode,
  type StreamingLanguage,
  type StreamingProvider
} from '../shared/domain'

export const DEFAULT_STREAMING_PROVIDER: StreamingProvider = 'local_whispercpp_coreml'
export const DEFAULT_STREAMING_OUTPUT_MODE = 'stream_raw_dictation' as const

export const STREAMING_PROVIDER_LABELS: Record<StreamingProvider, string> = {
  local_whispercpp_coreml: 'Local whisper.cpp + Core ML',
  groq_whisper_large_v3_turbo: 'Groq Whisper Large v3 Turbo'
}

export const STREAMING_PROVIDER_HELP: Record<StreamingProvider, string> = {
  local_whispercpp_coreml: 'Native local stream. No cloud API key required.',
  groq_whisper_large_v3_turbo: 'Rolling-upload near-realtime chunks. Requires a saved Groq API key.'
}

export const STREAMING_LANGUAGE_LABELS: Record<StreamingLanguage, string> = {
  auto: 'Auto detect',
  en: 'English',
  ja: 'Japanese'
}

export const resolveStreamingProviderDefaults = (provider: StreamingProvider) => ({
  provider,
  transport: STREAMING_PROVIDER_TRANSPORT_ALLOWLIST[provider][0],
  model: STREAMING_MODEL_ALLOWLIST[provider][0],
  apiKeyRef: provider === 'groq_whisper_large_v3_turbo' ? ('groq' as const) : null
})

export const buildProcessingSettingsForMode = (
  current: ProcessingSettings,
  mode: SettingsProcessingMode
): ProcessingSettings => {
  if (mode === 'default') {
    return {
      ...current,
      mode: 'default',
      streaming: {
        ...current.streaming,
        enabled: false,
        outputMode: current.streaming.outputMode ?? DEFAULT_STREAMING_OUTPUT_MODE
      }
    }
  }

  const nextProvider = current.streaming.provider ?? DEFAULT_STREAMING_PROVIDER
  const providerDefaults = resolveStreamingProviderDefaults(nextProvider)

  return {
    ...current,
    mode: 'streaming',
    streaming: {
      ...current.streaming,
      ...providerDefaults,
      enabled: true,
      outputMode: DEFAULT_STREAMING_OUTPUT_MODE
    }
  }
}

export const buildProcessingSettingsForStreamingProvider = (
  current: ProcessingSettings,
  provider: StreamingProvider
): ProcessingSettings => {
  const providerDefaults = resolveStreamingProviderDefaults(provider)

  return {
    ...current,
    mode: 'streaming',
    streaming: {
      ...current.streaming,
      ...providerDefaults,
      enabled: true,
      outputMode: DEFAULT_STREAMING_OUTPUT_MODE
    }
  }
}

export const buildProcessingSettingsForStreamingLanguage = (
  current: ProcessingSettings,
  language: StreamingLanguage
): ProcessingSettings => ({
  ...current,
  streaming: {
    ...current.streaming,
    language
  }
})
