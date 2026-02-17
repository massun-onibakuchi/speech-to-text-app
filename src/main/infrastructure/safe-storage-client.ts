// Where: Main process infrastructure for encrypted secret storage.
// What: Encrypts API keys using Electron safeStorage, persists encrypted blobs via electron-store.
// Why: Cross-platform replacement for macOS-only `security` CLI (keychain-client).

import { safeStorage } from 'electron'
import Store from 'electron-store'

interface EncryptedSecrets {
  [account: string]: string // base64-encoded encrypted buffer
}

export interface SafeStorageClientDeps {
  store: Store<{ secrets: EncryptedSecrets }>
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export class SafeStorageClient {
  private readonly store: Store<{ secrets: EncryptedSecrets }>
  private readonly encrypt: (plainText: string) => Buffer
  private readonly decrypt: (encrypted: Buffer) => string
  private readonly checkAvailable: () => boolean

  constructor(deps?: SafeStorageClientDeps) {
    this.store = deps?.store ?? new Store<{ secrets: EncryptedSecrets }>({
      name: 'secrets',
      defaults: { secrets: {} }
    })
    this.checkAvailable = deps?.isEncryptionAvailable ?? (() => safeStorage.isEncryptionAvailable())
    this.encrypt = deps?.encryptString ?? ((text) => safeStorage.encryptString(text))
    this.decrypt = deps?.decryptString ?? ((buf) => safeStorage.decryptString(buf))
  }

  isAvailable(): boolean {
    return this.checkAvailable()
  }

  setPassword(account: string, password: string): void {
    const encrypted = this.encrypt(password)
    const secrets = this.store.get('secrets')
    secrets[account] = encrypted.toString('base64')
    this.store.set('secrets', secrets)
  }

  getPassword(account: string): string | null {
    const secrets = this.store.get('secrets')
    const encoded = secrets[account]
    if (!encoded) return null
    const buffer = Buffer.from(encoded, 'base64')
    return this.decrypt(buffer)
  }
}
