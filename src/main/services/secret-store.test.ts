import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock electron and electron-store so the SafeStorageClient module can load without the Electron binary.
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' } }))
vi.mock('electron-store', () => ({ default: class { get() { return {} } set() {} } }))

import { SecretStore } from './secret-store'

describe('SecretStore', () => {
  afterEach(() => {
    delete process.env.GOOGLE_APIKEY
    delete process.env.GROQ_APIKEY
    delete process.env.ELEVENLABS_APIKEY
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
})
