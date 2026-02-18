// Where: Main process settings persistence layer.
// What: Validates and persists user settings via electron-store.
// Why: Settings survive app restarts (replaces previous in-memory-only storage).

import Store from 'electron-store'
import { DEFAULT_SETTINGS, type Settings, validateSettings } from '../../shared/domain'

export type SettingsStoreSchema = { settings: Settings }

export class SettingsService {
  private readonly store: Store<SettingsStoreSchema>

  constructor(store?: Store<SettingsStoreSchema>) {
    this.store = store ?? new Store<SettingsStoreSchema>({
      name: 'settings',
      defaults: { settings: DEFAULT_SETTINGS }
    })

    // Phase 4 migration: remove deprecated Gemini model fallback dependency.
    const current = this.store.get('settings')
    const migrated = migrateDeprecatedGeminiModel(current)
    if (migrated) {
      this.store.set('settings', migrated)
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

    this.store.set('settings', structuredClone(nextSettings))
    return this.getSettings()
  }
}

const migrateDeprecatedGeminiModel = (settings: Settings): Settings | null => {
  let changed = false
  const migratedPresets = settings.transformation.presets.map((preset) => {
    if ((preset.model as string) !== 'gemini-1.5-flash-8b') {
      return preset
    }
    changed = true
    return {
      ...preset,
      model: 'gemini-2.5-flash'
    }
  })

  if (!changed) {
    return null
  }

  return {
    ...settings,
    transformation: {
      ...settings.transformation,
      presets: migratedPresets
    }
  }
}
