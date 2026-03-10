/**
 * Where: src/main/ipc/register-handlers.test.ts
 * What:  Tests IPC registration failure handling and the PR-2 streaming channels.
 * Why:   Lock the main-process control-plane contract before provider-specific
 *        streaming runtime behavior lands in later PRs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'
import { InMemoryStreamingSessionController } from '../services/streaming/streaming-session-controller'

const mocks = vi.hoisted(() => {
  const quit = vi.fn()
  const showErrorBox = vi.fn()
  const windowSend = vi.fn()
  const logStructured = vi.fn()
  const windows = [
    {
      id: 1,
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: windowSend
      }
    }
  ]
  return {
    quit,
    showErrorBox,
    windowSend,
    logStructured,
    ipcHandle: vi.fn(),
    ipcOn: vi.fn(),
    windows,
    getAllWindows: vi.fn(() => windows),
    fromWebContents: vi.fn((webContents) => windows.find((window) => window.webContents === webContents) ?? null),
    getFocusedWindow: vi.fn(() => windows[0] ?? null),
    settingsCtor: vi.fn(() => {
      throw new Error('invalid settings payload')
    })
  }
})

vi.mock('electron', () => ({
  app: { quit: mocks.quit },
  dialog: { showErrorBox: mocks.showErrorBox },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
    fromWebContents: mocks.fromWebContents,
    getFocusedWindow: mocks.getFocusedWindow
  },
  ipcMain: {
    handle: mocks.ipcHandle,
    on: mocks.ipcOn
  },
  globalShortcut: {}
}))

vi.mock('../services/settings-service', () => ({
  SettingsService: mocks.settingsCtor
}))

vi.mock('../../shared/error-logging', () => ({
  logStructured: mocks.logStructured
}))

import { registerIpcHandlers, registerIpcHandlersWithServices, resetMainServicesForTest } from './register-handlers'

const getRegisteredHandle = (channel: string) => {
  const match = mocks.ipcHandle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  return match?.[1]
}

const getRegisteredOn = (channel: string) => {
  const match = mocks.ipcOn.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  return match?.[1]
}

const createFakeMessagePort = () => {
  let onMessage: ((event: { data: unknown }) => void | Promise<void>) | null = null
  return {
    on: vi.fn((event: string, listener: (event: { data: unknown }) => void | Promise<void>) => {
      if (event === 'message') {
        onMessage = listener
      }
    }),
    start: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
    emitMessage: async (data: unknown) => {
      await onMessage?.({ data })
    }
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    resetMainServicesForTest()
    mocks.quit.mockReset()
    mocks.showErrorBox.mockReset()
    mocks.windowSend.mockReset()
    mocks.logStructured.mockReset()
    mocks.ipcHandle.mockReset()
    mocks.ipcOn.mockReset()
  })

  it('shows recovery error and quits app when settings initialization fails', () => {
    expect(() => registerIpcHandlers()).toThrow('invalid settings payload')

    expect(mocks.showErrorBox).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })

  it('registers streaming IPC handlers and broadcasts controller lifecycle events', async () => {
    const streamingSessionController = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue({ command: 'toggleRecording' }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(async () => {
        await streamingSessionController.start({
          provider: 'local_whispercpp_coreml',
          transport: 'native_stream',
          model: 'ggml-large-v3-turbo-q5_0',
          outputMode: 'stream_raw_dictation',
          maxInFlightTransforms: 2,
          delimiterPolicy: {
            mode: 'space',
            value: null
          },
          transformationProfile: null
        })
      }),
      stopStreamingSession: vi.fn(async (request: { reason: 'user_stop' | 'user_cancel' | 'fatal_error' }) => {
        await streamingSessionController.stop(request.reason)
      })
    }

    registerIpcHandlersWithServices({
      settingsService: { getSettings: vi.fn(), setSettings: vi.fn() } as any,
      secretStore: {
        getApiKey: vi.fn().mockReturnValue(null),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn()
      } as any,
      historyService: { getRecords: vi.fn().mockReturnValue([]) } as any,
      transcriptionService: {} as any,
      transformationService: {} as any,
      outputService: {} as any,
      networkCompatibilityService: {} as any,
      soundService: { play: vi.fn() } as any,
      clipboardClient: {} as any,
      selectionClient: {} as any,
      profilePickerService: {} as any,
      apiKeyConnectionService: { testConnection: vi.fn() } as any,
      commandRouter: commandRouter as any,
      streamingSessionController: streamingSessionController as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    expect(getRegisteredHandle(IPC_CHANNELS.startStreamingSession)).toBeTypeOf('function')
    expect(getRegisteredHandle(IPC_CHANNELS.stopStreamingSession)).toBeTypeOf('function')
    expect(getRegisteredHandle(IPC_CHANNELS.getStreamingSessionSnapshot)).toBeTypeOf('function')
    expect(getRegisteredHandle(IPC_CHANNELS.ackStreamingRendererStop)).toBeTypeOf('function')
    expect(getRegisteredHandle(IPC_CHANNELS.pushStreamingAudioFrameBatch)).toBeTypeOf('function')
    expect(getRegisteredOn(IPC_CHANNELS.pushStreamingAudioUtteranceChunk)).toBeTypeOf('function')

    await getRegisteredHandle(IPC_CHANNELS.startStreamingSession)?.({}, undefined)
    expect(getRegisteredHandle(IPC_CHANNELS.getStreamingSessionSnapshot)?.({}, undefined)).toEqual(
      expect.objectContaining({ sessionId: 'session-1', state: 'active' })
    )
    await expect(async () =>
      await getRegisteredHandle(IPC_CHANNELS.pushStreamingAudioFrameBatch)?.({}, {
        sessionId: 'session-1',
        sampleRateHz: 16000,
        channels: 1,
        flushReason: null,
        frames: [{ samples: new Float32Array([0, 0.1]), timestampMs: 1 }]
      })
    ).rejects.toThrow('no owner renderer')
    await expect(async () =>
      await getRegisteredHandle(IPC_CHANNELS.stopStreamingSession)?.({}, { sessionId: 'session-1', reason: 'user_stop' })
    ).rejects.toThrow('reserved for fatal renderer cleanup')
    await getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({}, 'toggleRecording')

    expect(commandRouter.startStreamingSession).toHaveBeenCalledOnce()
    expect(commandRouter.stopStreamingSession).not.toHaveBeenCalled()
    expect(commandRouter.runRecordingCommand).toHaveBeenCalledWith('toggleRecording')

    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onStreamingSessionState,
      expect.objectContaining({ sessionId: 'session-1', state: 'starting' })
    )
    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onStreamingSessionState,
      expect.objectContaining({ sessionId: 'session-1', state: 'active' })
    )
    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onRecordingCommand,
      expect.objectContaining({ command: 'toggleRecording' })
    )
    expect(
      mocks.windowSend.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.onStreamingSessionState)
    ).toHaveLength(2)
  })

  it('routes accepted utterance chunks through the owner renderer and rejects non-owned chunks', async () => {
    const pushAudioUtteranceChunk = vi.fn(async () => {})
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue({
        kind: 'streaming_start',
        sessionId: 'session-utterance',
        preferredDeviceId: 'mic-1'
      }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession: vi.fn()
    }

    registerIpcHandlersWithServices({
      settingsService: { getSettings: vi.fn(), setSettings: vi.fn() } as any,
      secretStore: {
        getApiKey: vi.fn().mockReturnValue(null),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn()
      } as any,
      historyService: { getRecords: vi.fn().mockReturnValue([]) } as any,
      transcriptionService: {} as any,
      transformationService: {} as any,
      outputService: {} as any,
      networkCompatibilityService: {} as any,
      soundService: { play: vi.fn() } as any,
      clipboardClient: {} as any,
      selectionClient: {} as any,
      profilePickerService: {} as any,
      apiKeyConnectionService: { testConnection: vi.fn() } as any,
      commandRouter: commandRouter as any,
      streamingSessionController: {
        onSessionState: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
        pushAudioFrameBatch: vi.fn(),
        pushAudioUtteranceChunk
      } as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    await getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording')

    const utteranceHandler = getRegisteredOn(IPC_CHANNELS.pushStreamingAudioUtteranceChunk)
    expect(utteranceHandler).toBeTypeOf('function')

    const ownerPort = createFakeMessagePort()
    await utteranceHandler?.({ sender: mocks.windows[0]?.webContents, ports: [ownerPort] }, undefined)
    await ownerPort.emitMessage({
      sessionId: 'session-utterance',
      sampleRateHz: 16000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes: new ArrayBuffer(4),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtMs: 0,
      endedAtMs: 500,
      hadCarryover: false,
      reason: 'speech_pause',
      source: 'browser_vad'
    })

    expect(pushAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-utterance',
      utteranceIndex: 0
    }))
    expect(ownerPort.postMessage).toHaveBeenCalledWith({ ok: true })

    const nonOwnerPort = createFakeMessagePort()
    await utteranceHandler?.({ sender: mocks.windows[1]?.webContents, ports: [nonOwnerPort] }, undefined)
    await nonOwnerPort.emitMessage({
      sessionId: 'session-utterance',
      sampleRateHz: 16000,
      channels: 1,
      utteranceIndex: 1,
      wavBytes: new ArrayBuffer(4),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtMs: 600,
      endedAtMs: 900,
      hadCarryover: false,
      reason: 'speech_pause',
      source: 'browser_vad'
    })

    expect(nonOwnerPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('does not own session')
    }))
  })

  it('rejects null and malformed utterance chunk payloads before owner lookup', async () => {
    const pushAudioUtteranceChunk = vi.fn(async () => {})
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue({
        kind: 'streaming_start',
        sessionId: 'session-utterance-invalid',
        preferredDeviceId: 'mic-1'
      }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession: vi.fn()
    }

    registerIpcHandlersWithServices({
      settingsService: { getSettings: vi.fn(), setSettings: vi.fn() } as any,
      secretStore: {
        getApiKey: vi.fn().mockReturnValue(null),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn()
      } as any,
      historyService: { getRecords: vi.fn().mockReturnValue([]) } as any,
      transcriptionService: {} as any,
      transformationService: {} as any,
      outputService: {} as any,
      networkCompatibilityService: {} as any,
      soundService: { play: vi.fn() } as any,
      clipboardClient: {} as any,
      selectionClient: {} as any,
      profilePickerService: {} as any,
      apiKeyConnectionService: { testConnection: vi.fn() } as any,
      commandRouter: commandRouter as any,
      streamingSessionController: {
        onSessionState: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
        pushAudioFrameBatch: vi.fn(),
        pushAudioUtteranceChunk
      } as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    await getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording')

    const utteranceHandler = getRegisteredOn(IPC_CHANNELS.pushStreamingAudioUtteranceChunk)
    expect(utteranceHandler).toBeTypeOf('function')

    const nullPayloadPort = createFakeMessagePort()
    await utteranceHandler?.({ sender: mocks.windows[0]?.webContents, ports: [nullPayloadPort] }, undefined)
    await nullPayloadPort.emitMessage(null)

    expect(nullPayloadPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('expected an object')
    }))

    const malformedPayloadPort = createFakeMessagePort()
    await utteranceHandler?.({ sender: mocks.windows[0]?.webContents, ports: [malformedPayloadPort] }, undefined)
    await malformedPayloadPort.emitMessage({
      sessionId: 'session-utterance-invalid',
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavBytes: new ArrayBuffer(4),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtMs: 50,
      endedAtMs: 10,
      hadCarryover: false,
      reason: 'speech_pause',
      source: 'browser_vad'
    })

    expect(malformedPayloadPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      message: expect.stringContaining('endedAtMs must not precede startedAtMs')
    }))
    expect(pushAudioUtteranceChunk).not.toHaveBeenCalled()
  })

  it('logs and returns when recording command dispatch finds no renderer windows', async () => {
    mocks.getAllWindows.mockReturnValueOnce([])
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue({ command: 'toggleRecording' }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession: vi.fn()
    }

    registerIpcHandlersWithServices({
      settingsService: { getSettings: vi.fn(), setSettings: vi.fn() } as any,
      secretStore: {
        getApiKey: vi.fn().mockReturnValue(null),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn()
      } as any,
      historyService: { getRecords: vi.fn().mockReturnValue([]) } as any,
      transcriptionService: {} as any,
      transformationService: {} as any,
      outputService: {} as any,
      networkCompatibilityService: {} as any,
      soundService: { play: vi.fn() } as any,
      clipboardClient: {} as any,
      selectionClient: {} as any,
      profilePickerService: {} as any,
      apiKeyConnectionService: { testConnection: vi.fn() } as any,
      commandRouter: commandRouter as any,
      streamingSessionController: new InMemoryStreamingSessionController() as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    await expect(getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({}, 'toggleRecording')).resolves.toBeUndefined()
    expect(mocks.logStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        event: 'recording.dispatch_skipped_no_renderer'
      })
    )
  })

  it('prepares Groq renderer stop before waiting for the renderer acknowledgement', async () => {
    const prepareForRendererStop = vi.fn(async () => {})
    const stopStreamingSession = vi.fn(async () => {})
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue({
        kind: 'streaming_stop_requested',
        sessionId: 'session-groq',
        reason: 'user_stop'
      }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession
    }

    registerIpcHandlersWithServices({
      settingsService: { getSettings: vi.fn(), setSettings: vi.fn() } as any,
      secretStore: {
        getApiKey: vi.fn().mockReturnValue(null),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn()
      } as any,
      historyService: { getRecords: vi.fn().mockReturnValue([]) } as any,
      transcriptionService: {} as any,
      transformationService: {} as any,
      outputService: {} as any,
      networkCompatibilityService: {} as any,
      soundService: { play: vi.fn() } as any,
      clipboardClient: {} as any,
      selectionClient: {} as any,
      profilePickerService: {} as any,
      apiKeyConnectionService: { testConnection: vi.fn() } as any,
      commandRouter: commandRouter as any,
      streamingSessionController: {
        onSessionState: vi.fn(),
        onSegment: vi.fn(),
        onError: vi.fn(),
        getSnapshot: vi.fn(() => ({
          sessionId: 'session-groq',
          state: 'active',
          provider: 'groq_whisper_large_v3_turbo',
          transport: 'rolling_upload',
          model: 'whisper-large-v3-turbo',
          reason: null
        })),
        prepareForRendererStop
      } as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    const runPromise = getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.(
      { sender: mocks.windows[0]?.webContents },
      'toggleRecording'
    )
    await Promise.resolve()

    expect(prepareForRendererStop).toHaveBeenCalledWith('user_stop')
    expect(stopStreamingSession).not.toHaveBeenCalled()

    await getRegisteredHandle(IPC_CHANNELS.ackStreamingRendererStop)?.(
      { sender: mocks.windows[0]?.webContents },
      { sessionId: 'session-groq', reason: 'user_stop' }
    )
    await runPromise

    expect(stopStreamingSession).toHaveBeenCalledWith({
      sessionId: 'session-groq',
      reason: 'user_stop'
    })
  })
})
