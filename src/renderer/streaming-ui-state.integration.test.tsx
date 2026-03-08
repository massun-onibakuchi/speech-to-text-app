/*
Where: src/renderer/streaming-ui-state.integration.test.tsx
What: Integration-style renderer tests for streaming pending-state recovery.
Why: Prove the Home UI leaves Processing when lifecycle truth goes terminal,
     even if the original recording command promise never resolves.
*/

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CompositeTransformResult,
  HotkeyErrorNotification,
  IpcApi,
  RecordingCommandDispatch,
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionStateSnapshot
} from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { startRendererApp, stopRendererAppForTests } from './renderer-app'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const waitForCondition = async (label: string, condition: () => boolean, attempts = 30): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await flush()
    if (condition()) {
      return
    }
  }
  throw new Error(`Timed out waiting for ${label}`)
}

const streamingSettings = (() => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.processing.mode = 'streaming'
  settings.processing.streaming.enabled = true
  settings.processing.streaming.provider = 'local_whispercpp_coreml'
  settings.processing.streaming.transport = 'native_stream'
  settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
  settings.processing.streaming.outputMode = 'stream_raw_dictation'
  return settings
})()

const buildHarness = (): {
  api: IpcApi
  emitStreamingSessionState: (snapshot: StreamingSessionStateSnapshot) => void
} => {
  let onStreamingSessionStateListener: ((snapshot: StreamingSessionStateSnapshot) => void) | null = null

  const api: IpcApi = {
    ping: async () => 'pong',
    getSettings: async () => structuredClone(streamingSettings),
    setSettings: async (settings) => settings,
    getApiKeyStatus: async () => ({ groq: true, elevenlabs: true, google: true }),
    setApiKey: async () => {},
    deleteApiKey: async () => {},
    testApiKeyConnection: async (provider) => ({
      provider,
      status: 'success',
      message: 'ok'
    }),
    getHistory: async () => [],
    getAudioInputSources: async () => [],
    playSound: async () => {},
    runRecordingCommand: async () => await new Promise<void>(() => {}),
    submitRecordedAudio: async () => {},
    startStreamingSession: async () => {},
    stopStreamingSession: async (_request) => {},
    ackStreamingRendererStop: async (_ack) => {},
    pushStreamingAudioFrameBatch: async () => {},
    onRecordingCommand: (_listener: (dispatch: RecordingCommandDispatch) => void) => () => {},
    onStreamingSessionState: (listener: (state: StreamingSessionStateSnapshot) => void) => {
      onStreamingSessionStateListener = listener
      return () => {
        onStreamingSessionStateListener = null
      }
    },
    onStreamingSegment: (_listener: (segment: StreamingSegmentEvent) => void) => () => {},
    onStreamingError: (_listener: (error: StreamingErrorEvent) => void) => () => {},
    runPickTransformationFromClipboard: async () => {},
    onCompositeTransformStatus: (_listener: (result: CompositeTransformResult) => void) => () => {},
    onHotkeyError: (_listener: (notification: HotkeyErrorNotification) => void) => () => {},
    onSettingsUpdated: (_listener: () => void) => () => {},
    onOpenSettings: (_listener: () => void) => () => {}
  }

  return {
    api,
    emitStreamingSessionState: (snapshot) => {
      if (!onStreamingSessionStateListener) {
        throw new Error('Streaming session listener is not registered.')
      }
      onStreamingSessionStateListener(snapshot)
    }
  }
}

afterEach(() => {
  stopRendererAppForTests()
  document.body.innerHTML = ''
})

describe('streaming UI pending-state recovery', () => {
  it('returns Home from Processing to Error when a failed session snapshot arrives', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForCondition('renderer boot', () => mountPoint.querySelector('[data-route-tab="activity"]') !== null)

    mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click()
    await waitForCondition('processing state', () => (mountPoint.textContent ?? '').includes('Processing...'))

    harness.emitStreamingSessionState({
      sessionId: 'session-ui-failed',
      state: 'starting',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })
    harness.emitStreamingSessionState({
      sessionId: 'session-ui-failed',
      state: 'failed',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'fatal_error'
    })

    await waitForCondition('processing clears after failed snapshot', () => !(mountPoint.textContent ?? '').includes('Processing...'))
    expect(mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.disabled).toBe(false)
  })

  it('returns Home from Processing to idle when an ended session snapshot arrives', async () => {
    const mountPoint = document.createElement('div')
    mountPoint.id = 'app'
    document.body.append(mountPoint)

    const harness = buildHarness()
    vi.stubGlobal('speechToTextApi', harness.api)
    window.speechToTextApi = harness.api

    startRendererApp(mountPoint)
    await waitForCondition('renderer boot', () => mountPoint.querySelector('[data-route-tab="activity"]') !== null)

    mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click()
    await waitForCondition('processing state', () => (mountPoint.textContent ?? '').includes('Processing...'))

    harness.emitStreamingSessionState({
      sessionId: 'session-ui-ended',
      state: 'starting',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })
    harness.emitStreamingSessionState({
      sessionId: 'session-ui-ended',
      state: 'ended',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: 'user_stop'
    })

    await waitForCondition('processing clears after ended snapshot', () => !(mountPoint.textContent ?? '').includes('Processing...'))
    expect(mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.disabled).toBe(false)
  })
})
