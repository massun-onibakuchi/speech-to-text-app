// Where: Main process settings persistence layer.
// What: Validates and persists user settings via electron-store.
// Why: Settings survive app restarts (replaces previous in-memory-only storage).

import Store from 'electron-store'
import * as v from 'valibot'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, validateSettings } from '../../shared/domain'
import { deriveLegacySelectedTextSource } from '../../shared/output-selection'

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
    const migrated = migrateSettings(current)
    if (migrated) {
      // Persist schema-validated output so removed keys are stripped.
      this.store.set('settings', v.parse(SettingsSchema, migrated))
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

const migrateSettings = (settings: Settings): Settings | null => {
  const migratedPresetPointers = migrateRemovedActivePreset(settings)
  const presetBase = migratedPresetPointers ?? settings
  const migratedOutputSelection = migrateOutputSelectedTextSource(presetBase)
  const outputBase = migratedOutputSelection ?? presetBase
  const migratedGemini = migrateDeprecatedGeminiModel(outputBase)
  const geminiBase = migratedGemini ?? outputBase
  const migratedRemovedAutoRun = migrateRemovedAutoRunDefaultTransform(geminiBase)
  const autoRunBase = migratedRemovedAutoRun ?? geminiBase
  const migratedOverrides = migrateProviderBaseUrlOverrides(autoRunBase)
  return migratedOverrides ?? migratedRemovedAutoRun ?? migratedGemini ?? migratedOutputSelection ?? migratedPresetPointers
}

const migrateRemovedAutoRunDefaultTransform = (settings: Settings): Settings | null => {
  const transformationAny = settings.transformation as Settings['transformation'] & {
    autoRunDefaultTransform?: boolean
  }
  if (typeof transformationAny.autoRunDefaultTransform === 'undefined') {
    return null
  }

  const { autoRunDefaultTransform: removedAutoRunDefaultTransform, ...transformationWithoutAutoRun } = transformationAny

  // Preserve user intent: if they had auto-run explicitly disabled, switch the
  // output source to transcript so capture-time transformation is still skipped.
  // Without this, the default selectedTextSource ('transformed') would silently
  // activate transformation for users who never wanted it, causing failures when
  // no Google API key is configured.
  const output =
    removedAutoRunDefaultTransform === false
      ? { ...settings.output, selectedTextSource: 'transcript' as const }
      : settings.output

  return {
    ...settings,
    transformation: transformationWithoutAutoRun,
    output
  }
}

const migrateRemovedActivePreset = (settings: Settings): Settings | null => {
  const transformationAny = settings.transformation as Settings['transformation'] & {
    activePresetId?: string
    lastPickedPresetId?: string | null
  }

  const { activePresetId: _removedActivePresetId, ...transformationWithoutActive } = transformationAny
  const fallbackDefaultPresetId = settings.transformation.presets[0]?.id ?? settings.transformation.defaultPresetId
  const normalizedDefaultPresetId = settings.transformation.presets.some((preset) => preset.id === settings.transformation.defaultPresetId)
    ? settings.transformation.defaultPresetId
    : fallbackDefaultPresetId
  const normalizedLastPickedPresetId = transformationAny.lastPickedPresetId ?? null

  const hasRemovedActive = typeof transformationAny.activePresetId === 'string'
  const isMissingLastPicked = typeof transformationAny.lastPickedPresetId === 'undefined'
  const hasInvalidDefault = normalizedDefaultPresetId !== settings.transformation.defaultPresetId

  if (!hasRemovedActive && !isMissingLastPicked && !hasInvalidDefault) {
    return null
  }

  return {
    ...settings,
    transformation: {
      ...transformationWithoutActive,
      defaultPresetId: normalizedDefaultPresetId,
      lastPickedPresetId: normalizedLastPickedPresetId
    }
  }
}

const migrateOutputSelectedTextSource = (settings: Settings): Settings | null => {
  const outputAny = settings.output as Settings['output'] & { selectedTextSource?: Settings['output']['selectedTextSource'] }
  if (outputAny.selectedTextSource === 'transcript' || outputAny.selectedTextSource === 'transformed') {
    return null
  }

  return {
    ...settings,
    output: {
      ...settings.output,
      selectedTextSource: deriveLegacySelectedTextSource(settings.output)
    }
  }
}

const migrateDeprecatedGeminiModel = (settings: Settings): Settings | null => {
  let changed = false
  const migratedPresets = settings.transformation.presets.map((preset): Settings['transformation']['presets'][number] => {
    if ((preset as { model: string }).model !== 'gemini-1.5-flash-8b') {
      return preset
    }
    changed = true
    return {
      ...preset,
      model: 'gemini-2.5-flash' as const
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

const migrateProviderBaseUrlOverrides = (settings: Settings): Settings | null => {
  let changed = false
  const transcriptionAny = settings.transcription as Settings['transcription'] & {
    baseUrlOverrides?: Record<string, string | null>
    baseUrlOverride?: string | null
  }
  const transformationAny = settings.transformation as Settings['transformation'] & {
    baseUrlOverrides?: Record<string, string | null>
    baseUrlOverride?: string | null
  }

  const transcriptionBaseUrlOverrides = {
    groq: transcriptionAny.baseUrlOverrides?.groq ?? null,
    elevenlabs: transcriptionAny.baseUrlOverrides?.elevenlabs ?? null
  }
  if (!transcriptionAny.baseUrlOverrides) {
    changed = true
    // Backfill one-time legacy scalar values into provider-keyed map during migration.
    const legacy = transcriptionAny.baseUrlOverride ?? null
    if (legacy !== null) {
      transcriptionBaseUrlOverrides[settings.transcription.provider] = legacy
    }
  }

  const transformationBaseUrlOverrides = {
    google: transformationAny.baseUrlOverrides?.google ?? null
  }
  if (!transformationAny.baseUrlOverrides) {
    changed = true
    // Backfill one-time legacy scalar values into provider-keyed map during migration.
    const legacy = transformationAny.baseUrlOverride ?? null
    if (legacy !== null) {
      transformationBaseUrlOverrides.google = legacy
    }
  }

  if (!changed) {
    return null
  }

  return {
    ...settings,
    transcription: {
      ...settings.transcription,
      baseUrlOverrides: transcriptionBaseUrlOverrides
    },
    transformation: {
      ...settings.transformation,
      baseUrlOverrides: transformationBaseUrlOverrides
    }
  }
}
