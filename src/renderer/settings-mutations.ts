/*
Where: src/renderer/settings-mutations.ts
What: Settings and API-key mutation helpers for the renderer.
Why: Extracted from renderer-app.tsx (Phase 6) to separate settings/preset/API-key
     mutation logic from the top-level orchestration. Functions are bound to app
     state via a deps object supplied by renderer-app.tsx at startup.
*/

import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'
import { type SettingsValidationErrors, validateTransformationPresetDraft } from './settings-validation'
import type { ActivityItem } from './activity-feed'

// ---------------------------------------------------------------------------
// State slice — only the fields that settings mutations read or write.
// The full app state object from renderer-app.tsx satisfies this interface.
// ---------------------------------------------------------------------------
export type SettingsMutableState = {
  settings: Settings | null
  persistedSettings: Settings | null
  settingsValidationErrors: SettingsValidationErrors
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
}

// Dependencies injected from renderer-app.tsx.
export type SettingsMutationDeps = {
  state: SettingsMutableState
  // Triggers a React re-render from current state.
  onStateChange: () => void
  // Cancels any in-flight debounced autosave and bumps the generation counter.
  invalidatePendingAutosave: () => void
  setSettingsValidationErrors: (errors: SettingsValidationErrors) => void
  addActivity: (message: string, tone?: ActivityItem['tone']) => void
  addToast: (message: string, tone?: ActivityItem['tone']) => void
  logError: (event: string, error: unknown, context?: Record<string, unknown>) => void
}

const buildSettingsWithDefaultPreset = (settings: Settings, defaultPresetId: string): Settings => ({
  ...settings,
  transformation: {
    ...settings.transformation,
    defaultPresetId
  }
})

const buildSettingsWithAddedPreset = (settings: Settings): { nextSettings: Settings; newPresetId: string } => {
  const newPresetId = `preset-${Date.now()}`
  const newPreset = {
    id: newPresetId,
    name: `Preset ${settings.transformation.presets.length + 1}`,
    provider: 'google' as const,
    model: 'gemini-2.5-flash' as const,
    systemPrompt: '',
    userPrompt: '',
    shortcut: settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform
  }
  return {
    newPresetId,
    nextSettings: {
      ...settings,
      transformation: {
        ...settings.transformation,
        defaultPresetId: newPresetId,
        presets: [...settings.transformation.presets, newPreset]
      }
    }
  }
}

const buildSettingsWithRemovedPreset = (settings: Settings, presetId: string): { nextSettings: Settings | null; error: string | null } => {
  const presets = settings.transformation.presets
  if (presets.length <= 1) {
    return { nextSettings: null, error: 'At least one profile is required.' }
  }
  const remaining = presets.filter((preset) => preset.id !== presetId)
  const fallbackId = remaining[0].id
  const preferredDefaultId =
    settings.transformation.defaultPresetId === presetId ? fallbackId : settings.transformation.defaultPresetId
  const defaultPresetId = remaining.some((preset) => preset.id === preferredDefaultId) ? preferredDefaultId : fallbackId
  const currentLastPickedPresetId = settings.transformation.lastPickedPresetId
  const normalizedLastPickedPresetId =
    currentLastPickedPresetId && remaining.some((preset) => preset.id === currentLastPickedPresetId)
      ? currentLastPickedPresetId
      : null
  return {
    nextSettings: {
      ...settings,
      transformation: {
        ...settings.transformation,
        defaultPresetId,
        lastPickedPresetId: normalizedLastPickedPresetId,
        presets: remaining
      }
    },
    error: null
  }
}

const apiKeyProviderLabel: Record<ApiKeyProvider, string> = {
  groq: 'Groq',
  elevenlabs: 'ElevenLabs',
  google: 'Google'
}

// ---------------------------------------------------------------------------
// Factory — creates the full set of settings mutation functions bound to deps.
// ---------------------------------------------------------------------------
export const createSettingsMutations = (deps: SettingsMutationDeps) => {
  const { state, onStateChange, invalidatePendingAutosave, setSettingsValidationErrors, addActivity, addToast, logError } = deps
  const apiKeySaveQueueByProvider: Record<ApiKeyProvider, Promise<void>> = {
    groq: Promise.resolve(),
    elevenlabs: Promise.resolve(),
    google: Promise.resolve()
  }

  // --- API key actions ------------------------------------------------------

  const runApiKeySave = async (provider: ApiKeyProvider, trimmed: string): Promise<void> => {
    state.apiKeySaveStatus[provider] = 'Validating key...'
    onStateChange()

    let validationMessage = ''
    try {
      const validation = await window.speechToTextApi.testApiKeyConnection(provider, trimmed)
      if (validation.status !== 'success') {
        validationMessage = validation.message
      }
    } catch (error) {
      validationMessage = error instanceof Error ? error.message : 'Unknown API key validation error'
      logError('renderer.api_key_validation_failed', error, { provider })
    }

    if (validationMessage.length > 0) {
      state.apiKeySaveStatus[provider] = `Failed: ${validationMessage}`
      addActivity(`${apiKeyProviderLabel[provider]} API key validation failed: ${validationMessage}`, 'error')
      addToast(`${apiKeyProviderLabel[provider]} API key validation failed: ${validationMessage}`, 'error')
      onStateChange()
      return
    }

    try {
      state.apiKeySaveStatus[provider] = 'Saving key...'
      onStateChange()
      await window.speechToTextApi.setApiKey(provider, trimmed)
      state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
      state.apiKeySaveStatus[provider] = 'Saved.'
      addActivity(`Saved ${apiKeyProviderLabel[provider]} API key.`, 'success')
      addToast(`${apiKeyProviderLabel[provider]} API key saved.`, 'success')
      onStateChange()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API key save error'
      logError('renderer.api_key_save_failed', error, { provider })
      state.apiKeySaveStatus[provider] = `Failed: ${message}`
      addActivity(`${apiKeyProviderLabel[provider]} API key save failed: ${message}`, 'error')
      addToast(`${apiKeyProviderLabel[provider]} API key save failed: ${message}`, 'error')
      onStateChange()
    }
  }

  const saveApiKey = async (provider: ApiKeyProvider, value: string): Promise<void> => {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      state.apiKeySaveStatus[provider] = 'Enter a key before saving.'
      addToast(`Enter a ${apiKeyProviderLabel[provider]} API key to save.`, 'error')
      onStateChange()
      return
    }

    const queuedSave = apiKeySaveQueueByProvider[provider]
      .catch(() => undefined)
      .then(async () => {
        await runApiKeySave(provider, trimmed)
      })
    apiKeySaveQueueByProvider[provider] = queuedSave
    await queuedSave
  }

  // --- Settings/preset mutations --------------------------------------------

  const saveTransformationPresetDraft = async (
    presetId: string,
    draft: Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>
  ): Promise<boolean> => {
    if (!state.settings) {
      return false
    }
    const currentPreset = state.settings.transformation.presets.find((preset) => preset.id === presetId)
    if (!currentPreset) {
      return false
    }

    const presetValidation = validateTransformationPresetDraft({
      presetNameRaw: draft.name,
      systemPromptRaw: draft.systemPrompt,
      userPromptRaw: draft.userPrompt
    })

    const nextErrors: SettingsValidationErrors = { ...state.settingsValidationErrors }
    if (presetValidation.errors.presetName) {
      nextErrors.presetName = presetValidation.errors.presetName
    } else {
      delete nextErrors.presetName
    }
    if (presetValidation.errors.systemPrompt) {
      nextErrors.systemPrompt = presetValidation.errors.systemPrompt
    } else {
      delete nextErrors.systemPrompt
    }
    if (presetValidation.errors.userPrompt) {
      nextErrors.userPrompt = presetValidation.errors.userPrompt
    } else {
      delete nextErrors.userPrompt
    }
    setSettingsValidationErrors(nextErrors)

    if (Object.keys(presetValidation.errors).length > 0) {
      return false
    }

    const nextSettings: Settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        presets: state.settings.transformation.presets.map((preset) =>
          preset.id === presetId
            ? {
                ...preset,
                name: presetValidation.normalized.presetName,
                model: draft.model,
                systemPrompt: presetValidation.normalized.systemPrompt,
                userPrompt: presetValidation.normalized.userPrompt
              }
            : preset
        )
      }
    }

    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      addActivity(`Profile "${currentPreset.name}" saved.`, 'success')
      return true
    } catch (error) {
      logError('renderer.profile_save_failed', error, { presetId })
      return false
    }
  }

  const setDefaultTransformationPresetAndSave = async (defaultPresetId: string): Promise<boolean> => {
    if (!state.settings) return false
    const nextSettings = buildSettingsWithDefaultPreset(state.settings, defaultPresetId)
    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      return true
    } catch (error) {
      logError('renderer.profile_default_save_failed', error, { defaultPresetId })
      return false
    }
  }

  const addTransformationPresetAndSave = async (): Promise<boolean> => {
    if (!state.settings) return false
    const { nextSettings } = buildSettingsWithAddedPreset(state.settings)
    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      return true
    } catch (error) {
      logError('renderer.profile_add_save_failed', error)
      return false
    }
  }

  const removeTransformationPresetAndSave = async (presetId: string): Promise<boolean> => {
    if (!state.settings) return false
    const removal = buildSettingsWithRemovedPreset(state.settings, presetId)
    if (!removal.nextSettings) {
      return false
    }
    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(removal.nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      return true
    } catch (error) {
      logError('renderer.profile_remove_save_failed', error, { presetId })
      return false
    }
  }

  // Also wire STT provider/model autosave helpers here for colocation.
  const applyTranscriptionProviderChange = (
    provider: Settings['transcription']['provider'],
    applyNonSecretAutosavePatch: (updater: (current: Settings) => Settings) => void
  ): void => {
    const models = STT_MODEL_ALLOWLIST[provider]
    const selectedModel = models[0]
    applyNonSecretAutosavePatch((current) => ({
      ...current,
      transcription: { ...current.transcription, provider, model: selectedModel }
    }))
  }

  return {
    saveApiKey,
    setDefaultTransformationPresetAndSave,
    saveTransformationPresetDraft,
    addTransformationPresetAndSave,
    removeTransformationPresetAndSave,
    applyTranscriptionProviderChange
  }
}

export type SettingsMutations = ReturnType<typeof createSettingsMutations>
