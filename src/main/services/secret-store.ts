// Where: Main process service for API key management.
// What: Stores and retrieves API keys with a three-tier fallback chain.
// Why: Centralizes secret access so callers don't care about the storage backend.

import { SafeStorageClient } from '../infrastructure/safe-storage-client'

type ApiProvider = 'groq' | 'elevenlabs' | 'google'

const ENV_KEY_BY_PROVIDER: Record<ApiProvider, string> = {
  groq: 'GROQ_APIKEY',
  elevenlabs: 'ELEVENLABS_APIKEY',
  google: 'GOOGLE_APIKEY'
}

export class SecretStore {
  private readonly safeStorageClient: SafeStorageClient
  private readonly volatileStore = new Map<ApiProvider, string>()

  constructor(safeStorageClient?: SafeStorageClient) {
    this.safeStorageClient = safeStorageClient ?? new SafeStorageClient()
  }

  setApiKey(provider: ApiProvider, apiKey: string): void {
    try {
      if (!this.safeStorageClient.isAvailable()) {
        throw new Error('safeStorage encryption not available')
      }
      this.safeStorageClient.setPassword(provider, apiKey)
      this.volatileStore.delete(provider)
    } catch {
      // Fallback: keep in volatile memory for dev/CI/non-macOS environments.
      this.volatileStore.set(provider, apiKey)
    }
  }

  getApiKey(provider: ApiProvider): string | null {
    // Tier 1: safeStorage-backed encrypted store
    try {
      if (this.safeStorageClient.isAvailable()) {
        const value = this.safeStorageClient.getPassword(provider)
        if (value && value.length > 0) return value
      }
    } catch {
      // Fall through to next tier
    }

    // Tier 2: volatile in-process storage
    const volatileValue = this.volatileStore.get(provider)
    if (volatileValue && volatileValue.length > 0) return volatileValue

    // Tier 3: environment variables (dev/CI)
    const envKey = ENV_KEY_BY_PROVIDER[provider]
    const envValue = process.env[envKey]
    return envValue && envValue.trim().length > 0 ? envValue.trim() : null
  }
}
