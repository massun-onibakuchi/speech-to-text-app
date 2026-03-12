// Where: src/main/test-support/streaming-ipc-round-trip.test.ts
// What:  Integration-style coverage for the streaming stop IPC handshake.
// Why:   Proves the main process falls back after the renderer stop-ack timeout
//        instead of hanging the stop path forever when a renderer never acks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'

const mocks = vi.hoisted(() => {
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
    },
    {
      id: 2,
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: windowSend
      }
    }
  ]
  return {
    windowSend,
    logStructured,
    ipcHandle: vi.fn(),
    ipcOn: vi.fn(),
    windows,
    getAllWindows: vi.fn(() => windows),
    fromWebContents: vi.fn((webContents) => windows.find((window) => window.webContents === webContents) ?? null),
    getFocusedWindow: vi.fn(() => windows[0] ?? null)
  }
})

vi.mock('electron', () => ({
  app: {},
  dialog: {},
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

vi.mock('../../shared/error-logging', () => ({
  logStructured: mocks.logStructured
}))

import { registerIpcHandlersWithServices, resetMainServicesForTest } from '../ipc/register-handlers'

const getRegisteredHandle = (channel: string) => {
  const match = mocks.ipcHandle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  return match?.[1]
}

describe('streaming stop IPC handshake', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMainServicesForTest()
    mocks.windowSend.mockReset()
    mocks.logStructured.mockReset()
    mocks.ipcHandle.mockReset()
    mocks.ipcOn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out missing renderer stop acknowledgements and falls back to direct stop', async () => {
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'streaming_start',
          sessionId: 'session-timeout',
          preferredDeviceId: 'mic-1'
        })
        .mockResolvedValueOnce({
          kind: 'streaming_stop_requested',
          sessionId: 'session-timeout',
          reason: 'user_stop'
        }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession: vi.fn(async () => {})
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
        pushAudioFrameBatch: vi.fn()
      } as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    const runRecordingCommand = getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)
    expect(runRecordingCommand).toBeTypeOf('function')

    await runRecordingCommand?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording')

    let settled = false
    const stopPromise = runRecordingCommand?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording') as Promise<void>
    void stopPromise.finally(() => {
      settled = true
    })

    await Promise.resolve()

    expect(mocks.windowSend).toHaveBeenCalledWith(IPC_CHANNELS.onRecordingCommand, {
      kind: 'streaming_stop_requested',
      sessionId: 'session-timeout',
      reason: 'user_stop'
    })
    expect(commandRouter.stopStreamingSession).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1499)
    expect(commandRouter.stopStreamingSession).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await stopPromise

    expect(commandRouter.stopStreamingSession).toHaveBeenCalledWith({
      sessionId: 'session-timeout',
      reason: 'user_stop'
    })
    expect(mocks.logStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        event: 'streaming.renderer_stop_ack_timeout'
      })
    )
  })

  it('ignores non-owner stop acknowledgements until the owner renderer acks', async () => {
    const commandRouter = {
      getAudioInputSources: vi.fn().mockResolvedValue([]),
      runRecordingCommand: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'streaming_start',
          sessionId: 'session-owner',
          preferredDeviceId: 'mic-1'
        })
        .mockResolvedValueOnce({
          kind: 'streaming_stop_requested',
          sessionId: 'session-owner',
          reason: 'user_stop'
        }),
      submitRecordedAudio: vi.fn(),
      startStreamingSession: vi.fn(),
      stopStreamingSession: vi.fn(async () => {})
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
        pushAudioFrameBatch: vi.fn()
      } as any,
      hotkeyService: {
        registerFromSettings: vi.fn(),
        unregisterAll: vi.fn(),
        runPickAndRunTransform: vi.fn()
      } as any
    } as any)

    const runRecordingCommand = getRegisteredHandle(IPC_CHANNELS.runRecordingCommand)
    expect(runRecordingCommand).toBeTypeOf('function')

    const ackRendererStop = getRegisteredHandle(IPC_CHANNELS.ackStreamingRendererStop)

    await runRecordingCommand?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording')

    let settled = false
    const stopPromise = runRecordingCommand?.({ sender: mocks.windows[0]?.webContents }, 'toggleRecording') as Promise<void>
    void stopPromise.finally(() => {
      settled = true
    })

    await Promise.resolve()

    await ackRendererStop?.(
      { sender: mocks.windows[1]?.webContents },
      { sessionId: 'session-owner', reason: 'user_stop' }
    )
    await Promise.resolve()

    expect(commandRouter.stopStreamingSession).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    await ackRendererStop?.(
      { sender: mocks.windows[0]?.webContents },
      { sessionId: 'session-owner', reason: 'user_stop' }
    )
    await stopPromise

    expect(commandRouter.stopStreamingSession).toHaveBeenCalledWith({
      sessionId: 'session-owner',
      reason: 'user_stop'
    })
  })
})
