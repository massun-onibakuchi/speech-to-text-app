import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock electron and electron-store so the SafeStorageClient module can load without the Electron binary.
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' } }))
vi.mock('electron-store', () => ({ default: class { get() { return {} } set() {} } }))

import { SecretStore } from './secret-store'

const originalGoogleApiKey = process.env.GOOGLE_APIKEY
const originalGroqApiKey = process.env.GROQ_APIKEY
const originalElevenLabsApiKey = process.env.ELEVENLABS_APIKEY

describe('SecretStore', () => {
  afterEach(() => {
    if (originalGoogleApiKey === undefined) {
      delete process.env.GOOGLE_APIKEY
    } else {
      process.env.GOOGLE_APIKEY = originalGoogleApiKey
    }
    if (originalGroqApiKey === undefined) {
      delete process.env.GROQ_APIKEY
    } else {
      process.env.GROQ_APIKEY = originalGroqApiKey
    }
    if (originalElevenLabsApiKey === undefined) {
      delete process.env.ELEVENLABS_APIKEY
    } else {
      process.env.ELEVENLABS_APIKEY = originalElevenLabsApiKey
    }
  })

  it('falls back to volatile in-process storage when safeStorage is unavailable', () => {
    const mockClient = {
      isAvailable: vi.fn(() => false),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(mockClient as any)
    store.setApiKey('google', 'runtime-google-key')

    expect(store.getApiKey('google')).toBe('runtime-google-key')
  })

  it('falls back to env var when safeStorage and volatile storage are empty', () => {
    process.env.GOOGLE_APIKEY = 'env-google-key'

    const mockClient = {
      isAvailable: vi.fn(() => false),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(mockClient as any)
    expect(store.getApiKey('google')).toBe('env-google-key')
  })

  it('does not fall back to env var after explicitly clearing key in volatile storage', () => {
    process.env.GOOGLE_APIKEY = 'env-google-key'

    const mockClient = {
      isAvailable: vi.fn(() => false),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(mockClient as any)
    store.setApiKey('google', '')
    expect(store.getApiKey('google')).toBeNull()
  })

  it('reads from safeStorage when encryption is available', () => {
    const mockClient = {
      isAvailable: vi.fn(() => true),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => 'safe-stored-key')
    }

    const store = new SecretStore(mockClient as any)
    expect(store.getApiKey('groq')).toBe('safe-stored-key')
    expect(mockClient.getPassword).toHaveBeenCalledWith('groq')
  })

  it('stores via safeStorage when encryption is available', () => {
    const mockClient = {
      isAvailable: vi.fn(() => true),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => null)
    }

    const store = new SecretStore(mockClient as any)
    store.setApiKey('elevenlabs', 'my-api-key')

    expect(mockClient.setPassword).toHaveBeenCalledWith('elevenlabs', 'my-api-key')
  })

  it('does not fall back to env var when safeStorage has explicit empty value', () => {
    process.env.GOOGLE_APIKEY = 'env-google-key'

    const mockClient = {
      isAvailable: vi.fn(() => true),
      setPassword: vi.fn(),
      getPassword: vi.fn(() => '')
    }

    const store = new SecretStore(mockClient as any)
    expect(store.getApiKey('google')).toBeNull()
  })
})
