import { KeychainClient } from '../infrastructure/keychain-client'

type ApiProvider = 'groq' | 'elevenlabs' | 'google'

const ENV_KEY_BY_PROVIDER: Record<ApiProvider, string> = {
  groq: 'GROQ_APIKEY',
  elevenlabs: 'ELEVENLABS_APIKEY',
  google: 'GOOGLE_APIKEY'
}

export class SecretStore {
  private readonly keychainClient: KeychainClient
  private readonly volatileStore = new Map<ApiProvider, string>()

  constructor(keychainClient?: KeychainClient) {
    this.keychainClient = keychainClient ?? new KeychainClient()
  }

  setApiKey(provider: ApiProvider, apiKey: string): void {
    try {
      this.keychainClient.setPassword('speech-to-text-v1', provider, apiKey)
      this.volatileStore.delete(provider)
    } catch {
      // Non-macOS environments may not have the `security` binary.
      // Keep runtime behavior functional for local/dev and E2E sessions.
      this.volatileStore.set(provider, apiKey)
    }
  }

  getApiKey(provider: ApiProvider): string | null {
    const keychainValue = this.keychainClient.getPassword('speech-to-text-v1', provider)
    if (keychainValue && keychainValue.length > 0) {
      return keychainValue
    }

    const volatileValue = this.volatileStore.get(provider)
    if (volatileValue && volatileValue.length > 0) {
      return volatileValue
    }

    const envKey = ENV_KEY_BY_PROVIDER[provider]
    const envValue = process.env[envKey]
    return envValue && envValue.trim().length > 0 ? envValue.trim() : null
  }
}
