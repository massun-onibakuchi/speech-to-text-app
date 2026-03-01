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
  RecordingCommandDispatch
} from '../shared/ipc'
import { COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE } from '../shared/ipc'
import { startRendererApp, stopRendererAppForTests } from './renderer-app'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

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

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

interface IpcHarness {
  api: IpcApi
  setApiKeyStatus: (status: { groq: boolean; elevenlabs: boolean; google: boolean }) => void
  emitCompositeTransformStatus: (result: CompositeTransformResult) => void
  setSettingsSpy: ReturnType<typeof vi.fn>
  onRecordingCommandSpy: ReturnType<typeof vi.fn>
  onCompositeTransformStatusSpy: ReturnType<typeof vi.fn>
  onHotkeyErrorSpy: ReturnType<typeof vi.fn>
}

const buildIpcHarness = (): IpcHarness => {
  const defaultSettings = structuredClone(DEFAULT_SETTINGS)
  defaultSettings.transformation.presets = defaultSettings.transformation.presets.map((preset, index) =>
    index === 0
      ? {
          ...preset,
          systemPrompt: 'You are a careful editor.',
          userPrompt: 'Rewrite: {{text}}'
        }
      : preset
  )

  let apiKeyStatus = {
    groq: true,
    elevenlabs: true,
    google: true
  }

  const onRecordingCommandSpy = vi.fn((_listener: (dispatch: RecordingCommandDispatch) => void) => () => {})
  const onCompositeTransformStatusSpy = vi.fn((_listener: (result: CompositeTransformResult) => void) => () => {})
  const onHotkeyErrorSpy = vi.fn((_listener: (notification: HotkeyErrorNotification) => void) => () => {})
  const setSettingsSpy = vi.fn(async (settings: typeof DEFAULT_SETTINGS) => settings)

  const api: IpcApi = {
    ping: async () => 'pong',
    getSettings: async () => structuredClone(defaultSettings),
    setSettings: setSettingsSpy,
    getApiKeyStatus: async () => apiKeyStatus,
    setApiKey: async () => {},
    testApiKeyConnection: async (provider: ApiKeyProvider): Promise<ApiKeyConnectionTestResult> => ({
      provider,
      status: 'success',
      message: 'ok'
    }),
    getHistory: async () => [],
    getAudioInputSources: async () => [],
    playSound: async () => {},
    runRecordingCommand: async (_command: RecordingCommand) => {},
    submitRecordedAudio: async () => {},
    onRecordingCommand: onRecordingCommandSpy,
    runCompositeTransformFromClipboard: async (): Promise<CompositeTransformResult> => ({
      status: 'ok',
      message: 'ok'
    }),
    runPickTransformationFromClipboard: async () => {},
    onCompositeTransformStatus: onCompositeTransformStatusSpy,
    onHotkeyError: onHotkeyErrorSpy
  }

  return {
    api,
    setApiKeyStatus: (status) => {
      apiKeyStatus = status
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
    setSettingsSpy,
    onRecordingCommandSpy,
    onCompositeTransformStatusSpy,
    onHotkeyErrorSpy
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
    // New tab model: activity | profiles | shortcuts | audio-input | settings.
    expect(mountPoint.querySelector('[data-route-tab="activity"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="audio-input"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="settings"]')).not.toBeNull()
    expect(mountPoint.textContent).toContain('Speech-to-Text v1')
    // STY-03: "Recording Controls" heading removed; recording is indicated by the
    // circular button with aria-label and the "Click to record" label below it.
    expect(mountPoint.querySelector('[aria-label="Start recording"]')).not.toBeNull()
    expect(mountPoint.textContent).not.toContain('Shortcut Contract')
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
    expect(harness.onCompositeTransformStatusSpy).toHaveBeenCalledTimes(1)
    expect(harness.onHotkeyErrorSpy).toHaveBeenCalledTimes(1)
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
      () => !!mountPoint.textContent?.includes('Recording is blocked because the Groq API key is missing.')
    )

    expect(mountPoint.textContent).toContain('Recording is blocked because the Groq API key is missing.')
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
    expect(mountPoint.querySelector('[data-settings-save-message]')?.textContent ?? '').not.toContain('Settings autosaved.')
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
    expect(mountPoint.querySelector('[data-settings-save-message]')?.textContent ?? '').toContain('Autosave failed: Disk full')
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
        userPrompt: 'default {{text}}'
      },
      {
        ...divergentSettings.transformation.presets[0],
        id: 'other-id',
        name: 'Other Profile',
        systemPrompt: 'other system',
        userPrompt: 'other {{text}}'
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
        userPrompt: 'fallback {{text}}'
      },
      {
        ...invalidSettings.transformation.presets[0],
        id: 'other-id',
        name: 'Other Profile',
        systemPrompt: 'other system',
        userPrompt: 'other {{text}}'
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
})
