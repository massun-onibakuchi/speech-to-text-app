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

const waitForBoot = async (): Promise<void> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await flush()
    if (document.querySelector('[data-route-tab="home"]')) {
      return
    }
  }
}

interface IpcHarness {
  api: IpcApi
  setApiKeyStatus: (status: { groq: boolean; elevenlabs: boolean; google: boolean }) => void
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

  const api: IpcApi = {
    ping: async () => 'pong',
    getSettings: async () => structuredClone(DEFAULT_SETTINGS),
    setSettings: async (settings) => settings,
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
  it('mounts full React shell and preserves selector contracts', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildIpcHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForBoot()

    expect(mountPoint.querySelector('[data-route-tab="home"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-route-tab="settings"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-page="home"]')).not.toBeNull()
    expect(mountPoint.querySelector('[data-page="settings"]')).not.toBeNull()
    expect(mountPoint.querySelector('#toast-layer')).not.toBeNull()
    expect(mountPoint.querySelector('#settings-save-message')).not.toBeNull()
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

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await flush()
      if (mountPoint.textContent?.includes('Transformation is blocked because the Google API key is missing.')) {
        break
      }
    }

    expect(mountPoint.textContent).toContain('Transformation is blocked because the Google API key is missing.')
  })
})
