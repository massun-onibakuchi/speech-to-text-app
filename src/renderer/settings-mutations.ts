/*
Where: src/renderer/settings-mutations.ts
What: Settings and API-key mutation helpers for the renderer.
Why: Extracted from renderer-app.tsx (Phase 6) to separate settings/preset/API-key
     mutation logic from the top-level orchestration. Functions are bound to app
     state via a deps object supplied by renderer-app.tsx at startup.
*/

import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot, AudioInputSource } from '../shared/ipc'
import { resolveDetectedAudioSource } from './recording-device'
import { type SettingsValidationErrors, validateSettingsFormInput, validateTransformationPresetDraft } from './settings-validation'
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
  apiKeyTestStatus: Record<ApiKeyProvider, string>
  apiKeysSaveMessage: string
  audioInputSources: AudioInputSource[]
}

// Dependencies injected from renderer-app.tsx.
export type SettingsMutationDeps = {
  state: SettingsMutableState
  // Triggers a React re-render from current state.
  onStateChange: () => void
  // Cancels any in-flight debounced autosave and bumps the generation counter.
  invalidatePendingAutosave: () => void
  setSettingsSaveMessage: (message: string) => void
  setSettingsValidationErrors: (errors: SettingsValidationErrors) => void
  addActivity: (message: string, tone?: ActivityItem['tone']) => void
  addToast: (message: string, tone?: ActivityItem['tone']) => void
  logError: (event: string, error: unknown, context?: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Pure helper — resolves the selected default preset; falls back to the first.
// ---------------------------------------------------------------------------
const resolveDefaultTransformationPreset = (settings: Settings) =>
  settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
  settings.transformation.presets[0]

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
  const { state, onStateChange, invalidatePendingAutosave, setSettingsSaveMessage, setSettingsValidationErrors, addActivity, addToast, logError } =
    deps

  // --- API key actions ------------------------------------------------------

  const runApiKeyConnectionTest = async (provider: ApiKeyProvider, candidateValue: string): Promise<void> => {
    state.apiKeyTestStatus[provider] = 'Testing connection...'
    onStateChange()
    try {
      const result = await window.speechToTextApi.testApiKeyConnection(provider, candidateValue)
      state.apiKeyTestStatus[provider] = `${result.status === 'success' ? 'Success' : 'Failed'}: ${result.message}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API key test error'
      state.apiKeyTestStatus[provider] = `Failed: ${message}`
    }
    onStateChange()
  }

  const saveApiKeys = async (values: Record<ApiKeyProvider, string>): Promise<void> => {
    state.apiKeysSaveMessage = ''
    const entries: Array<{ provider: ApiKeyProvider; value: string }> = [
      { provider: 'groq', value: values.groq.trim() },
      { provider: 'elevenlabs', value: values.elevenlabs.trim() },
      { provider: 'google', value: values.google.trim() }
    ]
    const toSave = entries.filter((entry) => entry.value.length > 0)
    if (toSave.length === 0) {
      state.apiKeysSaveMessage = 'Enter at least one API key to save.'
      for (const entry of entries) {
        state.apiKeySaveStatus[entry.provider] = ''
      }
      addToast('Enter at least one API key to save.', 'error')
      onStateChange()
      return
    }

    try {
      await Promise.all(toSave.map((entry) => window.speechToTextApi.setApiKey(entry.provider, entry.value)))
      state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
      for (const entry of entries) {
        state.apiKeySaveStatus[entry.provider] = toSave.some((saved) => saved.provider === entry.provider) ? 'Saved.' : ''
      }
      state.apiKeysSaveMessage = 'API keys saved.'
      addActivity(`Saved ${toSave.length} API key value(s).`, 'success')
      addToast('API keys saved.', 'success')
      onStateChange()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API key save error'
      logError('renderer.api_key_save_failed', error)
      for (const entry of entries) {
        if (toSave.some((saved) => saved.provider === entry.provider)) {
          state.apiKeySaveStatus[entry.provider] = `Failed: ${message}`
        }
      }
      state.apiKeysSaveMessage = `Failed to save API keys: ${message}`
      addActivity(`API key save failed: ${message}`, 'error')
      addToast(`API key save failed: ${message}`, 'error')
      onStateChange()
    }
  }

  const saveApiKey = async (provider: ApiKeyProvider, value: string): Promise<void> => {
    const trimmed = value.trim()
    state.apiKeysSaveMessage = ''

    if (trimmed.length === 0) {
      state.apiKeySaveStatus[provider] = 'Enter a key before saving.'
      state.apiKeysSaveMessage = `Enter a ${apiKeyProviderLabel[provider]} API key to save.`
      addToast(`Enter a ${apiKeyProviderLabel[provider]} API key to save.`, 'error')
      onStateChange()
      return
    }

    try {
      await window.speechToTextApi.setApiKey(provider, trimmed)
      state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
      state.apiKeySaveStatus[provider] = 'Saved.'
      state.apiKeysSaveMessage = `${apiKeyProviderLabel[provider]} API key saved.`
      addActivity(`Saved ${apiKeyProviderLabel[provider]} API key.`, 'success')
      addToast(`${apiKeyProviderLabel[provider]} API key saved.`, 'success')
      onStateChange()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API key save error'
      logError('renderer.api_key_save_failed', error, { provider })
      state.apiKeySaveStatus[provider] = `Failed: ${message}`
      state.apiKeysSaveMessage = `Failed to save ${apiKeyProviderLabel[provider]} API key: ${message}`
      addActivity(`${apiKeyProviderLabel[provider]} API key save failed: ${message}`, 'error')
      addToast(`${apiKeyProviderLabel[provider]} API key save failed: ${message}`, 'error')
      onStateChange()
    }
  }

  // --- Settings/preset mutations --------------------------------------------

  const restoreOutputAndShortcutsDefaults = async (): Promise<void> => {
    if (!state.settings) {
      return
    }
    const restored: Settings = {
      ...state.settings,
      output: structuredClone(DEFAULT_SETTINGS.output),
      shortcuts: {
        ...DEFAULT_SETTINGS.shortcuts
      }
    }

    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(restored)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      setSettingsSaveMessage('Defaults restored.')
      addActivity('Output and shortcut defaults restored.', 'success')
      addToast('Defaults restored.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown defaults restore error'
      setSettingsSaveMessage(`Failed to restore defaults: ${message}`)
      addActivity(`Defaults restore failed: ${message}`, 'error')
      addToast(`Defaults restore failed: ${message}`, 'error')
    }
  }

  const setDefaultTransformationPreset = (defaultPresetId: string): void => {
    if (!state.settings) {
      return
    }
    state.settings = buildSettingsWithDefaultPreset(state.settings, defaultPresetId)
    onStateChange()
  }

  const patchDefaultTransformationPresetDraft = (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ): void => {
    if (!state.settings) {
      return
    }
    const defaultPreset = resolveDefaultTransformationPreset(state.settings)
    if (!defaultPreset) {
      return
    }
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        presets: state.settings.transformation.presets.map((preset) => (preset.id === defaultPreset.id ? { ...preset, ...patch } : preset))
      }
    }
  }

  const saveTransformationPresetDraft = async (
    presetId: string,
    draft: Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>
  ): Promise<boolean> => {
    if (!state.settings) {
      return false
    }
    const currentPreset = state.settings.transformation.presets.find((preset) => preset.id === presetId)
    if (!currentPreset) {
      setSettingsSaveMessage('Selected profile is no longer available.')
      addToast('Selected profile is no longer available.', 'error')
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
      setSettingsSaveMessage('Fix the highlighted validation errors before saving.')
      addToast('Profile validation failed. Fix highlighted fields.', 'error')
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
      setSettingsSaveMessage('Profile saved.')
      addActivity(`Profile "${currentPreset.name}" saved.`, 'success')
      addToast('Profile saved.', 'success')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown profile save error'
      logError('renderer.profile_save_failed', error, { presetId })
      setSettingsSaveMessage(`Failed to save profile: ${message}`)
      addToast(`Failed to save profile: ${message}`, 'error')
      return false
    }
  }

  const patchTranscriptionBaseUrlDraft = (value: string): void => {
    if (!state.settings) {
      return
    }
    const provider = state.settings.transcription.provider
    state.settings = {
      ...state.settings,
      transcription: {
        ...state.settings.transcription,
        baseUrlOverrides: {
          ...state.settings.transcription.baseUrlOverrides,
          [provider]: value
        }
      }
    }
  }

  const patchTransformationBaseUrlDraft = (value: string): void => {
    if (!state.settings) {
      return
    }
    const defaultPreset = resolveDefaultTransformationPreset(state.settings)
    if (!defaultPreset) {
      return
    }
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        baseUrlOverrides: {
          ...state.settings.transformation.baseUrlOverrides,
          [defaultPreset.provider]: value
        }
      }
    }
  }

  const patchShortcutDraft = (
    key:
      | 'startRecording'
      | 'stopRecording'
      | 'toggleRecording'
      | 'cancelRecording'
      | 'runTransform'
      | 'runTransformOnSelection'
      | 'pickTransformation'
      | 'changeTransformationDefault',
    value: string
  ): void => {
    if (!state.settings) {
      return
    }
    state.settings = {
      ...state.settings,
      shortcuts: {
        ...state.settings.shortcuts,
        [key]: value
      }
    }
  }

  const patchRecordingMethodDraft = (method: Settings['recording']['method']): void => {
    if (!state.settings) {
      return
    }
    state.settings = {
      ...state.settings,
      recording: {
        ...state.settings.recording,
        method
      }
    }
  }

  const patchRecordingSampleRateDraft = (sampleRateHz: Settings['recording']['sampleRateHz']): void => {
    if (!state.settings) {
      return
    }
    state.settings = {
      ...state.settings,
      recording: {
        ...state.settings.recording,
        sampleRateHz
      }
    }
  }

  const patchRecordingDeviceDraft = (deviceId: string): void => {
    if (!state.settings) {
      return
    }
    state.settings = {
      ...state.settings,
      recording: {
        ...state.settings.recording,
        device: deviceId,
        autoDetectAudioSource: deviceId === 'system_default',
        detectedAudioSource: resolveDetectedAudioSource(deviceId, state.audioInputSources)
      }
    }
  }

  const addTransformationPreset = (): void => {
    if (!state.settings) {
      return
    }
    state.settings = buildSettingsWithAddedPreset(state.settings).nextSettings
    onStateChange()
    setSettingsSaveMessage('Profile added. Save settings to persist.')
  }

  const removeTransformationPreset = (presetId: string): void => {
    if (!state.settings) {
      return
    }
    const removal = buildSettingsWithRemovedPreset(state.settings, presetId)
    if (!removal.nextSettings) {
      setSettingsSaveMessage(removal.error ?? 'Profile removal failed.')
      return
    }
    state.settings = removal.nextSettings
    onStateChange()
    setSettingsSaveMessage('Profile removed. Save settings to persist.')
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
      setSettingsSaveMessage('Default profile updated.')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown default profile save error'
      logError('renderer.profile_default_save_failed', error, { defaultPresetId })
      setSettingsSaveMessage(`Failed to update default profile: ${message}`)
      addToast(`Failed to update default profile: ${message}`, 'error')
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
      setSettingsSaveMessage('Profile added.')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown profile add error'
      logError('renderer.profile_add_save_failed', error)
      setSettingsSaveMessage(`Failed to add profile: ${message}`)
      addToast(`Failed to add profile: ${message}`, 'error')
      return false
    }
  }

  const removeTransformationPresetAndSave = async (presetId: string): Promise<boolean> => {
    if (!state.settings) return false
    const removal = buildSettingsWithRemovedPreset(state.settings, presetId)
    if (!removal.nextSettings) {
      setSettingsSaveMessage(removal.error ?? 'Profile removal failed.')
      addToast(removal.error ?? 'Profile removal failed.', 'error')
      return false
    }
    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(removal.nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      setSettingsSaveMessage('Profile removed.')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown profile remove error'
      logError('renderer.profile_remove_save_failed', error, { presetId })
      setSettingsSaveMessage(`Failed to remove profile: ${message}`)
      addToast(`Failed to remove profile: ${message}`, 'error')
      return false
    }
  }

  const saveSettingsFromState = async (): Promise<void> => {
    if (!state.settings) {
      return
    }
    const shortcutDraft = { ...DEFAULT_SETTINGS.shortcuts, ...state.settings.shortcuts }
    const defaultPreset = resolveDefaultTransformationPreset(state.settings)
    if (!defaultPreset) {
      setSettingsSaveMessage('No transformation profile is available to save.')
      addToast('No transformation profile is available to save.', 'error')
      return
    }

    const formValidation = validateSettingsFormInput({
      transcriptionBaseUrlRaw: state.settings.transcription.baseUrlOverrides[state.settings.transcription.provider] ?? '',
      transformationBaseUrlRaw: state.settings.transformation.baseUrlOverrides[defaultPreset.provider] ?? '',
      presetNameRaw: defaultPreset.name,
      systemPromptRaw: defaultPreset.systemPrompt,
      userPromptRaw: defaultPreset.userPrompt,
      shortcuts: {
        startRecording: shortcutDraft.startRecording,
        stopRecording: shortcutDraft.stopRecording,
        toggleRecording: shortcutDraft.toggleRecording,
        cancelRecording: shortcutDraft.cancelRecording,
        runTransform: shortcutDraft.runTransform,
        runTransformOnSelection: shortcutDraft.runTransformOnSelection,
        pickTransformation: shortcutDraft.pickTransformation,
        changeTransformationDefault: shortcutDraft.changeTransformationDefault
      }
    })
    setSettingsValidationErrors(formValidation.errors)
    if (Object.keys(formValidation.errors).length > 0) {
      setSettingsSaveMessage('Fix the highlighted validation errors before saving.')
      addToast('Settings validation failed. Fix highlighted fields.', 'error')
      return
    }

    const updatedDefaultPreset = {
      ...defaultPreset,
      name: formValidation.normalized.presetName,
      systemPrompt: formValidation.normalized.systemPrompt,
      userPrompt: formValidation.normalized.userPrompt
    }
    const updatedPresets = state.settings.transformation.presets.map((preset) =>
      preset.id === updatedDefaultPreset.id ? updatedDefaultPreset : preset
    )

    const nextSettings: Settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        baseUrlOverrides: {
          ...state.settings.transformation.baseUrlOverrides,
          [updatedDefaultPreset.provider]: formValidation.normalized.transformationBaseUrlOverride
        },
        presets: updatedPresets
      },
      transcription: {
        ...state.settings.transcription,
        baseUrlOverrides: {
          ...state.settings.transcription.baseUrlOverrides,
          [state.settings.transcription.provider]: formValidation.normalized.transcriptionBaseUrlOverride
        }
      },
      shortcuts: {
        ...state.settings.shortcuts,
        ...formValidation.normalized.shortcuts
      }
    }

    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      onStateChange()
      setSettingsSaveMessage('Settings saved.')
      addActivity('Settings updated.', 'success')
      addToast('Settings saved.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown settings save error'
      logError('renderer.settings_save_failed', error)
      setSettingsSaveMessage(`Failed to save settings: ${message}`)
      addActivity(`Settings save failed: ${message}`, 'error')
      addToast(`Settings save failed: ${message}`, 'error')
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
    runApiKeyConnectionTest,
    saveApiKey,
    saveApiKeys,
    restoreOutputAndShortcutsDefaults,
    setDefaultTransformationPreset,
    setDefaultTransformationPresetAndSave,
    patchDefaultTransformationPresetDraft,
    saveTransformationPresetDraft,
    patchTranscriptionBaseUrlDraft,
    patchTransformationBaseUrlDraft,
    patchShortcutDraft,
    patchRecordingMethodDraft,
    patchRecordingSampleRateDraft,
    patchRecordingDeviceDraft,
    addTransformationPreset,
    addTransformationPresetAndSave,
    removeTransformationPreset,
    removeTransformationPresetAndSave,
    saveSettingsFromState,
    applyTranscriptionProviderChange
  }
}

export type SettingsMutations = ReturnType<typeof createSettingsMutations>
