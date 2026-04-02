/*
Where: src/renderer/settings-mutations.test.ts
What: Unit tests for renderer settings save mutations.
Why: Ensure prompt validation blocks invalid profile saves and normalizes legacy placeholders.
*/

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
import type { ApiKeyProvider, LlmProviderStatusSnapshot } from '../shared/ipc'
import { createSettingsMutations, type SettingsMutableState } from './settings-mutations'

const defaultLlmProviderStatus = (): LlmProviderStatusSnapshot => ({
  google: {
    provider: 'google',
    credential: { kind: 'api_key', configured: false },
    status: { kind: 'missing_credentials', message: 'Add a Google API key to enable Gemini transformation.' },
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: false }]
  },
  ollama: {
    provider: 'ollama',
    credential: { kind: 'local' },
    status: { kind: 'runtime_unavailable', message: 'Ollama is not installed.' },
    models: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', available: false }]
  },
  'openai-subscription': {
    provider: 'openai-subscription',
    credential: { kind: 'cli', installed: true },
    status: {
      kind: 'cli_login_required',
      message: 'Codex CLI is installed but not signed in. Run `codex login` in your terminal, then refresh.'
    },
    models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
  }
})

const createState = (settings: Settings): SettingsMutableState => ({
  settings,
  persistedSettings: structuredClone(settings),
  settingsValidationErrors: {},
  apiKeyStatus: { groq: false, elevenlabs: false, google: false },
  llmProviderStatus: defaultLlmProviderStatus(),
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' },
  audioInputSources: []
})

describe('createSettingsMutations.saveApiKey', () => {
  beforeEach(() => {
    const noopAsync = async () => {}
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(noopAsync),
      deleteApiKey: vi.fn(noopAsync),
      connectLlmProvider: vi.fn(async () => {}),
      disconnectLlmProvider: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: true, elevenlabs: false, google: false })),
      getLlmProviderStatus: vi.fn(async () => defaultLlmProviderStatus()),
      playSound: vi.fn(noopAsync)
    }
  })

  it('saves a single provider key without overwriting other provider save statuses', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    state.apiKeySaveStatus.elevenlabs = 'Draft not saved yet'
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce({
      ...defaultLlmProviderStatus(),
      google: {
        provider: 'google',
        credential: { kind: 'api_key', configured: true },
        status: { kind: 'ready', message: 'Google API key is configured.' },
        models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: true }]
      }
    })

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
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
    expect(window.speechToTextApi.getLlmProviderStatus).toHaveBeenCalledTimes(1)
    expect(state.apiKeyStatus.groq).toBe(true)
    expect(state.llmProviderStatus.google.credential).toEqual({ kind: 'api_key', configured: true })
    expect(state.apiKeySaveStatus.groq).toBe('Saved.')
    expect(state.apiKeySaveStatus.elevenlabs).toBe('Draft not saved yet')
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

  it('keeps save marked successful when the follow-up LLM readiness refresh fails', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockRejectedValueOnce(new Error('readiness timeout'))

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError
    })

    await mutations.saveApiKey('google', 'google-key')

    expect(state.apiKeySaveStatus.google).toBe('Saved.')
    expect(addToast).toHaveBeenCalledWith('Google API key saved.', 'success')
    expect(logError).toHaveBeenCalledWith('renderer.llm_provider_status_refresh_failed', expect.any(Error))
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
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError
    })

    await mutations.saveApiKey('groq', 'groq-key')

    expect(window.speechToTextApi.setApiKey).not.toHaveBeenCalled()
    expect(window.speechToTextApi.getApiKeyStatus).not.toHaveBeenCalled()
    expect(state.apiKeySaveStatus.groq).toBe('Failed: validation timeout')
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

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError: vi.fn()
    })

    const firstSave = mutations.saveApiKey('google', 'old-google-key')
    const secondSave = mutations.saveApiKey('google', 'new-google-key')

    await vi.waitFor(() => {
      expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(1)
    })
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledWith('google', 'old-google-key')
    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledTimes(1)

    releaseFirstSetApiKey()
    await firstSave
    await secondSave

    expect(window.speechToTextApi.testApiKeyConnection).toHaveBeenCalledTimes(2)
    expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(2)
    expect(window.speechToTextApi.setApiKey).toHaveBeenNthCalledWith(1, 'google', 'old-google-key')
    expect(window.speechToTextApi.setApiKey).toHaveBeenNthCalledWith(2, 'google', 'new-google-key')
    expect(window.speechToTextApi.getApiKeyStatus).toHaveBeenCalledTimes(2)
    expect(state.apiKeySaveStatus.google).toBe('Saved.')
    expect(addToast).toHaveBeenLastCalledWith('Google API key saved.', 'success')
  })
})

describe('createSettingsMutations.deleteApiKey', () => {
  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      deleteApiKey: vi.fn(async () => {}),
      connectLlmProvider: vi.fn(async () => {}),
      disconnectLlmProvider: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false })),
      getLlmProviderStatus: vi.fn(async () => defaultLlmProviderStatus()),
      playSound: vi.fn(async () => {})
    }
  })

  it('deletes provider key and reports success status', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    vi.mocked(window.speechToTextApi.getApiKeyStatus).mockResolvedValueOnce({
      groq: false,
      elevenlabs: true,
      google: false
    })
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce(defaultLlmProviderStatus())

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError: vi.fn()
    })

    const didDelete = await mutations.deleteApiKey('groq')

    expect(didDelete).toBe(true)
    expect(window.speechToTextApi.deleteApiKey).toHaveBeenCalledWith('groq')
    expect(window.speechToTextApi.getLlmProviderStatus).toHaveBeenCalledTimes(1)
    expect(state.llmProviderStatus.google.credential).toEqual({ kind: 'api_key', configured: false })
    expect(state.apiKeySaveStatus.groq).toBe('Deleted.')
    expect(addToast).toHaveBeenCalledWith('Groq API key deleted.', 'success')
    expect(onStateChange).toHaveBeenCalledTimes(2)
  })

  it('keeps failure state and returns false when delete throws', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    const addActivity = vi.fn()
    const addToast = vi.fn()
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.deleteApiKey).mockRejectedValueOnce(new Error('network down'))

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity,
      addToast,
      logError
    })

    const didDelete = await mutations.deleteApiKey('google')

    expect(didDelete).toBe(false)
    expect(state.apiKeySaveStatus.google).toBe('Failed: network down')
    expect(addToast).toHaveBeenCalledWith('Google API key delete failed: network down', 'error')
    expect(logError).toHaveBeenCalledWith('renderer.api_key_delete_failed', expect.any(Error), { provider: 'google' })
    expect(onStateChange).toHaveBeenCalledTimes(2)
  })

  it('keeps delete marked successful when the follow-up LLM readiness refresh fails', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockRejectedValueOnce(new Error('readiness timeout'))

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError
    })

    const didDelete = await mutations.deleteApiKey('google')

    expect(didDelete).toBe(true)
    expect(state.apiKeySaveStatus.google).toBe('Deleted.')
    expect(addToast).toHaveBeenCalledWith('Google API key deleted.', 'success')
    expect(logError).toHaveBeenCalledWith('renderer.llm_provider_status_refresh_failed', expect.any(Error))
  })

  it('serializes save and delete operations for the same provider', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const onStateChange = vi.fn()
    let releaseSet = () => {}
    const setGate = new Promise<void>((resolve) => {
      releaseSet = resolve
    })
    vi.mocked(window.speechToTextApi.setApiKey).mockImplementation(async () => await setGate)

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    const savePending = mutations.saveApiKey('google', 'new-key')
    const deletePending = mutations.deleteApiKey('google')

    await vi.waitFor(() => {
      expect(window.speechToTextApi.setApiKey).toHaveBeenCalledTimes(1)
    })
    expect(window.speechToTextApi.deleteApiKey).not.toHaveBeenCalled()

    releaseSet()
    await savePending
    await deletePending

    expect(window.speechToTextApi.deleteApiKey).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.deleteApiKey).toHaveBeenCalledWith('google')
  })
})

describe('createSettingsMutations LLM provider auth', () => {
  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      deleteApiKey: vi.fn(async () => {}),
      connectLlmProvider: vi.fn(async () => {}),
      disconnectLlmProvider: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false })),
      getLlmProviderStatus: vi.fn(async () => ({
        ...defaultLlmProviderStatus(),
        'openai-subscription': {
          provider: 'openai-subscription',
          credential: { kind: 'cli', installed: true, version: '0.28.0' },
          status: {
            kind: 'ready',
            message: 'Codex CLI 0.28.0 is ready for ChatGPT subscription access.'
          },
          models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: true }]
        }
      })),
      playSound: vi.fn(async () => {})
    }
  })

  it('refreshes OpenAI subscription readiness and shows terminal guidance when Codex login is still required', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const onStateChange = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce(defaultLlmProviderStatus())
    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    const didConnect = await mutations.connectLlmProvider()

    expect(didConnect).toBe(true)
    expect(window.speechToTextApi.connectLlmProvider).not.toHaveBeenCalled()
    expect(state.llmProviderStatus['openai-subscription'].credential).toEqual({ kind: 'cli', installed: true })
    expect(addToast).toHaveBeenCalledWith('Run `codex login` in your terminal, then click Refresh.', 'info')
  })

  it('shows install guidance when Codex CLI is missing during refresh', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const onStateChange = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce({
      ...defaultLlmProviderStatus(),
      'openai-subscription': {
        provider: 'openai-subscription',
        credential: { kind: 'cli', installed: false },
        status: {
          kind: 'cli_not_installed',
          message: 'Codex CLI is not installed. Install it to use ChatGPT subscription models.'
        },
        models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
      }
    })

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await expect(mutations.connectLlmProvider()).resolves.toBe(true)
    expect(addToast).toHaveBeenCalledWith('Install Codex CLI, then click Refresh again.', 'info')
  })

  it('surfaces probe failures when the Codex CLI refresh returns diagnostics', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const onStateChange = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce({
      ...defaultLlmProviderStatus(),
      'openai-subscription': {
        provider: 'openai-subscription',
        credential: { kind: 'cli', installed: true },
        status: {
          kind: 'cli_probe_failed',
          message: 'Codex CLI readiness probe failed.'
        },
        models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
      }
    })

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await expect(mutations.connectLlmProvider()).resolves.toBe(true)
    expect(addToast).toHaveBeenCalledWith('Codex CLI check failed: Codex CLI readiness probe failed.', 'error')
  })

  it('disconnects the OpenAI subscription provider and refreshes readiness', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const addToast = vi.fn()
    const onStateChange = vi.fn()
    vi.mocked(window.speechToTextApi.getLlmProviderStatus).mockResolvedValueOnce(defaultLlmProviderStatus())

    const mutations = createSettingsMutations({
      state,
      onStateChange,
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    const didDisconnect = await mutations.disconnectLlmProvider()

    expect(didDisconnect).toBe(true)
    expect(window.speechToTextApi.disconnectLlmProvider).toHaveBeenCalledWith('openai-subscription')
    expect(state.llmProviderStatus['openai-subscription'].credential).toEqual({ kind: 'cli', installed: true })
    expect(addToast).toHaveBeenCalledWith('OpenAI subscription disconnected.', 'success')
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
  const validNewProfileDraft = {
    name: 'Gamma',
    provider: 'google' as const,
    model: 'gemini-2.5-flash' as const,
    systemPrompt: 'System Gamma',
    userPrompt: 'User <input_text>{{text}}</input_text>'
  }

  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      deleteApiKey: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false })),
      getLlmProviderStatus: vi.fn(async () => defaultLlmProviderStatus()),
      playSound: vi.fn(async () => {})
    }
  })

  it('persists default/create/remove profile actions explicitly', async () => {
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
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')
    await mutations.createTransformationPresetFromDraftAndSave(validNewProfileDraft)
    await mutations.removeTransformationPresetAndSave('preset-a')

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(3)
  })

  it('does not emit inline save message when default profile is updated and saved', async () => {
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
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(1)
  })

  it('plays the default-profile-changed sound after a successful default profile save', async () => {
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
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')

    expect(window.speechToTextApi.playSound).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('default_profile_changed')
  })

  it('does not play the default-profile-changed sound when the saved default profile is unchanged', async () => {
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
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-a')

    expect(window.speechToTextApi.playSound).not.toHaveBeenCalled()
  })

  it('logs and tolerates default-profile-changed sound playback failure after a successful save', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta' }
    ]
    const state = createState(settings)
    const logError = vi.fn()
    vi.mocked(window.speechToTextApi.playSound).mockRejectedValueOnce(new Error('speaker busy'))

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError
    })

    const didSave = await mutations.setDefaultTransformationPresetAndSave('preset-b')
    await Promise.resolve()

    expect(didSave).toBe(true)
    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('default_profile_changed')
    expect(logError).toHaveBeenCalledWith('renderer.default_profile_changed_sound_failed', expect.any(Error), {
      previousDefaultPresetId: 'preset-a',
      savedDefaultPresetId: 'preset-b'
    })
  })

  it('persists a new profile only when explicit create-from-draft save is called', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.createTransformationPresetFromDraftAndSave(validNewProfileDraft)

    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(1)
  })

  it('emits error toasts when default/create/remove profile persistence fails', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta' }
    ]
    const state = createState(settings)
    const addToast = vi.fn()
    vi.mocked(window.speechToTextApi.setSettings).mockRejectedValue(new Error('disk error'))

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await mutations.setDefaultTransformationPresetAndSave('preset-b')
    await mutations.createTransformationPresetFromDraftAndSave(validNewProfileDraft)
    await mutations.removeTransformationPresetAndSave('preset-a')

    expect(addToast).toHaveBeenCalledWith('Failed to update default profile: disk error', 'error')
    expect(addToast).toHaveBeenCalledWith('Failed to add profile: disk error', 'error')
    expect(addToast).toHaveBeenCalledWith('Failed to remove profile: disk error', 'error')
  })

  it('does not change default profile when creating a profile from draft', async () => {
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
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.createTransformationPresetFromDraftAndSave(validNewProfileDraft)

    const savedSettings = vi.mocked(window.speechToTextApi.setSettings).mock.calls[0]?.[0] as Settings
    expect(savedSettings.transformation.defaultPresetId).toBe('preset-a')
  })

  it('shows fallback toast when deleting the current default profile', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta' }
    ]
    const state = createState(settings)
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    await mutations.removeTransformationPresetAndSave('preset-a')

    expect(addToast).toHaveBeenCalledWith('The default profile was deleted, so "Beta" is now the default profile.', 'info')
  })
  it('blocks invalid new profile draft and does not persist', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    const setSettingsValidationErrors = vi.fn()
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    const didSave = await mutations.createTransformationPresetFromDraftAndSave({
      name: '   ',
      provider: 'google',
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
    expect(addToast).toHaveBeenCalledWith('Profile validation failed. Fix highlighted fields.', 'error')
  })

  it('preserves unrelated validation errors when new profile validation fails', async () => {
    const state = createState(structuredClone(DEFAULT_SETTINGS))
    state.settingsValidationErrors.toggleRecording = 'Toggle recording shortcut is required.'
    const setSettingsValidationErrors = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.createTransformationPresetFromDraftAndSave({
      name: '   ',
      provider: 'google',
      model: 'gemini-2.5-flash',
      systemPrompt: '   ',
      userPrompt: 'invalid'
    })

    expect(setSettingsValidationErrors).toHaveBeenCalledWith(
      expect.objectContaining({
        toggleRecording: 'Toggle recording shortcut is required.',
        presetName: 'Profile name is required.',
        systemPrompt: 'System prompt is required.',
        userPrompt: expect.stringContaining('{{text}}')
      })
    )
  })
})

describe('createSettingsMutations.saveTransformationPresetDraft', () => {
  beforeEach(() => {
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      setSettings: vi.fn(async (settings: Settings) => settings),
      setApiKey: vi.fn(async () => {}),
      deleteApiKey: vi.fn(async () => {}),
      testApiKeyConnection: vi.fn(async () => ({ provider: 'google' as ApiKeyProvider, status: 'success', message: 'ok' })),
      getApiKeyStatus: vi.fn(async () => ({ groq: false, elevenlabs: false, google: false })),
      getLlmProviderStatus: vi.fn(async () => defaultLlmProviderStatus())
    }
  })

  it('blocks invalid non-default profile drafts and does not persist', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User <input_text>{{text}}</input_text>' }
    ]
    const state = createState(settings)
    const setSettingsValidationErrors = vi.fn()
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    const didSave = await mutations.saveTransformationPresetDraft('preset-b', {
      name: '   ',
      provider: 'google',
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
    expect(addToast).toHaveBeenCalledWith('Fix the highlighted validation errors before saving.', 'error')
  })

  it('clears stale preset validation errors while preserving unrelated errors on successful draft validation', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User <input_text>{{text}}</input_text>' }
    ]
    const state = createState(settings)
    state.settingsValidationErrors = {
      presetName: 'Old name error',
      systemPrompt: 'Old system error',
      userPrompt: 'Old prompt error',
      toggleRecording: 'Toggle recording shortcut is required.'
    }
    const setSettingsValidationErrors = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors,
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    await mutations.saveTransformationPresetDraft('preset-b', {
      name: 'Beta v2',
      provider: 'google',
      model: 'gemini-2.5-flash',
      systemPrompt: 'System Updated',
      userPrompt: 'Rewrite:\n<input_text>{{text}}</input_text>'
    })

    expect(setSettingsValidationErrors).toHaveBeenCalledWith({
      toggleRecording: 'Toggle recording shortcut is required.'
    })
  })

  it('saves and normalizes a non-default profile draft', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'preset-a'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'preset-a', name: 'Alpha' },
      { ...settings.transformation.presets[0], id: 'preset-b', name: 'Beta', systemPrompt: 'System B', userPrompt: 'User <input_text>{{text}}</input_text>' }
    ]
    const state = createState(settings)

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast: vi.fn(),
      logError: vi.fn()
    })

    const didSave = await mutations.saveTransformationPresetDraft('preset-b', {
      name: '  Beta v2  ',
      provider: 'google',
      model: 'gemini-2.5-flash',
      systemPrompt: '  System Updated  ',
      userPrompt: 'Rewrite:\n<input_text>{{text}}</input_text>'
    })

    expect(didSave).toBe(true)
    expect(window.speechToTextApi.setSettings).toHaveBeenCalledTimes(1)
    const savedSettings = vi.mocked(window.speechToTextApi.setSettings).mock.calls[0]?.[0] as Settings
    const savedPreset = savedSettings.transformation.presets.find((preset) => preset.id === 'preset-b')
    expect(savedPreset?.name).toBe('Beta v2')
    expect(savedPreset?.systemPrompt).toBe('  System Updated  ')
    expect(savedPreset?.userPrompt).toBe('Rewrite:\n<input_text>{{text}}</input_text>')
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

  it('emits an error toast when trying to remove the last profile', () => {
    const onlyPreset = { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'only', name: 'Only' }
    const state = createState(
      structuredClone({
        ...DEFAULT_SETTINGS,
        transformation: {
          ...DEFAULT_SETTINGS.transformation,
          defaultPresetId: 'only',
          lastPickedPresetId: null,
          presets: [onlyPreset]
        }
      })
    )
    const addToast = vi.fn()
    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    mutations.removeTransformationPreset('only')

    expect(addToast).toHaveBeenCalledWith('At least one profile is required.', 'error')
  })

  it('shows fallback toast when removing the current default profile without immediate save', () => {
    const state = createState(
      structuredClone({
        ...DEFAULT_SETTINGS,
        transformation: {
          ...DEFAULT_SETTINGS.transformation,
          defaultPresetId: 'default-id',
          lastPickedPresetId: null,
          presets: [
            { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'default-id', name: 'Default' },
            { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'other-id', name: 'Other' }
          ]
        }
      })
    )
    const addToast = vi.fn()

    const mutations = createSettingsMutations({
      state,
      onStateChange: vi.fn(),
      invalidatePendingAutosave: vi.fn(),
      setSettingsValidationErrors: vi.fn(),
      addActivity: vi.fn(),
      addToast,
      logError: vi.fn()
    })

    mutations.removeTransformationPreset('default-id')

    expect(addToast).toHaveBeenCalledWith('The default profile was deleted, so "Other" is now the default profile.', 'info')
  })
})
