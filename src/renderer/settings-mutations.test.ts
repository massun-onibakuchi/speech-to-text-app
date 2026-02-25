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
  apiKeyTestStatus: { groq: '', elevenlabs: '', google: '' },
  apiKeysSaveMessage: '',
  audioInputSources: []
})

const withActivePreset = (
  settings: Settings,
  patch: Partial<Settings['transformation']['presets'][number]>
): Settings => {
  const activeId = settings.transformation.activePresetId
  return {
    ...settings,
    transformation: {
      ...settings.transformation,
      presets: settings.transformation.presets.map((preset) => (preset.id === activeId ? { ...preset, ...patch } : preset))
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
    const settings = withActivePreset(structuredClone(DEFAULT_SETTINGS), {
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
    const settings = withActivePreset(structuredClone(DEFAULT_SETTINGS), {
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
    const savedPreset = savedSettings.transformation.presets.find((preset) => preset.id === savedSettings.transformation.activePresetId)
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

    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledWith('groq', 'groq-key')
    expect(window.speechToTextApi.getApiKeyStatus).toHaveBeenCalledTimes(1)
    expect(state.apiKeyStatus.groq).toBe(true)
    expect(state.apiKeySaveStatus.groq).toBe('Saved.')
    expect(state.apiKeySaveStatus.elevenlabs).toBe('Draft not saved yet')
    expect(state.apiKeysSaveMessage).toBe('Groq API key saved.')
    expect(addActivity).toHaveBeenCalledWith('Saved Groq API key.', 'success')
    expect(addToast).toHaveBeenCalledWith('Groq API key saved.', 'success')
    expect(onStateChange).toHaveBeenCalled()
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

    expect(window.speechToTextApi.setApiKey).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.google).toBe('Enter a key before saving.')
    expect(state.apiKeysSaveMessage).toBe('Enter a Google API key to save.')
    expect(addToast).toHaveBeenCalledWith('Enter a Google API key to save.', 'error')
    expect(onStateChange).toHaveBeenCalledOnce()
  })
})
