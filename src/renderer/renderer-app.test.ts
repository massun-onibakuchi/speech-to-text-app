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
import { startRendererApp, stopRendererAppForTests } from './renderer-app'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

// Boot needs more flush passes than a typical condition because the async render
// chain (ping + getSettings + getApiKeyStatus + refreshAudioInputSources) chains
// several promise hops before React renders the nav tabs.
const BOOT_MAX_FLUSH_ATTEMPTS = 30

const waitForBoot = async (): Promise<void> => {
  for (let attempt = 0; attempt < BOOT_MAX_FLUSH_ATTEMPTS; attempt += 1) {
    await flush()
    if (document.querySelector('[data-route-tab="home"]')) {
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
  setSettingsSpy: ReturnType<typeof vi.fn>
  onRecordingCommandSpy: ReturnType<typeof vi.fn>
  onCompositeTransformStatusSpy: ReturnType<typeof vi.fn>
  onHotkeyErrorSpy: ReturnType<typeof vi.fn>
}

const buildIpcHarness = (): IpcHarness => {
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
    getSettings: async () => structuredClone(DEFAULT_SETTINGS),
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
    expect(mountPoint.querySelector('[data-route-tab="home"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="settings"]')).not.toBeNull()
    expect(mountPoint.textContent).toContain('Speech-to-Text v1')
    expect(mountPoint.textContent).toContain('Recording Controls')
    expect(mountPoint.textContent).toContain('Shortcut Contract')
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

  it('refreshes API key status when navigating back to Home', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    harness.setApiKeyStatus({
      groq: true,
      elevenlabs: true,
      google: false
    })

    const settingsTab = mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')
    const homeTab = mountPoint.querySelector<HTMLButtonElement>('[data-route-tab="home"]')
    settingsTab?.click()
    homeTab?.click()

    await waitForCondition(
      'API key blocked message after home tab navigation',
      () => !!mountPoint.textContent?.includes('Transformation is blocked because the Google API key is missing.')
    )

    expect(mountPoint.textContent).toContain('Transformation is blocked because the Google API key is missing.')
  })

  it('saves settings on Enter from inputs but not textarea via React-owned keydown handling', async () => {
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

    const beforeInputEnterCalls = harness.setSettingsSpy.mock.calls.length
    const shortcutInput = mountPoint.querySelector<HTMLInputElement>('#settings-shortcut-start-recording')
    expect(shortcutInput).not.toBeNull()
    shortcutInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    await waitForCondition('settings save dispatch after Enter on input', () =>
      harness.setSettingsSpy.mock.calls.length > beforeInputEnterCalls
    )
    expect(harness.setSettingsSpy.mock.calls.length).toBeGreaterThan(beforeInputEnterCalls)

    const beforeTextareaEnterCalls = harness.setSettingsSpy.mock.calls.length
    const systemPrompt = mountPoint.querySelector<HTMLTextAreaElement>('#settings-system-prompt')
    expect(systemPrompt).not.toBeNull()
    systemPrompt?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    // One flush is sufficient for the negative assertion: if React were going to
    // fire the handler, it would do so in the same microtask batch.
    await flush()
    expect(harness.setSettingsSpy.mock.calls.length).toBe(beforeTextareaEnterCalls)
  })
})
