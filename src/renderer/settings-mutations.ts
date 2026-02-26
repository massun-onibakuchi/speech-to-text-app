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
import { type SettingsValidationErrors, validateSettingsFormInput } from './settings-validation'
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
// Pure helper — resolves the active preset; falls back to the first preset.
// ---------------------------------------------------------------------------
const resolveTransformationPreset = (settings: Settings, presetId: string) =>
  settings.transformation.presets.find((preset) => preset.id === presetId) ?? settings.transformation.presets[0]

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
    // Sync activePresetId with defaultPresetId so the profile editor always
    // shows the selected default profile (#127: active concept removed from UI).
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        defaultPresetId,
        activePresetId: defaultPresetId
      }
    }
    onStateChange()
  }

  const patchActiveTransformationPresetDraft = (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ): void => {
    if (!state.settings) {
      return
    }
    const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        presets: state.settings.transformation.presets.map((preset) => (preset.id === activePreset.id ? { ...preset, ...patch } : preset))
      }
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
    const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        baseUrlOverrides: {
          ...state.settings.transformation.baseUrlOverrides,
          [activePreset.provider]: value
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
    const id = `preset-${Date.now()}`
    const newPreset = {
      id,
      name: `Preset ${state.settings.transformation.presets.length + 1}`,
      provider: 'google' as const,
      model: 'gemini-2.5-flash' as const,
      systemPrompt: '',
      userPrompt: '',
      shortcut: state.settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform
    }
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        activePresetId: id,
        defaultPresetId: id,
        presets: [...state.settings.transformation.presets, newPreset]
      }
    }
    onStateChange()
    setSettingsSaveMessage('Profile added. Save settings to persist.')
  }

  const removeTransformationPreset = (presetId: string): void => {
    if (!state.settings) {
      return
    }
    const presets = state.settings.transformation.presets
    if (presets.length <= 1) {
      setSettingsSaveMessage('At least one profile is required.')
      return
    }
    const remaining = presets.filter((preset) => preset.id !== presetId)
    const fallbackId = remaining[0].id
    const preferredDefaultId =
      state.settings.transformation.defaultPresetId === presetId ? fallbackId : state.settings.transformation.defaultPresetId
    const defaultPresetId = remaining.some((preset) => preset.id === preferredDefaultId) ? preferredDefaultId : fallbackId
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        // #127 invariant: hidden active preset tracks the user-facing default preset.
        activePresetId: defaultPresetId,
        defaultPresetId,
        presets: remaining
      }
    }
    onStateChange()
    setSettingsSaveMessage('Profile removed. Save settings to persist.')
  }

  const saveSettingsFromState = async (): Promise<void> => {
    if (!state.settings) {
      return
    }
    const shortcutDraft = { ...DEFAULT_SETTINGS.shortcuts, ...state.settings.shortcuts }
    const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)

    const formValidation = validateSettingsFormInput({
      transcriptionBaseUrlRaw: state.settings.transcription.baseUrlOverrides[state.settings.transcription.provider] ?? '',
      transformationBaseUrlRaw: state.settings.transformation.baseUrlOverrides[activePreset.provider] ?? '',
      presetNameRaw: activePreset.name,
      systemPromptRaw: activePreset.systemPrompt,
      userPromptRaw: activePreset.userPrompt,
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

    const updatedActivePreset = {
      ...activePreset,
      name: formValidation.normalized.presetName,
      systemPrompt: formValidation.normalized.systemPrompt,
      userPrompt: formValidation.normalized.userPrompt
    }
    const updatedPresets = state.settings.transformation.presets.map((preset) =>
      preset.id === updatedActivePreset.id ? updatedActivePreset : preset
    )

    const nextSettings: Settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        baseUrlOverrides: {
          ...state.settings.transformation.baseUrlOverrides,
          [updatedActivePreset.provider]: formValidation.normalized.transformationBaseUrlOverride
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
    patchActiveTransformationPresetDraft,
    patchTranscriptionBaseUrlDraft,
    patchTransformationBaseUrlDraft,
    patchShortcutDraft,
    patchRecordingMethodDraft,
    patchRecordingSampleRateDraft,
    patchRecordingDeviceDraft,
    addTransformationPreset,
    removeTransformationPreset,
    saveSettingsFromState,
    applyTranscriptionProviderChange
  }
}

export type SettingsMutations = ReturnType<typeof createSettingsMutations>
