/*
Where: src/renderer/renderer-app.test.ts
What: Smoke tests for the React-owned renderer app mount path.
Why: Guard the full cutover from legacy shell templates to a single React tree.
*/

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import type {
  ApiKeyConnectionTestResult,
  ApiKeyProvider,
  CompositeTransformResult,
  HotkeyErrorNotification,
  IpcApi,
  RecordingCommand,
  RecordingCommandDispatch,
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionStateSnapshot
} from '../shared/ipc'
import { COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE } from '../shared/ipc'
import { startRendererApp, stopRendererAppForTests } from './renderer-app'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const updateTextInput = async (input: HTMLInputElement, value: string): Promise<void> => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!valueSetter) {
    throw new Error('Unable to resolve HTMLInputElement value setter.')
  }
  valueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

const blurOutOfRow = async (input: HTMLElement): Promise<void> => {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
  await flush()
}

// Boot needs more flush passes than a typical condition because the async render
// chain (ping + getSettings + getApiKeyStatus + refreshAudioInputSources) chains
// several promise hops before React renders the nav tabs.
const BOOT_MAX_FLUSH_ATTEMPTS = 30
const AUTOSAVE_WAIT_MS = 700

const waitForBoot = async (): Promise<void> => {
  for (let attempt = 0; attempt < BOOT_MAX_FLUSH_ATTEMPTS; attempt += 1) {
    await flush()
    if (document.querySelector('[data-route-tab="activity"]')) {
      return
    }
  }
}

const waitForCondition = async (label: string, condition: () => boolean, attempts = 20): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await flush()
    if (condition()) {
      return
    }
  }
  throw new Error(`Timed out waiting for ${label}`)
}

interface IpcHarness {
  api: IpcApi
  setApiKeyStatus: (status: { groq: boolean; elevenlabs: boolean; google: boolean }) => void
  setSettings: (next: typeof DEFAULT_SETTINGS) => void
  emitCompositeTransformStatus: (result: CompositeTransformResult) => void
  emitRecordingCommand: (dispatch: RecordingCommandDispatch) => void
  emitStreamingSessionState: (snapshot: StreamingSessionStateSnapshot) => void
  emitStreamingSegment: (segment: StreamingSegmentEvent) => void
  emitStreamingError: (error: StreamingErrorEvent) => void
  emitSettingsUpdated: () => void
  emitOpenSettings: () => void
  playSoundSpy: ReturnType<typeof vi.fn>
  setSettingsSpy: ReturnType<typeof vi.fn>
  onRecordingCommandSpy: ReturnType<typeof vi.fn>
  onStreamingSessionStateSpy: ReturnType<typeof vi.fn>
  onStreamingSegmentSpy: ReturnType<typeof vi.fn>
  onStreamingErrorSpy: ReturnType<typeof vi.fn>
  onCompositeTransformStatusSpy: ReturnType<typeof vi.fn>
  onHotkeyErrorSpy: ReturnType<typeof vi.fn>
  onSettingsUpdatedSpy: ReturnType<typeof vi.fn>
  onOpenSettingsSpy: ReturnType<typeof vi.fn>
}

const buildIpcHarness = (initialSettings?: typeof DEFAULT_SETTINGS): IpcHarness => {
  const defaultSettings = structuredClone(initialSettings ?? DEFAULT_SETTINGS)
  defaultSettings.transformation.presets = defaultSettings.transformation.presets.map((preset, index) =>
    index === 0
      ? {
          ...preset,
          systemPrompt: 'You are a careful editor.',
          userPrompt: 'Rewrite:\n<input_text>{{text}}</input_text>'
        }
      : preset
  )

  let apiKeyStatus = {
    groq: true,
    elevenlabs: true,
    google: true
  }

  const onRecordingCommandSpy = vi.fn((_listener: (dispatch: RecordingCommandDispatch) => void) => () => {})
  const onStreamingSessionStateSpy = vi.fn((_listener: (state: any) => void) => () => {})
  const onStreamingSegmentSpy = vi.fn((_listener: (segment: any) => void) => () => {})
  const onStreamingErrorSpy = vi.fn((_listener: (error: any) => void) => () => {})
  const onCompositeTransformStatusSpy = vi.fn((_listener: (result: CompositeTransformResult) => void) => () => {})
  const onHotkeyErrorSpy = vi.fn((_listener: (notification: HotkeyErrorNotification) => void) => () => {})
  const onSettingsUpdatedSpy = vi.fn((_listener: () => void) => () => {})
  const onOpenSettingsSpy = vi.fn((_listener: () => void) => () => {})
  let currentSettings = structuredClone(defaultSettings)
  const setSettingsSpy = vi.fn(async (settings: typeof DEFAULT_SETTINGS) => {
    currentSettings = structuredClone(settings)
    return settings
  })
  const playSoundSpy = vi.fn(async () => {})

  const api: IpcApi = {
    ping: async () => 'pong',
    getSettings: async () => structuredClone(currentSettings),
    setSettings: setSettingsSpy,
    getApiKeyStatus: async () => apiKeyStatus,
    setApiKey: async () => {},
    deleteApiKey: async () => {},
    testApiKeyConnection: async (provider: ApiKeyProvider): Promise<ApiKeyConnectionTestResult> => ({
      provider,
      status: 'success',
      message: 'ok'
    }),
    getHistory: async () => [],
    getAudioInputSources: async () => [],
    playSound: playSoundSpy,
    runRecordingCommand: async (_command: RecordingCommand) => {},
    submitRecordedAudio: async () => {},
    startStreamingSession: async () => {},
    stopStreamingSession: async () => {},
    pushStreamingAudioFrameBatch: async () => {},
    onRecordingCommand: onRecordingCommandSpy,
    onStreamingSessionState: onStreamingSessionStateSpy,
    onStreamingSegment: onStreamingSegmentSpy,
    onStreamingError: onStreamingErrorSpy,
    runPickTransformationFromClipboard: async () => {},
    onCompositeTransformStatus: onCompositeTransformStatusSpy,
    onHotkeyError: onHotkeyErrorSpy,
    onSettingsUpdated: onSettingsUpdatedSpy,
    onOpenSettings: onOpenSettingsSpy
  }

  return {
    api,
    setApiKeyStatus: (status) => {
      apiKeyStatus = status
    },
    setSettings: (next) => {
      currentSettings = structuredClone(next)
    },
    emitCompositeTransformStatus: (result) => {
      const listener = onCompositeTransformStatusSpy.mock.calls[0]?.[0] as
        | ((payload: CompositeTransformResult) => void)
        | undefined
      if (!listener) {
        throw new Error('Composite transform status listener is not registered.')
      }
      listener(result)
    },
    emitRecordingCommand: (dispatch) => {
      const listener = onRecordingCommandSpy.mock.calls[0]?.[0] as ((payload: RecordingCommandDispatch) => void) | undefined
      if (!listener) {
        throw new Error('Recording command listener is not registered.')
      }
      listener(dispatch)
    },
    emitStreamingSessionState: (snapshot) => {
      const listener = onStreamingSessionStateSpy.mock.calls[0]?.[0] as
        | ((payload: StreamingSessionStateSnapshot) => void)
        | undefined
      if (!listener) {
        throw new Error('Streaming session state listener is not registered.')
      }
      listener(snapshot)
    },
    emitStreamingSegment: (segment) => {
      const listener = onStreamingSegmentSpy.mock.calls[0]?.[0] as
        | ((payload: StreamingSegmentEvent) => void)
        | undefined
      if (!listener) {
        throw new Error('Streaming segment listener is not registered.')
      }
      listener(segment)
    },
    emitStreamingError: (error) => {
      const listener = onStreamingErrorSpy.mock.calls[0]?.[0] as
        | ((payload: StreamingErrorEvent) => void)
        | undefined
      if (!listener) {
        throw new Error('Streaming error listener is not registered.')
      }
      listener(error)
    },
    emitSettingsUpdated: () => {
      const listener = onSettingsUpdatedSpy.mock.calls[0]?.[0] as (() => void) | undefined
      if (!listener) {
        throw new Error('Settings updated listener is not registered.')
      }
      listener()
    },
    emitOpenSettings: () => {
      const listener = onOpenSettingsSpy.mock.calls[0]?.[0] as (() => void) | undefined
      if (!listener) {
        throw new Error('Open settings listener is not registered.')
      }
      listener()
    },
    playSoundSpy,
    setSettingsSpy,
    onRecordingCommandSpy,
    onStreamingSessionStateSpy,
    onStreamingSegmentSpy,
    onStreamingErrorSpy,
    onCompositeTransformStatusSpy,
    onHotkeyErrorSpy,
    onSettingsUpdatedSpy,
    onOpenSettingsSpy
  }
}

afterEach(() => {
  stopRendererAppForTests()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('renderer app', () => {
  it('mounts full React shell and renders required UI surfaces', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    // Keep route-tab selectors as an explicit UI contract for navigation tests/e2e flows.
    // New tab model: activity | profiles | shortcuts | dictionary | audio-input | settings.
    expect(mountPoint.querySelector('[data-route-tab="activity"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="dictionary"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="audio-input"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="settings"]')).not.toBeNull()
    expect(mountPoint.textContent).not.toContain('Speech-to-Text v1')
    // STY-03: "Recording Controls" heading removed; recording is indicated by the
    // circular button with aria-label.
    expect(mountPoint.querySelector('[aria-label="Start recording"]')).not.toBeNull()
    expect(mountPoint.textContent).not.toContain('Shortcut Contract')
    expect(harness.onStreamingSessionStateSpy).toHaveBeenCalledOnce()
    expect(harness.onStreamingSegmentSpy).toHaveBeenCalledOnce()
    expect(harness.onStreamingErrorSpy).toHaveBeenCalledOnce()
  })

  it('persists dictionary add via autosave from Dictionary tab', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    const keyInput = mountPoint.querySelector<HTMLInputElement>('#dictionary-new-key')
    const valueInput = mountPoint.querySelector<HTMLInputElement>('#dictionary-new-value')
    const addButton = mountPoint.querySelector<HTMLButtonElement>('#dictionary-add')
    if (!keyInput || !valueInput || !addButton) {
      throw new Error('Dictionary add controls were not found.')
    }

    await updateTextInput(keyInput, 'teh')
    await updateTextInput(valueInput, 'the')
    addButton.click()
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_WAIT_MS))
    await flush()

    expect(harness.setSettingsSpy).toHaveBeenCalled()
    const latest = harness.setSettingsSpy.mock.calls.at(-1)?.[0] as typeof DEFAULT_SETTINGS
    expect(latest.correction.dictionary.entries).toEqual(
      expect.arrayContaining([{ key: 'teh', value: 'the' }])
    )
  })

  it('deletes dictionary entry without confirmation dialog and persists via autosave', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.correction.dictionary.entries = [{ key: 'teh', value: 'the' }]
    const harness = buildIpcHarness(settings)
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    mountPoint.querySelector<HTMLButtonElement>('[aria-label="Delete dictionary entry teh"]')?.click()
    await waitForCondition('dictionary delete persistence', () => harness.setSettingsSpy.mock.calls.length > 0)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(harness.setSettingsSpy).toHaveBeenCalled()
    const latest = harness.setSettingsSpy.mock.calls.at(-1)?.[0] as typeof DEFAULT_SETTINGS
    expect(latest.correction.dictionary.entries).toEqual([])
  })

  it('renames an existing dictionary key on blur and persists the new casing', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.correction.dictionary.entries = [{ key: 'teh', value: 'the' }]
    const harness = buildIpcHarness(settings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    const keyInput = mountPoint.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    const valueInput = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    if (!keyInput || !valueInput) {
      throw new Error('Dictionary row inputs were not found.')
    }

    await updateTextInput(keyInput, 'Teh')
    await updateTextInput(valueInput, 'THE')
    await blurOutOfRow(valueInput)

    await waitForCondition('dictionary rename persistence', () => harness.setSettingsSpy.mock.calls.length > 0)
    const latest = harness.setSettingsSpy.mock.calls.at(-1)?.[0] as typeof DEFAULT_SETTINGS
    expect(latest.correction.dictionary.entries).toEqual([{ key: 'Teh', value: 'THE' }])
    expect(mountPoint.querySelector('#toast-layer')?.textContent ?? '').not.toContain('Settings autosaved.')
  })

  it('saves dictionary row blur even when unrelated settings drafts are locally invalid', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    const invalidSettings = structuredClone(DEFAULT_SETTINGS)
    invalidSettings.correction.dictionary.entries = [{ key: 'teh', value: 'the' }]
    invalidSettings.transformation.presets = invalidSettings.transformation.presets.map((preset, index) =>
      index === 0
        ? {
            ...preset,
            systemPrompt: '',
            userPrompt: ''
          }
        : preset
    )
    harness.api.getSettings = async () => structuredClone(invalidSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()
    mountPoint.querySelector<HTMLInputElement>('#settings-output-paste')?.click()
    await flush()

    await waitForCondition(
      'unrelated settings validation failure toast',
      () => (mountPoint.querySelector('#toast-layer')?.textContent ?? '').includes('Fix the highlighted validation errors before autosave.')
    )
    const beforeCalls = harness.setSettingsSpy.mock.calls.length

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    const rowKey = mountPoint.querySelector<HTMLInputElement>('[aria-label="Key for teh"]')
    const rowValue = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    if (!rowKey || !rowValue) {
      throw new Error('Dictionary row inputs were not found.')
    }

    await updateTextInput(rowKey, 'Teh')
    await updateTextInput(rowValue, 'THE')
    await blurOutOfRow(rowValue)

    await waitForCondition(
      'dictionary row blur save while unrelated settings invalid',
      () => harness.setSettingsSpy.mock.calls.length === beforeCalls + 1
    )
    const saved = harness.setSettingsSpy.mock.calls.at(-1)?.[0] as typeof DEFAULT_SETTINGS
    expect(saved.correction.dictionary.entries).toEqual([{ key: 'Teh', value: 'THE' }])
  })

  it('serializes overlapping dictionary blur saves so later saves do not overwrite earlier ones', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.correction.dictionary.entries = [
      { key: 'alpha', value: 'one' },
      { key: 'beta', value: 'two' }
    ]
    const harness = buildIpcHarness(settings)
    const resolvers: Array<() => void> = []
    harness.setSettingsSpy.mockImplementation(
      (nextSettings: typeof DEFAULT_SETTINGS) =>
        new Promise<typeof DEFAULT_SETTINGS>((resolve) => {
          resolvers.push(() => resolve(nextSettings))
        })
    )
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    const alphaValue = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for alpha"]')
    const betaValue = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for beta"]')
    if (!alphaValue || !betaValue) {
      throw new Error('Dictionary row inputs were not found.')
    }

    await updateTextInput(alphaValue, 'ONE')
    await blurOutOfRow(alphaValue)
    await updateTextInput(betaValue, 'TWO')
    await blurOutOfRow(betaValue)

    expect(harness.setSettingsSpy).toHaveBeenCalledTimes(1)

    const resolveFirst = resolvers.shift()
    if (!resolveFirst) {
      throw new Error('First dictionary save resolver was not captured.')
    }
    resolveFirst()
    await waitForCondition('second queued dictionary save', () => harness.setSettingsSpy.mock.calls.length === 2)

    const resolveSecond = resolvers.shift()
    if (!resolveSecond) {
      throw new Error('Second dictionary save resolver was not captured.')
    }
    resolveSecond()
    await flush()
    await flush()

    const latest = harness.setSettingsSpy.mock.calls.at(-1)?.[0] as typeof DEFAULT_SETTINGS
    expect(latest.correction.dictionary.entries).toEqual([
      { key: 'alpha', value: 'ONE' },
      { key: 'beta', value: 'TWO' }
    ])
  })

  it('requeues valid unrelated autosave after a dictionary save failure', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.correction.dictionary.entries = [{ key: 'teh', value: 'the' }]
    const harness = buildIpcHarness(settings)
    harness.setSettingsSpy.mockImplementationOnce(async () => {
      throw new Error('Disk full')
    })
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()
    mountPoint.querySelector<HTMLInputElement>('#settings-output-paste')?.click()
    await flush()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()
    mountPoint.querySelector<HTMLButtonElement>('[aria-label="Delete dictionary entry teh"]')?.click()
    await flush()

    await waitForCondition(
      'dictionary save failure toast',
      () => (mountPoint.querySelector('#toast-layer')?.textContent ?? '').includes('Failed to save dictionary changes: Disk full')
    )

    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_WAIT_MS))
    await waitForCondition(
      'requeued unrelated autosave after dictionary failure',
      () => harness.setSettingsSpy.mock.calls.length >= 2,
      40
    )
  })

  it('attaches renderer event listeners during boot', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    expect(harness.onRecordingCommandSpy).toHaveBeenCalledTimes(1)
    expect(harness.onStreamingSessionStateSpy).toHaveBeenCalledTimes(1)
    expect(harness.onStreamingSegmentSpy).toHaveBeenCalledTimes(1)
    expect(harness.onStreamingErrorSpy).toHaveBeenCalledTimes(1)
    expect(harness.onCompositeTransformStatusSpy).toHaveBeenCalledTimes(1)
    expect(harness.onHotkeyErrorSpy).toHaveBeenCalledTimes(1)
    expect(harness.onSettingsUpdatedSpy).toHaveBeenCalledTimes(1)
    expect(harness.onOpenSettingsSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaces streaming session progress, finalized segments, and provider errors', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.processing.mode = 'streaming'
    settings.processing.streaming.enabled = true
    settings.processing.streaming.provider = 'local_whispercpp_coreml'
    settings.processing.streaming.transport = 'native_stream'
    settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    settings.processing.streaming.outputMode = 'stream_raw_dictation'
    const harness = buildIpcHarness(settings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    harness.emitStreamingSessionState({
      sessionId: 'session-1',
      state: 'active',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })
    harness.emitStreamingSegment({
      sessionId: 'session-1',
      sequence: 0,
      text: 'hello world',
      delimiter: ' ',
      isFinal: true,
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
    harness.emitStreamingError({
      sessionId: 'session-1',
      code: 'provider_exited',
      message: 'child process exited unexpectedly'
    })
    await flush()

    expect(mountPoint.querySelector('[data-status-streaming-session]')?.textContent).toContain('stream:active')
    expect(mountPoint.textContent).toContain('Streaming session active')
    expect(mountPoint.textContent).toContain('Streamed text: hello world')
    expect(mountPoint.querySelector('#toast-layer')?.textContent ?? '').toContain('provider_exited')
  })

  it('opens settings tab when main process emits open-settings event', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    expect(mountPoint.querySelector('[data-tab-panel="settings"]')?.classList.contains('hidden')).toBe(true)
    harness.emitOpenSettings()
    await flush()

    expect(mountPoint.querySelector('[data-tab-panel="settings"]')?.classList.contains('hidden')).toBe(false)
  })

  it('handles open-settings emitted during async boot before settings load resolves', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    let resolveSettings!: (value: typeof DEFAULT_SETTINGS) => void
    const deferredGetSettings = vi.fn(
      async () =>
        new Promise<typeof DEFAULT_SETTINGS>((resolve) => {
          resolveSettings = resolve
        })
    )
    const api: IpcApi = {
      ...harness.api,
      getSettings: deferredGetSettings
    }

    vi.stubGlobal('speechToTextApi', api)
    window.speechToTextApi = api

    startRendererApp(mountPoint)

    await waitForCondition('open-settings listener registration', () => harness.onOpenSettingsSpy.mock.calls.length === 1)
    harness.emitOpenSettings()
    await flush()

    resolveSettings(structuredClone(DEFAULT_SETTINGS))
    await waitForBoot()
    await flush()

    expect(mountPoint.querySelector('[data-tab-panel="settings"]')?.classList.contains('hidden')).toBe(false)
  })

  it('refreshes settings on external settings-updated event and updates default profile badge immediately', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const customSettings = structuredClone(DEFAULT_SETTINGS)
    customSettings.transformation.presets = [
      {
        ...customSettings.transformation.presets[0],
        id: 'preset-a',
        name: 'Alpha'
      },
      {
        ...customSettings.transformation.presets[0],
        id: 'preset-b',
        name: 'Beta'
      }
    ]
    customSettings.transformation.defaultPresetId = 'preset-a'
    const harness = buildIpcHarness(customSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()
    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="profiles"]')?.click()
    await flush()

    expect(mountPoint.querySelector('[aria-label="Alpha profile (default)"]')).not.toBeNull()
    expect(mountPoint.querySelector('[aria-label="Beta profile (default)"]')).toBeNull()

    const externalMutation = structuredClone(customSettings)
    externalMutation.transformation.defaultPresetId = 'preset-b'
    harness.setSettings(externalMutation)
    harness.emitSettingsUpdated()
    await flush()
    await flush()

    expect(mountPoint.querySelector('[aria-label="Alpha profile (default)"]')).toBeNull()
    expect(mountPoint.querySelector('[aria-label="Beta profile (default)"]')).not.toBeNull()
  })

  it('refreshes dictionary entries on external settings-updated event', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const customSettings = structuredClone(DEFAULT_SETTINGS)
    customSettings.correction.dictionary.entries = [{ key: 'teh', value: 'the' }]
    const harness = buildIpcHarness(customSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()
    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="dictionary"]')?.click()
    await flush()

    const initialRowInput = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    expect(initialRowInput?.value).toBe('the')

    const externalMutation = structuredClone(customSettings)
    externalMutation.correction.dictionary.entries = [{ key: 'gpt', value: 'GPT' }]
    harness.setSettings(externalMutation)
    harness.emitSettingsUpdated()
    await flush()
    await flush()

    const existingRowInput = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for teh"]')
    const addedRowInput = mountPoint.querySelector<HTMLInputElement>('[aria-label="Value for gpt"]')
    expect(existingRowInput).toBeNull()
    expect(addedRowInput?.value).toBe('GPT')
  })

  it('invalidates stale pending autosave when external settings-updated event arrives', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const customSettings = structuredClone(DEFAULT_SETTINGS)
    customSettings.transformation.presets = [
      {
        ...customSettings.transformation.presets[0],
        id: 'preset-a',
        name: 'Alpha'
      },
      {
        ...customSettings.transformation.presets[0],
        id: 'preset-b',
        name: 'Beta'
      }
    ]
    customSettings.transformation.defaultPresetId = 'preset-a'
    const harness = buildIpcHarness(customSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    // Schedule a non-secret autosave snapshot.
    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()
    const outputPasteCheckbox = mountPoint.querySelector<HTMLInputElement>('#settings-output-paste')
    outputPasteCheckbox?.click()
    await flush()

    const externalMutation = structuredClone(customSettings)
    externalMutation.transformation.defaultPresetId = 'preset-b'
    harness.setSettings(externalMutation)
    harness.emitSettingsUpdated()
    await flush()

    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_WAIT_MS))
    await flush()

    expect(harness.setSettingsSpy).not.toHaveBeenCalled()
  })

  it('renders recording controls in the Audio Input tab panel', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="audio-input"]')?.click()
    await flush()

    expect(mountPoint.querySelector('[data-tab-panel="audio-input"] [data-settings-section="audio-input"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-tab-panel="settings"] [data-settings-section="audio-input"]')).toBeNull()
  })

  it('refreshes API key status when navigating to activity tab', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    harness.setApiKeyStatus({
      groq: false,
      elevenlabs: true,
      google: true
    })

    const settingsTab = mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')
    const activityTab = mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="activity"]')
    settingsTab?.click()
    activityTab?.click()

    await waitForCondition(
      'API key blocked message after home tab navigation',
      () => !!mountPoint.textContent?.includes('Recording is blocked.')
    )

    expect(mountPoint.textContent).toContain('Recording is blocked.')
  })

  it('autosave success shows toast and does not render inline success message', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    const beforeCalls = harness.setSettingsSpy.mock.calls.length
    const outputPasteCheckbox = mountPoint.querySelector<HTMLInputElement>('#settings-output-paste')
    expect(outputPasteCheckbox).not.toBeNull()
    outputPasteCheckbox?.click()

    await new Promise((resolve) => { setTimeout(resolve, AUTOSAVE_WAIT_MS) })
    await waitForCondition(
      'autosave dispatch after non-API settings change',
      () => harness.setSettingsSpy.mock.calls.length > beforeCalls
    )
    await waitForCondition(
      'autosave success toast',
      () => (mountPoint.textContent ?? '').includes('Settings autosaved.')
    )
    expect(mountPoint.querySelector('[data-settings-save-message]')).toBeNull()
  })

  it('keeps the active tab when autosave fails for a valid shortcut update', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    harness.setSettingsSpy.mockRejectedValue(new Error('Disk full'))
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="shortcuts"]')?.click()
    await flush()

    mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.click()
    await flush()
    mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true, cancelable: true })
    )

    await new Promise((resolve) => { setTimeout(resolve, AUTOSAVE_WAIT_MS) })
    await flush()

    expect(mountPoint.querySelector('[data-route-tab="shortcuts"]')?.getAttribute('aria-pressed')).toBe('true')
    await waitForCondition(
      'autosave failure toast',
      () => (mountPoint.querySelector('#toast-layer')?.textContent ?? '').includes('Autosave failed: Disk full')
    )
    expect(mountPoint.querySelector('[data-settings-save-message]')).toBeNull()
  })

  it('shows an error toast when autosave validation fails and does not dispatch setSettings', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    const invalidSettings = structuredClone(DEFAULT_SETTINGS)
    invalidSettings.transformation.presets = invalidSettings.transformation.presets.map((preset, index) =>
      index === 0
        ? {
            ...preset,
            systemPrompt: '',
            userPrompt: ''
          }
        : preset
    )
    harness.api.getSettings = async () => structuredClone(invalidSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    const beforeCalls = harness.setSettingsSpy.mock.calls.length
    const outputPasteCheckbox = mountPoint.querySelector<HTMLInputElement>('#settings-output-paste')
    outputPasteCheckbox?.click()
    await flush()

    await waitForCondition(
      'autosave validation failure toast',
      () => (mountPoint.querySelector('#toast-layer')?.textContent ?? '').includes('Fix the highlighted validation errors before autosave.')
    )
    expect(harness.setSettingsSpy.mock.calls.length).toBe(beforeCalls)
    expect(mountPoint.querySelector('[data-settings-save-message]')).toBeNull()
  })

  it('uses default preset id for editor selection even when lastPickedPresetId differs', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    const divergentSettings = structuredClone(DEFAULT_SETTINGS)
    divergentSettings.transformation.defaultPresetId = 'default-id'
    divergentSettings.transformation.lastPickedPresetId = 'other-id'
    divergentSettings.transformation.presets = [
      {
        ...divergentSettings.transformation.presets[0],
        id: 'default-id',
        name: 'Default Profile',
        systemPrompt: 'default system',
        userPrompt: 'default <input_text>{{text}}</input_text>'
      },
      {
        ...divergentSettings.transformation.presets[0],
        id: 'other-id',
        name: 'Other Profile',
        systemPrompt: 'other system',
        userPrompt: 'other <input_text>{{text}}</input_text>'
      }
    ]
    harness.api.getSettings = async () => structuredClone(divergentSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    // Profiles tab panels are always in the DOM (just hidden via CSS).
    // The card with aria-label "... (default)" confirms the correct preset is marked default.
    await flush()

    const defaultCard = mountPoint.querySelector('[aria-label="Default Profile profile (default)"]')
    const otherCard = mountPoint.querySelector('[aria-label="Other Profile profile (default)"]')

    expect(defaultCard).not.toBeNull()
    expect(otherCard).toBeNull()
  })

  it('normalizes an invalid saved default preset id on boot so settings UI targets a real profile', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    const invalidSettings = structuredClone(DEFAULT_SETTINGS)
    invalidSettings.transformation.defaultPresetId = 'missing-default-id'
    invalidSettings.transformation.lastPickedPresetId = 'missing-last-picked-id'
    invalidSettings.transformation.presets = [
      {
        ...invalidSettings.transformation.presets[0],
        id: 'fallback-id',
        name: 'Fallback Profile',
        systemPrompt: 'fallback system',
        userPrompt: 'fallback <input_text>{{text}}</input_text>'
      },
      {
        ...invalidSettings.transformation.presets[0],
        id: 'other-id',
        name: 'Other Profile',
        systemPrompt: 'other system',
        userPrompt: 'other <input_text>{{text}}</input_text>'
      }
    ]
    harness.api.getSettings = async () => structuredClone(invalidSettings)
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    // Profiles panel is always in the DOM; the fallback (first) preset should be marked default.
    await flush()

    const fallbackCard = mountPoint.querySelector('[aria-label="Fallback Profile profile (default)"]')
    const otherCard = mountPoint.querySelector('[aria-label="Other Profile profile (default)"]')

    expect(fallbackCard).not.toBeNull()
    expect(otherCard).toBeNull()
  })

  it('does not append non-terminal transform enqueue messages to activity and appends terminal success only', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    const baselineCards = mountPoint.querySelectorAll('article[aria-label^="Activity:"]').length
    harness.emitCompositeTransformStatus({ status: 'ok', message: COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE })
    await flush()
    const activityPanelAfterAck = mountPoint.querySelector<HTMLElement>('[data-tab-panel="activity"]')
    expect(activityPanelAfterAck?.textContent ?? '').not.toContain(COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE)
    expect(mountPoint.querySelectorAll('article[aria-label^="Activity:"]')).toHaveLength(baselineCards)

    harness.emitCompositeTransformStatus({ status: 'ok', message: 'Final transformed text.' })
    await flush()

    const activityCards = mountPoint.querySelectorAll('article[aria-label^="Activity:"]')
    expect(activityCards).toHaveLength(1)
    const activityPanelAfterSuccess = mountPoint.querySelector<HTMLElement>('[data-tab-panel="activity"]')
    expect(activityPanelAfterSuccess?.textContent ?? '').toContain('Final transformed text.')
    expect(activityPanelAfterSuccess?.textContent ?? '').not.toContain(COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE)
  })

  it('suppresses recording command dispatch while shortcut capture is active and resumes after successful capture', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="shortcuts"]')?.click()
    await flush()
    mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.click()
    await flush()
    const captureInput = mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')

    const dispatchListener = harness.onRecordingCommandSpy.mock.calls[0]?.[0] as
      | ((dispatch: RecordingCommandDispatch) => void)
      | undefined
    expect(dispatchListener).toBeTypeOf('function')
    dispatchListener?.({ command: 'toggleRecording' })
    await flush()
    await flush()

    expect(mountPoint.textContent ?? '').not.toContain('toggleRecording failed: This environment does not support microphone recording.')

    captureInput?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true, cancelable: true })
    )
    await flush()
    dispatchListener?.({ command: 'toggleRecording' })
    await waitForCondition(
      'recording command resumes after shortcut capture exits',
      () =>
        (mountPoint.textContent ?? '').includes(
          'toggleRecording failed: This environment does not support microphone recording.'
        )
    )
  })

  it('resumes recording command dispatch after navigating away from shortcuts during capture', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="shortcuts"]')?.click()
    await flush()
    mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.click()
    await flush()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    const dispatchListener = harness.onRecordingCommandSpy.mock.calls[0]?.[0] as
      | ((dispatch: RecordingCommandDispatch) => void)
      | undefined
    dispatchListener?.({ command: 'toggleRecording' })
    await waitForCondition(
      'recording command resumes after leaving shortcuts tab',
      () =>
        (mountPoint.textContent ?? '').includes(
          'toggleRecording failed: This environment does not support microphone recording.'
        )
    )
  })

  it.each(['toggleRecording'] as const)(
    'blocks shortcut-triggered %s in transformed mode without Google key and does not play sound',
    async (command) => {
      const mountPoint = document.createElement('div')
      mountPoint.id = 'app'
      document.body.append(mountPoint)

      const harness = buildIpcHarness()
      harness.setApiKeyStatus({
        groq: true,
        elevenlabs: true,
        google: false
      })
      vi.stubGlobal('speechToTextApi', harness.api)
      window.speechToTextApi = harness.api

      startRendererApp(mountPoint)
      await waitForBoot()

      harness.emitRecordingCommand({ command })
      await waitForCondition(
        'google-key blocked recording failure appears',
        () => (mountPoint.textContent ?? '').includes('Missing Google API key.')
      )

      expect(mountPoint.textContent ?? '').not.toContain('This environment does not support microphone recording.')
      expect(harness.playSoundSpy).not.toHaveBeenCalled()
    }
  )

  it('does not append non-terminal transform enqueue messages to activity and appends terminal failure only', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    const baselineCards = mountPoint.querySelectorAll('article[aria-label^="Activity:"]').length
    harness.emitCompositeTransformStatus({ status: 'ok', message: COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE })
    await flush()
    const activityPanelAfterAck = mountPoint.querySelector<HTMLElement>('[data-tab-panel="activity"]')
    expect(activityPanelAfterAck?.textContent ?? '').not.toContain(COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE)
    expect(mountPoint.querySelectorAll('article[aria-label^="Activity:"]')).toHaveLength(baselineCards)

    harness.emitCompositeTransformStatus({ status: 'error', message: 'Provider request timed out.' })
    await flush()

    const activityCards = mountPoint.querySelectorAll('article[aria-label^="Activity:"]')
    expect(activityCards).toHaveLength(1)
    const activityPanelAfterFailure = mountPoint.querySelector<HTMLElement>('[data-tab-panel="activity"]')
    expect(activityPanelAfterFailure?.textContent ?? '').toContain('Transform error: Provider request timed out.')
    expect(activityPanelAfterFailure?.textContent ?? '').not.toContain(COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE)
  })

  it('treats error status as terminal even if message matches enqueue acknowledgement text', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    harness.emitCompositeTransformStatus({ status: 'error', message: COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE })
    await flush()

    const activityPanel = mountPoint.querySelector<HTMLElement>('[data-tab-panel="activity"]')
    expect(activityPanel?.textContent ?? '').toContain('Transform error: Transformation enqueued.')
  })

  it('binds beforeunload while profile draft is dirty and unbinds after discard', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    startRendererApp(mountPoint)
    await waitForBoot()

    mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="profiles"]')?.click()
    await flush()

    mountPoint.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = mountPoint.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} draft`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    const cancelButton = Array.from(mountPoint.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancel')
    cancelButton?.click()
    await flush()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
})
