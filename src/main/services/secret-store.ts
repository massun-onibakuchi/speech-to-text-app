import { KeychainClient } from '../infrastructure/keychain-client'

export class SecretStore {
  private readonly keychainClient: KeychainClient

  constructor(keychainClient?: KeychainClient) {
    this.keychainClient = keychainClient ?? new KeychainClient()
  }

  setApiKey(provider: 'groq' | 'elevenlabs' | 'google', apiKey: string): void {
    this.keychainClient.setPassword('speech-to-text-v1', provider, apiKey)
  }

  getApiKey(provider: 'groq' | 'elevenlabs' | 'google'): string | null {
    return this.keychainClient.getPassword('speech-to-text-v1', provider)
  }
}
