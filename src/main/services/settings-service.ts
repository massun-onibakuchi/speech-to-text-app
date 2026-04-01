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
import { DEFAULT_CLEANUP_SETTINGS } from '../../shared/local-llm'

export type SettingsStoreSchema = { settings: Settings }

export class SettingsService {
  private readonly store: Store<SettingsStoreSchema>

  constructor(store?: Store<SettingsStoreSchema>) {
    this.store = store ?? new Store<SettingsStoreSchema>({
      name: 'settings',
      defaults: { settings: DEFAULT_SETTINGS }
    })

    // Parse persisted settings through the current schema so invalid shortcut
    // values are repaired before callers read or register them.
    const parsedSettings = v.parse(SettingsSchema, normalizeMissingCleanupSettings(this.store.get('settings')))
    const validationErrors = validateSettings(parsedSettings)
    if (validationErrors.length > 0) {
      throw new Error(`Invalid settings: ${validationErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`)
    }
    const normalizedSettings = normalizeSettingsForPersistence(parsedSettings)
    this.store.set('settings', structuredClone(normalizedSettings))
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

const normalizeMissingCleanupSettings = (rawSettings: unknown): unknown => {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return rawSettings
  }

  const candidate = rawSettings as Record<string, unknown>
  const rawCleanup = candidate.cleanup
  if (!rawCleanup || typeof rawCleanup !== 'object' || Array.isArray(rawCleanup)) {
    return {
      ...candidate,
      cleanup: structuredClone(DEFAULT_CLEANUP_SETTINGS)
    }
  }

  return {
    ...candidate,
    cleanup: {
      ...structuredClone(DEFAULT_CLEANUP_SETTINGS),
      ...rawCleanup
    }
  }
}
