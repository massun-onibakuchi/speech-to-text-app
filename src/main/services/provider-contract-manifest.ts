import type { StreamingTransportKind } from '../../shared/domain'

export interface ProviderContract {
  provider: 'groq' | 'elevenlabs' | 'gemini' | 'local_whispercpp_coreml'
  endpoint: string | null
  apiVersionSurface: string
  authMethod: string
  modelAllowlist: string[]
  streamingTransport: StreamingTransportKind | null
  streamingModelAllowlist: string[]
  lastVerifiedAt: string
}

export const PROVIDER_CONTRACT_MANIFEST: ProviderContract[] = [
  {
    provider: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    apiVersionSurface: 'openai-v1',
    authMethod: 'Authorization: Bearer <key>',
    modelAllowlist: ['whisper-large-v3-turbo'],
    streamingTransport: 'rolling_upload',
    streamingModelAllowlist: ['whisper-large-v3-turbo'],
    lastVerifiedAt: '2026-03-07'
  },
  {
    provider: 'elevenlabs',
    endpoint: 'https://api.elevenlabs.io/v1/speech-to-text',
    apiVersionSurface: 'v1',
    authMethod: 'xi-api-key: <key>',
    modelAllowlist: ['scribe_v2'],
    streamingTransport: null,
    streamingModelAllowlist: [],
    lastVerifiedAt: '2026-03-07'
  },
  {
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    apiVersionSurface: 'v1beta',
    authMethod: 'x-goog-api-key: <key>',
    modelAllowlist: ['gemini-2.5-flash'],
    streamingTransport: null,
    streamingModelAllowlist: [],
    lastVerifiedAt: '2026-03-07'
  },
  {
    provider: 'local_whispercpp_coreml',
    endpoint: null,
    apiVersionSurface: 'whisper.cpp-stream',
    authMethod: 'local runtime',
    modelAllowlist: ['ggml-large-v3-turbo-q5_0'],
    streamingTransport: 'native_stream',
    streamingModelAllowlist: ['ggml-large-v3-turbo-q5_0'],
    lastVerifiedAt: '2026-03-07'
  }
]

export const validateProviderContractManifest = (): string[] => {
  const errors: string[] = []

  for (const contract of PROVIDER_CONTRACT_MANIFEST) {
    if (contract.endpoint !== null && !contract.endpoint.startsWith('https://')) {
      errors.push(`${contract.provider}: endpoint must be https`) 
    }

    if (contract.provider === 'local_whispercpp_coreml' && contract.endpoint !== null) {
      errors.push(`${contract.provider}: local provider endpoint must be null`)
    }

    if (contract.provider !== 'local_whispercpp_coreml' && contract.endpoint === null) {
      errors.push(`${contract.provider}: remote provider endpoint cannot be null`)
    }

    if (contract.modelAllowlist.length === 0) {
      errors.push(`${contract.provider}: model allowlist cannot be empty`)
    }

    if (contract.streamingTransport === null && contract.streamingModelAllowlist.length > 0) {
      errors.push(`${contract.provider}: streaming model allowlist requires a streaming transport`)
    }

    if (contract.streamingTransport !== null && contract.streamingModelAllowlist.length === 0) {
      errors.push(`${contract.provider}: streaming transport requires a streaming model allowlist`)
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.lastVerifiedAt)) {
      errors.push(`${contract.provider}: lastVerifiedAt must be ISO date`) 
    }
  }

  return errors
}
