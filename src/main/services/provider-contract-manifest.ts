export interface ProviderContract {
  provider: 'groq' | 'elevenlabs' | 'gemini'
  endpoint: string
  apiVersionSurface: string
  authMethod: string
  modelAllowlist: string[]
  lastVerifiedAt: string
}

export const PROVIDER_CONTRACT_MANIFEST: ProviderContract[] = [
  {
    provider: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    apiVersionSurface: 'openai-v1',
    authMethod: 'Authorization: Bearer <key>',
    modelAllowlist: ['whisper-large-v3-turbo'],
    lastVerifiedAt: '2026-02-14'
  },
  {
    provider: 'elevenlabs',
    endpoint: 'https://api.elevenlabs.io/v1/speech-to-text',
    apiVersionSurface: 'v1',
    authMethod: 'xi-api-key: <key>',
    modelAllowlist: ['scribe_v2'],
    lastVerifiedAt: '2026-02-14'
  },
  {
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    apiVersionSurface: 'v1beta',
    authMethod: 'x-goog-api-key: <key>',
    modelAllowlist: ['gemini-2.5-flash'],
    lastVerifiedAt: '2026-02-18'
  }
]

export const validateProviderContractManifest = (): string[] => {
  const errors: string[] = []

  for (const contract of PROVIDER_CONTRACT_MANIFEST) {
    if (!contract.endpoint.startsWith('https://')) {
      errors.push(`${contract.provider}: endpoint must be https`) 
    }

    if (contract.modelAllowlist.length === 0) {
      errors.push(`${contract.provider}: model allowlist cannot be empty`)
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.lastVerifiedAt)) {
      errors.push(`${contract.provider}: lastVerifiedAt must be ISO date`) 
    }
  }

  return errors
}
