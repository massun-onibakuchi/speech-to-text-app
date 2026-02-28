/*
Where: src/renderer/settings-mutations.test.ts
What: Unit tests for renderer settings save mutations.
Why: Ensure prompt validation blocks invalid profile saves and normalizes legacy placeholders.
*/

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
import type { ApiKeyProvider } from '../shared/ipc'
import { createSettingsMutations, type SettingsMutableState } from './settings-mutations'

const createState = (settings: Settings): SettingsMutableState => ({
  settings,
  persistedSettings: structuredClone(settings),
  settingsValidationErrors: {},
  apiKeyStatus: { groq: false, elevenlabs: false, google: false },
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' },
  audioInputSources: []
})

const withDefaultPreset = (
  settings: Settings,
  patch: Partial<Settings['transformation']['presets'][number]>
): Settings => {
  const defaultId = settings.transformation.defaultPresetId
  return {
    ...settings,
    transformation: {
      ...settings.transformation,
      presets: settings.transformation.presets.map((preset) => (preset.id === defaultId ? { ...preset, ...patch } : preset))
    }
  }
}

describe('createSettingsMutations.saveSettingsFromState', () => {
  beforeEach(() => {
    const noopAsync = async () => {}
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(noopAsync),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false }))
    }
  })

  it('blocks save and surfaces prompt validation errors for invalid transformation profile prompts', async () => {
    const settings = withDefaultPreset(structuredClone(DEFAULT_SETTINGS), {
      systemPrompt: '   ',
      userPrompt: 'Rewrite clearly without placeholder'
    })
    const state = createState(settings)
    const setSettingsSaveMessage = vi.fn()
    const setSettingsValidationErrors = vi.fn()
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage,
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await mutations.saveSettingsFromState()

    expect(window.speechToTextApi.setSettings).not.toHaveBeenCalled()
    expect(setSettingsValidationErrors).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'System prompt is required.',
        userPrompt: expect.stringContaining('{{text}}')
      })
    )
    expect(setSettingsSaveMessage).toHaveBeenCalledWith('Fix the highlighted validation errors before saving.')
    expect(addToast).toHaveBeenCalledWith('Settings validation failed. Fix highlighted fields.', 'error')
  })

  it('saves valid prompts and normalizes legacy {{input}} placeholder to {{text}}', async () => {
    const settings = withDefaultPreset(structuredClone(DEFAULT_SETTINGS), {
      systemPrompt: 'You are a careful editor.',
      userPrompt: 'Rewrite: {{input}}'
    })
    const state = createState(settings)
    const setSettingsSaveMessage = vi.fn()
    const setSettingsValidationErrors = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage,
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.saveSettingsFromState()

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledOnce()
    const savedSettings = vi.mocked(window.speechToTextApi.setSettings).mock.calls[0]?.[0] as Settings
    const savedPreset = savedSettings.transformation.presets.find((preset) => preset.id === savedSettings.transformation.defaultPresetId)
    expect(savedPreset?.userPrompt).toBe('Rewrite: {{text}}')
    expect(setSettingsValidationErrors).toHaveBeenCalledWith({})
    expect(setSettingsSaveMessage).toHaveBeenCalledWith('Settings saved.')
  })
})

describe('createSettingsMutations.saveApiKey', () => {
  beforeEach(() => {
    const noopAsync = async () => {}
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(noopAsync),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: true, elevenlabs: false, google: false }))
    }
  })

  it('saves a single provider key without overwriting other provider save statuses', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    state.apiKeySaveStatus.elevenlabs = 'Draft not saved yet'
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError: vi.fn()
    })

    await mutations.saveApiKey('groq', '  groq-key  ')

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledWith('groq', 'groq-key')
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledWith('groq', 'groq-key')
    expect(window.speechToTextApi.getApiKeyStatus).toHaveBeenCalledTimes(1)
    expect(state.apiKeyStatus.groq).toBe(true)
    expect(state.apiKeySaveStatus.groq).toBe('Saved.')
    expect(state.apiKeySaveStatus.elevenlabs).toBe('Draft not saved yet')
    expect(addActivity).toHaveBeenCalledWith('Saved Groq API key.', 'success')
    expect(addToast).toHaveBeenCalledWith('Groq API key saved.', 'success')
    expect(onStateChange).toHaveBeenCalledTimes(3)
  })

  it('rejects blank single-provider saves with provider-specific feedback', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const onStateChange = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await mutations.saveApiKey('google', '   ')

    expect(window.speechToTextApi.testApiKeyConnection).not.toHaveBeenCalled()
    expect(window.speechToTextApi.setApiKey).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.google).toBe('Enter a key before saving.')
    expect(addToast).toHaveBeenCalledWith('Enter a Google API key to save.', 'error')
    expect(onStateChange).toHaveBeenCalledOnce()
  })

  it('rejects invalid key when connection validation fails and does not persist', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const addActivity = vi.fn()
    const onStateChange = vi.fn()
    vi.mocked(window.speechToTextApi.testApiKeyConnection).mockResolvedValueOnce({
      provider: 'google',
      status: 'failed',
      message: 'Invalid API key.'
    })

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError: vi.fn()
    })

    await mutations.saveApiKey('google', 'bad-key')

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledWith('google', 'bad-key')
    expect(window.speechToTextApi.setApiKey).not.toHaveBeenCalled()
    expect(window.speechToTextApi.getApiKeyStatus).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.google).toBe('Failed: Invalid API key.')
    expect(addActivity).toHaveBeenCalledWith('Google API key validation failed: Invalid API key.', 'error')
    expect(addToast).toHaveBeenCalledWith('Google API key validation failed: Invalid API key.', 'error')
    expect(onStateChange).toHaveBeenCalledTimes(2)
  })

  it('rejects key when validation call throws and does not persist', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.testApiKeyConnection).mockRejectedValueOnce(new Error('validation timeout'))

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError
    })

    await mutations.saveApiKey('groq', 'groq-key')

    expect(window.speechToTextApi.setApiKey).not.toHaveBeenCalled()
    expect(window.speechToTextApi.getApiKeyStatus).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.groq).toBe('Failed: validation timeout')
    expect(addActivity).toHaveBeenCalledWith('Groq API key validation failed: validation timeout', 'error')
    expect(addToast).toHaveBeenCalledWith('Groq API key validation failed: validation timeout', 'error')
    expect(logError).toHaveBeenCalledWith('renderer.api_key_validation_failed', expect.any(Error), { provider: 'groq' })
    expect(onStateChange).toHaveBeenCalledTimes(2)
  })

  it('surfaces provider-specific failure feedback when single-provider save fails', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.setApiKey).mockRejectedValueOnce(new Error('boom'))

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError
    })

    await mutations.saveApiKey('elevenlabs', '  key-123  ')

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledWith('elevenlabs', 'key-123')
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledWith('elevenlabs', 'key-123')
    expect(window.speechToTextApi.getApiKeyStatus).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.elevenlabs).toBe('Failed: boom')
    expect(addActivity).toHaveBeenCalledWith('ElevenLabs API key save failed: boom', 'error')
    expect(addToast).toHaveBeenCalledWith('ElevenLabs API key save failed: boom', 'error')
    expect(logError).toHaveBeenCalledWith('renderer.api_key_save_failed', expect.any(Error), { provider: 'elevenlabs' })
    expect(onStateChange).toHaveBeenCalledTimes(3)
  })
})

describe('createSettingsMutations.setDefaultTransformationPreset', () => {
  it('updates only defaultPresetId when selecting the user-facing default profile', () => {
    const state = createState(
      structuredClone({
        ...DEFAULT_SETTINGS,
        transformation: {
          ...DEFAULT_SETTINGS.transformation,
          defaultPresetId: 'default-id',
          lastPickedPresetId: null,
          presets: [
            { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'default-id', name: 'Default' }
          ]
        }
      })
    )
    const onStateChange = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    mutations.setDefaultTransformationPreset('default-id')

    expect(state.settings?.transformation.defaultPresetId).toBe('default-id')
    expect(state.settings?.transformation.lastPickedPresetId).toBeNull()
    expect(onStateChange).toHaveBeenCalledOnce()
  })
})

describe('createSettingsMutations profile persistence helpers', () => {
  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false }))
    }
  })

  it('persists default/add/remove profile actions immediately', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta' }
    ]
    const state = createState(settings)

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')
    await mutations.addTransformationPresetAndSave()
    await mutations.removeTransformationPresetAndSave('preset-a')

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(3)
  })
})

describe('createSettingsMutations.saveTransformationPresetDraft', () => {
  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false }))
    }
  })

  it('blocks invalid non-default profile drafts and does not persist', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User {{text}}' }
    ]
    const state = createState(settings)
    const setSettingsValidationErrors = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    const didSave = await mutations.saveTransformationPresetDraft('preset-b', {
      name: '   ',
      model: 'gemini-2.5-flash',
      systemPrompt: '   ',
      userPrompt: 'invalid'
    })

    expect(didSave).toBe(false)
    expect(window.speechToTextApi.setSettings).not.toHaveBeenCalled()
    expect(setSettingsValidationErrors).toHaveBeenCalledWith(
      expect.objectContaining({
        presetName: 'Profile name is required.',
        systemPrompt: 'System prompt is required.',
        userPrompt: expect.stringContaining('{{text}}')
      })
    )
  })

  it('saves and normalizes a non-default profile draft', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User {{text}}' }
    ]
    const state = createState(settings)

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    const didSave = await mutations.saveTransformationPresetDraft('preset-b', {
      name: '  Beta v2  ',
      model: 'gemini-2.5-flash',
      systemPrompt: '  System Updated  ',
      userPrompt: 'Rewrite: {{input}}'
    })

    expect(didSave).toBe(true)
    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(1)
    const savedSettings = vi.mocked(window.speechToTextApi.setSettings).mock.calls[0]?.[0] as Settings
    const savedPreset = savedSettings.transformation.presets.find((preset) => preset.id === 'preset-b')
    expect(savedPreset?.name).toBe('Beta v2')
    expect(savedPreset?.systemPrompt).toBe('  System Updated  ')
    expect(savedPreset?.userPrompt).toBe('Rewrite: {{text}}')
  })
})

describe('createSettingsMutations.addTransformationPreset', () => {
  it('selects the new profile as default and keeps pick-and-run memory unchanged', () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const setSettingsSaveMessage = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage,
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    const beforeCount = state.settings!.transformation.presets.length
    mutations.addTransformationPreset()

    expect(state.settings!.transformation.presets).toHaveLength(beforeCount + 1)
    const newPreset = state.settings!.transformation.presets.at(-1)!
    expect(state.settings!.transformation.defaultPresetId).toBe(newPreset.id)
    expect(state.settings!.transformation.lastPickedPresetId).toBeNull()
    expect(onStateChange).toHaveBeenCalledOnce()
    expect(setSettingsSaveMessage).toHaveBeenCalledWith('Profile added. Save settings to persist.')
  })
})

describe('createSettingsMutations.removeTransformationPreset', () => {
  it('keeps default preset valid and clears stale lastPickedPresetId after removing a profile', () => {
    const state = createState(
      structuredClone({
        ...DEFAULT_SETTINGS,
        transformation: {
          ...DEFAULT_SETTINGS.transformation,
          defaultPresetId: 'default-id',
          lastPickedPresetId: 'other-id',
          presets: [
            { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'default-id', name: 'Default' },
            { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'other-id', name: 'Other' }
          ]
        }
      })
    )
    const onStateChange = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsSaveMessage: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    mutations.removeTransformationPreset('other-id')

    expect(state.settings?.transformation.presets.map((preset) => preset.id)).toEqual(['default-id'])
    expect(state.settings?.transformation.defaultPresetId).toBe('default-id')
    expect(state.settings?.transformation.lastPickedPresetId).toBeNull()
    expect(onStateChange).toHaveBeenCalledOnce()
  })
})
