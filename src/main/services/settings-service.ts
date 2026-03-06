// Where: Main process settings persistence layer.
// What: Validates and persists user settings via electron-store.
// Why: Settings survive app restarts (replaces previous in-memory-only storage).

import Store from 'electron-store'
import * as v from 'valibot'
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  normalizeSettingsForPersistence,
  type Settings,
  validateSettings
} from '../../shared/domain'

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
    const parsedSettings = v.parse(SettingsSchema, this.store.get('settings'))
    const validationErrors = validateSettings(parsedSettings)
    if (validationErrors.length > 0) {
      throw new Error(`Invalid settings: ${validationErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`)
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

    const normalizedSettings = normalizeSettingsForPersistence(nextSettings)
    // Persist validated current-schema settings only.
    const parsedSettings = v.parse(SettingsSchema, normalizedSettings)
    this.store.set('settings', structuredClone(parsedSettings))
    return this.getSettings()
  }
}
