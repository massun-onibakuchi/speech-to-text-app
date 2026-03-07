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

  it('registers streaming IPC handlers and broadcasts controller lifecycle events', async () => {
    const streamingSessionController = new InMemoryStreamingSessionController({
      createSessionId: () => 'session-1'
    })
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi.fn().mockResolvedValue(null),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(async () => {
        await streamingSessionController.start({
          provider: 'local_whispercpp_coreml',
          transport: 'native_stream',
          model: 'ggml-large-v3-turbo-q5_0'
        })
      }),
      stopStreamingSession: vi.fn(async () => {
        await streamingSessionController.stop('user_stop')
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

    await getRegisteredHandle(IPC_CHANNELS.startStreamingSession)?.({}, undefined)
    await getRegisteredHandle(IPC_CHANNELS.stopStreamingSession)?.({}, undefined)
    await getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)?.({}, 'toggleRecording')

    expect(commandRouter.startStreamingSession).toHaveBeenCalledOnce()
    expect(commandRouter.stopStreamingSession).toHaveBeenCalledOnce()
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
      IPC_CHANNELS.onStreamingSessionState,
      expect.objectContaining({ sessionId: 'session-1', state: 'ended', reason: 'user_stop' })
    )
    expect(mocks.windowSend).not.toHaveBeenCalledWith(IPC_CHANNELS.onRecordingCommand, expect.anything())
  })
})
