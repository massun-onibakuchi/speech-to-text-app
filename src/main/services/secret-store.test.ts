import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecretStore } from './secret-store'

describe('SecretStore', () => {
  afterEach(() => {
    delete process.env.GOOGLE_APIKEY
    delete process.env.GROQ_APIKEY
    delete process.env.ELEVENLABS_APIKEY
  })

  it('falls back to volatile in-process storage when keychain write fails', () => {
    const keychainClient = {
      setPassword: vi.fn(() => {
        throw new Error('security binary missing')
      }),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(keychainClient as any)
    store.setApiKey('google', 'runtime-google-key')

    expect(store.getApiKey('google')).toBe('runtime-google-key')
  })

  it('falls back to env var when keychain and volatile storage are empty', () => {
    process.env.GOOGLE_APIKEY = 'env-google-key'

    const keychainClient = {
      setPassword: vi.fn(),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(keychainClient as any)
    expect(store.getApiKey('google')).toBe('env-google-key')
  })
})
