/*
Where: src/renderer/settings-mutations.test.ts
What: Unit tests for renderer settings mutation helpers.
Why: Verify API key persistence and profile save behavior after removing legacy manual-save paths.
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
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' }
})

const createMutations = (
  state: SettingsMutableState,
  overrides: Partial<Parameters<typeof createSettingsMutations>[0]> = {}
) => {
  const deps = {
    state,
    onStateChange: vi.fn(),
    invalidatePendingAutosave: vi.fn(),
    setSettingsValidationErrors: vi.fn(),
    addActivity: vi.fn(),
    addToast: vi.fn(),
    logError: vi.fn(),
    ...overrides
  }

  return {
    mutations: createSettingsMutations(deps),
    deps
  }
}

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

    const { mutations } = createMutations(state, { onStateChange, addActivity, addToast })

    await mutations.saveApiKey('groq', '  groq-key  ')

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledWith('groq', 'groq-key')
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

    const { mutations } = createMutations(state, { addToast, onStateChange })

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

    const { mutations } = createMutations(state, { onStateChange, addActivity, addToast })

    await mutations.saveApiKey('google', 'bad-key')

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

    const { mutations } = createMutations(state, { onStateChange, addActivity, addToast, logError })

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

    const { mutations } = createMutations(state, { onStateChange, addActivity, addToast, logError })

    await mutations.saveApiKey('elevenlabs', '  key-123  ')

    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledWith('elevenlabs', 'key-123')
    expect(window.speechToTextApi.getApiKeyStatus).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.elevenlabs).toBe('Failed: boom')
    expect(addActivity).toHaveBeenCalledWith('ElevenLabs API key save failed: boom', 'error')
    expect(addToast).toHaveBeenCalledWith('ElevenLabs API key save failed: boom', 'error')
    expect(logError).toHaveBeenCalledWith('renderer.api_key_save_failed', expect.any(Error), { provider: 'elevenlabs' })
    expect(onStateChange).toHaveBeenCalledTimes(3)
  })

  it('serializes same-provider saves so rapid consecutive blur saves persist in order', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    let releaseFirstSetApiKey = () => {}
    const firstSetApiKeyGate = new Promise<void>((resolve) => {
      releaseFirstSetApiKey = resolve
    })
    vi.mocked(window.speechToTextApi.setApiKey).mockImplementation(
      async (_provider: ApiKeyProvider, apiKey: string) =>
        await (apiKey === 'old-google-key' ? firstSetApiKeyGate : Promise.resolve())
    )

    const { mutations } = createMutations(state, { onStateChange, addActivity, addToast })

    const firstSave = mutations.saveApiKey('google', 'old-google-key')
    const secondSave = mutations.saveApiKey('google', 'new-google-key')

    await vi.waitFor(() => {
      expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(1)
    })

    releaseFirstSetApiKey()
    await firstSave
    await secondSave

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledTimes(2)
    expect(window.speechToTextApi.setApiKey).toHaveBeenNthCalledWith(1, 'google', 'old-google-key')
    expect(window.speechToTextApi.setApiKey).toHaveBeenNthCalledWith(2, 'google', 'new-google-key')
    expect(window.speechToTextApi.getApiKeyStatus).toHaveBeenCalledTimes(2)
    expect(state.apiKeySaveStatus.google).toBe('Saved.')
    expect(addActivity).toHaveBeenLastCalledWith('Saved Google API key.', 'success')
    expect(addToast).toHaveBeenLastCalledWith('Google API key saved.', 'success')
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
    const addToast = vi.fn()

    const { mutations } = createMutations(state, { addToast })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')
    await mutations.addTransformationPresetAndSave()
    await mutations.removeTransformationPresetAndSave('preset-a')

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(3)
    expect(addToast).not.toHaveBeenCalled()
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

  it('blocks invalid non-default profile drafts and does not persist or toast', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User {{text}}' }
    ]
    const state = createState(settings)
    const setSettingsValidationErrors = vi.fn()
    const addToast = vi.fn()

    const { mutations } = createMutations(state, { setSettingsValidationErrors, addToast })

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
    expect(addToast).not.toHaveBeenCalled()
  })

  it('saves and normalizes a non-default profile draft without showing feedback messages', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User {{text}}' }
    ]
    const state = createState(settings)
    const addToast = vi.fn()

    const { mutations } = createMutations(state, { addToast })

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
    expect(addToast).not.toHaveBeenCalled()
  })

  it('returns false without toast when the target preset is missing', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()

    const { mutations } = createMutations(state, { addToast })

    const didSave = await mutations.saveTransformationPresetDraft('missing-preset', {
      name: 'Name',
      model: 'gemini-2.5-flash',
      systemPrompt: 'System',
      userPrompt: 'Rewrite {{text}}'
    })

    expect(didSave).toBe(false)
    expect(addToast).not.toHaveBeenCalled()
  })
})
