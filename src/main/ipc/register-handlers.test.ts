/**
 * Where: src/main/ipc/register-handlers.test.ts
 * What:  Tests IPC registration failure handling and the PR-2 streaming channels.
 * Why:   Lock the main-process control-plane contract before provider-specific
 *        streaming runtime behavior lands in later PRs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'

const mocks = vi.hoisted(() => {
  const quit = vi.fn()
  const showErrorBox = vi.fn()
  const windowSend = vi.fn()
  return {
    quit,
    showErrorBox,
    windowSend,
    ipcHandle: vi.fn(),
    ipcOn: vi.fn(),
    getAllWindows: vi.fn(() => [
      {
        webContents: {
          send: windowSend
        }
      }
    ]),
    settingsCtor: vi.fn(() => {
      throw new Error('invalid settings payload')
    })
  }
})

vi.mock('electron', () => ({
  app: { quit: mocks.quit },
  dialog: { showErrorBox: mocks.showErrorBox },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows
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

import { registerIpcHandlers, registerIpcHandlersWithServices, resetMainServicesForTest } from './register-handlers'

const getRegisteredHandle = (channel: string) => {
  const match = mocks.ipcHandle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  return match?.[1]
}

const createStreamingControllerHarness = () => {
  const sessionStateListeners = new Set<(event: any) => void>()
  const segmentListeners = new Set<(event: any) => void>()
  const errorListeners = new Set<(event: any) => void>()

  return {
    controller: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      onSessionState: vi.fn((listener: (event: any) => void) => {
        sessionStateListeners.add(listener)
        return () => sessionStateListeners.delete(listener)
      }),
      onSegment: vi.fn((listener: (event: any) => void) => {
        segmentListeners.add(listener)
        return () => segmentListeners.delete(listener)
      }),
      onError: vi.fn((listener: (event: any) => void) => {
        errorListeners.add(listener)
        return () => errorListeners.delete(listener)
      })
    },
    emitSessionState: (event: unknown) => {
      for (const listener of sessionStateListeners) {
        listener(event)
      }
    },
    emitSegment: (event: unknown) => {
      for (const listener of segmentListeners) {
        listener(event)
      }
    },
    emitError: (event: unknown) => {
      for (const listener of errorListeners) {
        listener(event)
      }
    }
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    resetMainServicesForTest()
    mocks.quit.mockReset()
    mocks.showErrorBox.mockReset()
    mocks.windowSend.mockReset()
    mocks.ipcHandle.mockReset()
    mocks.ipcOn.mockReset()
  })

  it('shows recovery error and quits app when settings initialization fails', () => {
    expect(() => registerIpcHandlers()).toThrow('invalid settings payload')

    expect(mocks.showErrorBox).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })

  it('registers streaming IPC handlers and broadcasts streaming controller events', async () => {
    const streamingHarness = createStreamingControllerHarness()
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue(null),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn().mockResolvedValue(undefined),
      stopStreamingSession: vi.fn().mockResolvedValue(undefined)
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
      streamingSessionController: streamingHarness.controller as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    expect(getRegisteredHandle(IPC_CHANNELS.startStreamingSession)).toBeTypeOf('function')
    expect(getRegisteredHandle(IPC_CHANNELS.stopStreamingSession)).toBeTypeOf('function')

    await getRegisteredHandle(IPC_CHANNELS.startStreamingSession)?.({}, undefined)
    await getRegisteredHandle(IPC_CHANNELS.stopStreamingSession)?.({}, undefined)
    await getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({}, 'toggleRecording')

    expect(commandRouter.startStreamingSession).toHaveBeenCalledOnce()
    expect(commandRouter.stopStreamingSession).toHaveBeenCalledOnce()
    expect(commandRouter.runRecordingCommand).toHaveBeenCalledWith('toggleRecording')

    streamingHarness.emitSessionState({
      sessionId: 'session-1',
      state: 'starting',
      provider: 'local_whispercpp_coreml',
      transport: 'native_stream',
      model: 'ggml-large-v3-turbo-q5_0',
      reason: null
    })
    streamingHarness.emitSegment({
      sessionId: 'session-1',
      sequence: 1,
      text: 'hello',
      isFinal: true
    })
    streamingHarness.emitError({
      sessionId: 'session-1',
      code: 'not_implemented',
      message: 'Streaming runtime not implemented yet.'
    })

    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onStreamingSessionState,
      expect.objectContaining({ sessionId: 'session-1', state: 'starting' })
    )
    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onStreamingSegment,
      expect.objectContaining({ sequence: 1, text: 'hello' })
    )
    expect(mocks.windowSend).toHaveBeenCalledWith(
      IPC_CHANNELS.onStreamingError,
      expect.objectContaining({ code: 'not_implemented' })
    )
    expect(mocks.windowSend).not.toHaveBeenCalledWith(IPC_CHANNELS.onRecordingCommand, expect.anything())
  })
})
