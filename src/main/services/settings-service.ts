// Where: Main process settings persistence layer.
// What: Validates and persists user settings via electron-store.
// Why: Settings survive app restarts (replaces previous in-memory-only storage).

import Store from 'electron-store'
import * as v from 'valibot'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, validateSettings } from '../../shared/domain'

export type SettingsStoreSchema = { settings: Settings }

export class SettingsService {
  private readonly store: Store<SettingsStoreSchema>

  constructor(store?: Store<SettingsStoreSchema>) {
    this.store = store ?? new Store<SettingsStoreSchema>({
      name: 'settings',
      defaults: { settings: DEFAULT_SETTINGS }
    })

    // Zero-backward-compat policy: parse persisted settings as-is against
    // current schema. Legacy/incompatible payloads are rejected at startup.
    const current = this.store.get('settings')
    const normalized = v.parse(SettingsSchema, current)
    // Persist whenever schema parsing strips deprecated/unknown keys.
    if (JSON.stringify(normalized) !== JSON.stringify(current)) {
      this.store.set('settings', normalized)
    }
  }

  getSettings(): Settings {
    return structuredClone(this.store.get('settings'))
  }

  setSettings(nextSettings: Settings): Settings {
    const errors = validateSettings(nextSettings)
    if (errors.length > 0) {
      throw new Error(`Invalid settings: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`)
    }

    // Persist the schema-parsed output so removed/unknown keys are stripped.
    const parsedSettings = v.parse(SettingsSchema, nextSettings)
    this.store.set('settings', structuredClone(parsedSettings))
    return this.getSettings()
  }
}
