/**
 * Where: src/main/ipc/register-handlers.ts
 * What:  Composition root — instantiates services and registers IPC handlers.
 * Why:   Central wiring point where all main-process dependencies are assembled.
 *        Phase 2A: CommandRouter dispatches to CaptureQueue and TransformQueue
 *        with SerialOutputCoordinator for ordered output commits.
 */

import { BrowserWindow, app, dialog, ipcMain, globalShortcut } from 'electron'
import {
  IPC_CHANNELS,
  type ApiKeyProvider,
  type CompositeTransformResult,
  type HotkeyErrorNotification,
  type RecordingCommand,
  type RecordingCommandDispatch,
  type RendererInitiatedStreamingStopReason,
  type SoundEvent,
  type StopStreamingSessionRequest,
  type StreamingRendererStopAck,
  type StreamingAudioFrameBatch,
  type StreamingErrorEvent,
  type StreamingSegmentEvent,
  type StreamingSessionStateSnapshot
} from '../../shared/ipc'
import type { Settings } from '../../shared/domain'
import { logStructured } from '../../shared/error-logging'
import { SettingsService } from '../services/settings-service'
import { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import { HistoryService } from '../services/history-service'
import { SecretStore } from '../services/secret-store'
import { HotkeyService } from '../services/hotkey-service'
import { ApiKeyConnectionService } from '../services/api-key-connection-service'
import { TranscriptionService } from '../services/transcription-service'
import { TransformationService } from '../services/transformation-service'
import { OutputService } from '../services/output-service'
import { NetworkCompatibilityService } from '../services/network-compatibility-service'
import { ElectronSoundService } from '../services/sound-service'
import { SOUND_ASSET_PATHS } from '../infrastructure/sound-asset-paths'
import { ClipboardClient } from '../infrastructure/clipboard-client'
import { SelectionClient } from '../infrastructure/selection-client'
import { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'
import { SerialOutputCoordinator } from '../coordination/ordered-output-coordinator'
import { StreamingPasteClipboardPolicy } from '../coordination/clipboard-state-policy'
import { CaptureQueue } from '../queues/capture-queue'
import { TransformQueue } from '../queues/transform-queue'
import { createCaptureProcessor } from '../orchestrators/capture-pipeline'
import { createTransformProcessor } from '../orchestrators/transform-pipeline'
import { CommandRouter } from '../core/command-router'
import { ProfilePickerService } from '../services/profile-picker-service'
import {
  InMemoryStreamingSessionController,
  type StreamingSessionController
} from '../services/streaming/streaming-session-controller'
import { CloudStreamingProviderRegistry } from '../services/streaming/cloud-streaming-provider-registry'
import { WhisperCppModelManager } from '../services/streaming/whispercpp-model-manager'
import { WhisperCppStreamingAdapter } from '../services/streaming/whispercpp-streaming-adapter'
import { dispatchRecordingCommandToRenderers } from './recording-command-dispatcher'

type MainServices = {
  settingsService: SettingsService
  secretStore: SecretStore
  historyService: HistoryService
  transcriptionService: TranscriptionService
  transformationService: TransformationService
  outputService: OutputService
  networkCompatibilityService: NetworkCompatibilityService
  soundService: ElectronSoundService
  clipboardClient: ClipboardClient
  selectionClient: SelectionClient
  profilePickerService: ProfilePickerService
  apiKeyConnectionService: ApiKeyConnectionService
  commandRouter: CommandRouter
  streamingSessionController: StreamingSessionController
  hotkeyService: HotkeyService
}

let services: MainServices | null = null
const wiredStreamingControllers = new WeakSet<object>()
const STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS = 1500
const streamingSessionOwnerWindowIds = new Map<string, number>()
const pendingStreamingRendererStopAcks = new Map<
  string,
  {
    reason: RendererInitiatedStreamingStopReason
    ownerWindowId: number | null
    resolve: (acked: boolean) => void
    timeoutHandle: ReturnType<typeof setTimeout>
  }
>()

type RecordingCommandRoutingSurface = Pick<CommandRouter, 'runRecordingCommand' | 'stopStreamingSession'>

const isStreamingStopRequestedDispatch = (
  dispatch: RecordingCommandDispatch
): dispatch is Extract<RecordingCommandDispatch, { kind: 'streaming_stop_requested' }> =>
  'kind' in dispatch && dispatch.kind === 'streaming_stop_requested'

const createStreamingRendererStopAckWait = (
  sessionId: string,
  reason: RendererInitiatedStreamingStopReason,
  ownerWindowId: number | null
): {
  promise: Promise<boolean>
  dispose: () => void
} => {
  const existing = pendingStreamingRendererStopAcks.get(sessionId)
  if (existing) {
    clearTimeout(existing.timeoutHandle)
    existing.resolve(false)
    pendingStreamingRendererStopAcks.delete(sessionId)
  }

  let settled = false
  const settle = (acked: boolean): void => {
    if (settled) {
      return
    }
    settled = true
    const current = pendingStreamingRendererStopAcks.get(sessionId)
    if (current) {
      clearTimeout(current.timeoutHandle)
      pendingStreamingRendererStopAcks.delete(sessionId)
    }
    resolvePromise(acked)
  }

  let resolvePromise: (acked: boolean) => void = () => {}
  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve
  })
  const timeoutHandle = setTimeout(() => {
    if (settled) {
      return
    }
    logStructured({
      level: 'warn',
      scope: 'main',
      event: 'streaming.renderer_stop_ack_timeout',
      message: 'Timed out waiting for renderer stop acknowledgement.',
      context: {
        sessionId,
        reason,
        timeoutMs: STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS
      }
    })
    settle(false)
  }, STREAMING_RENDERER_STOP_ACK_TIMEOUT_MS)

  pendingStreamingRendererStopAcks.set(sessionId, {
    reason,
    ownerWindowId,
    resolve: settle,
    timeoutHandle
  })

  return {
    promise,
    dispose: () => {
      settle(false)
    }
  }
}

const resolveStreamingRendererStopAck = (ack: StreamingRendererStopAck, senderWindowId: number | null): void => {
  const pending = pendingStreamingRendererStopAcks.get(ack.sessionId)
  if (!pending) {
    return
  }
  if (pending.reason !== ack.reason) {
    return
  }
  if (pending.ownerWindowId !== null && pending.ownerWindowId !== senderWindowId) {
    return
  }
  pending.resolve(true)
}

const initializeServices = (): MainServices => {
  if (services) {
    return services
  }

  try {
    const settingsService = new SettingsService()
    const secretStore = new SecretStore()
    const historyService = new HistoryService()
    const transcriptionService = new TranscriptionService()
    const transformationService = new TransformationService()
    const outputService = new OutputService()
    const networkCompatibilityService = new NetworkCompatibilityService()
    const soundService = new ElectronSoundService({
      recording_started: SOUND_ASSET_PATHS.recordingStarted,
      recording_stopped: SOUND_ASSET_PATHS.recordingStopped,
      recording_cancelled: SOUND_ASSET_PATHS.recordingCancelled,
      transformation_succeeded: SOUND_ASSET_PATHS.transformationSucceeded,
      transformation_failed: SOUND_ASSET_PATHS.transformationFailed,
      default_profile_changed: SOUND_ASSET_PATHS.defaultProfileChanged
    })
    const clipboardClient = new ClipboardClient()
    const selectionClient = new SelectionClient({ clipboard: clipboardClient })
    const frontmostAppFocusClient = new FrontmostAppFocusClient()
    const profilePickerService = new ProfilePickerService({
      create: (options) => new BrowserWindow(options),
      focusBridge: {
        captureFrontmostAppId: () => frontmostAppFocusClient.captureFrontmostBundleId(),
        restoreFrontmostAppId: (appId) => frontmostAppFocusClient.activateBundleId(appId)
      }
    })
    const apiKeyConnectionService = new ApiKeyConnectionService()
    const outputCoordinator = new SerialOutputCoordinator()
    const whisperCppModelManager = new WhisperCppModelManager({
      isPackaged: app.isPackaged,
      cwd: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      userDataPath: app.getPath('userData')
    })
    const cloudStreamingProviderRegistry = new CloudStreamingProviderRegistry({
      secretStore
    })
    const streamingSessionController = new InMemoryStreamingSessionController({
      outputCoordinator,
      outputService,
      clipboardPolicy: new StreamingPasteClipboardPolicy(),
      transformationService,
      secretStore,
      createProviderRuntime: ({ sessionId, config, callbacks }) => {
        if (config.provider === 'local_whispercpp_coreml') {
          return new WhisperCppStreamingAdapter({
            sessionId,
            config,
            callbacks
          }, {
            modelManager: whisperCppModelManager
          })
        }

        const cloudRuntime = cloudStreamingProviderRegistry.createRuntime({
          sessionId,
          config,
          callbacks
        })
        if (cloudRuntime) {
          return cloudRuntime
        }

        return null
      }
    })
    const captureQueue = new CaptureQueue({
      processor: createCaptureProcessor({
        secretStore,
        transcriptionService,
        transformationService,
        outputService,
        historyService,
        networkCompatibilityService,
        outputCoordinator,
        soundService
      })
    })
    const transformQueue = new TransformQueue({
      processor: createTransformProcessor({
        secretStore,
        transformationService,
        outputService
      }),
      onResult: publishTransformResult
    })
    const recordingOrchestrator = new RecordingOrchestrator({ settingsService })
    const commandRouter = new CommandRouter({
      settingsService,
      recordingOrchestrator,
      captureQueue,
      transformQueue,
      clipboardClient,
      streamingSessionController
    })

    const runRecordingCommand = async (command: RecordingCommand): Promise<void> =>
      await runRecordingCommandThroughRouter(commandRouter, command)

    const hotkeyService = new HotkeyService({
      globalShortcut,
      settingsService,
      commandRouter,
      runRecordingCommand,
      pickProfile: (presets, focusedPresetId) => profilePickerService.pickProfile(presets, focusedPresetId),
      readSelectionText: () => selectionClient.readSelection(),
      onCompositeResult: broadcastCompositeTransformStatus,
      onSettingsUpdated: broadcastSettingsUpdated,
      onDefaultProfileChanged: () => soundService.play('default_profile_changed'),
      onShortcutError: (payload) => {
        const notification: HotkeyErrorNotification = {
          combo: payload.combo,
          message: payload.message
        }
        logStructured({
          level: 'error',
          scope: 'main',
          event: 'hotkey.dispatch_failed',
          message: 'Global shortcut dispatch failed.',
          context: {
            combo: payload.combo,
            accelerator: payload.accelerator,
            detail: payload.message
          }
        })
        broadcastHotkeyError(notification)
      }
    })

    services = {
      settingsService,
      secretStore,
      historyService,
      transcriptionService,
      transformationService,
      outputService,
      networkCompatibilityService,
      soundService,
      clipboardClient,
      selectionClient,
      profilePickerService,
      apiKeyConnectionService,
      commandRouter,
      streamingSessionController,
      hotkeyService
    }
    return services
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured({
      level: 'error',
      scope: 'main',
      event: 'settings.startup_invalid_payload',
      message: 'Failed to initialize settings service from persisted settings.',
      context: { detail: message }
    })
    dialog.showErrorBox(
      'Settings Incompatible',
      'Persisted settings are incompatible with this app version.\n\n' +
      'Delete settings.json in the app userData directory, then restart the app.'
    )
    app.quit()
    throw error
  }
}

// --- Broadcast helpers (defined early so they can be used by pipeline wiring) ---

const broadcastCompositeTransformStatus = (result: CompositeTransformResult): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onCompositeTransformStatus, result)
  }
}

const publishTransformResult = (result: CompositeTransformResult): void => {
  broadcastCompositeTransformStatus(result)
  services?.soundService.play(result.status === 'ok' ? 'transformation_succeeded' : 'transformation_failed')
}

const forEachOpenWindow = (callback: (window: BrowserWindow) => void): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    if (window.webContents.isDestroyed()) {
      continue
    }
    if (typeof window.webContents.isCrashed === 'function' && window.webContents.isCrashed()) {
      continue
    }
    callback(window)
  }
}

const broadcastHotkeyError = (notification: HotkeyErrorNotification): void => {
  forEachOpenWindow((window) => {
    window.webContents.send(IPC_CHANNELS.onHotkeyError, notification)
  })
}

const broadcastSettingsUpdated = (): void => {
  forEachOpenWindow((window) => {
    window.webContents.send(IPC_CHANNELS.onSettingsUpdated)
  })
}

const broadcastRecordingCommand = (dispatch: RecordingCommandDispatch): number => {
  const windows = BrowserWindow.getAllWindows()
  const delivered = dispatchRecordingCommandToRenderers(windows, dispatch)
  if (delivered === 0) {
    const commandLabel = 'kind' in dispatch ? dispatch.kind : dispatch.command
    logStructured({
      level: 'warn',
      scope: 'main',
      event: 'recording.dispatch_skipped_no_renderer',
      message: 'Recording command dispatch skipped because no renderer window is ready.',
      context: {
        command: commandLabel,
        windowCount: windows.length
      }
    })
  }
  return delivered
}

const resolveRendererWindowIdFromSender = (sender: Electron.WebContents): number | null =>
  BrowserWindow.fromWebContents(sender)?.id ?? null

const resolveStreamingOwnerWindowId = (initiatorWindowId: number | null): number | null => {
  const windows = BrowserWindow.getAllWindows().filter((window) => {
    if (window.isDestroyed()) {
      return false
    }
    if (window.webContents.isDestroyed()) {
      return false
    }
    if (typeof window.webContents.isCrashed === 'function' && window.webContents.isCrashed()) {
      return false
    }
    return true
  })

  if (initiatorWindowId !== null && windows.some((window) => window.id === initiatorWindowId)) {
    return initiatorWindowId
  }

  const focusedWindow = BrowserWindow.getFocusedWindow?.()
  if (
    focusedWindow &&
    !focusedWindow.isDestroyed() &&
    !focusedWindow.webContents.isDestroyed() &&
    (typeof focusedWindow.webContents.isCrashed !== 'function' || !focusedWindow.webContents.isCrashed())
  ) {
    return focusedWindow.id
  }

  return windows[0]?.id ?? null
}

const dispatchRecordingCommandToOwner = (
  dispatch: RecordingCommandDispatch,
  ownerWindowId: number | null
): number => {
  const windows = BrowserWindow.getAllWindows()
  const delivered = dispatchRecordingCommandToRenderers(windows, dispatch, ownerWindowId)
  if (delivered === 0) {
    const commandLabel = 'kind' in dispatch ? dispatch.kind : dispatch.command
    logStructured({
      level: 'warn',
      scope: 'main',
      event: 'recording.dispatch_skipped_no_renderer',
      message: 'Recording command dispatch skipped because no target renderer window is ready.',
      context: {
        command: commandLabel,
        targetWindowId: ownerWindowId,
        windowCount: windows.length
      }
    })
  }
  return delivered
}

const broadcastStreamingSessionState = (state: StreamingSessionStateSnapshot): void => {
  if (state.sessionId && (state.state === 'ended' || state.state === 'failed')) {
    streamingSessionOwnerWindowIds.delete(state.sessionId)
  }
  forEachOpenWindow((window) => {
    window.webContents.send(IPC_CHANNELS.onStreamingSessionState, state)
  })
}

const broadcastStreamingSegment = (segment: StreamingSegmentEvent): void => {
  forEachOpenWindow((window) => {
    window.webContents.send(IPC_CHANNELS.onStreamingSegment, segment)
  })
}

const broadcastStreamingError = (error: StreamingErrorEvent): void => {
  forEachOpenWindow((window) => {
    window.webContents.send(IPC_CHANNELS.onStreamingError, error)
  })
}

const getApiKeyStatus = (secretStore: SecretStore) => ({
  groq: secretStore.getApiKey('groq') !== null,
  elevenlabs: secretStore.getApiKey('elevenlabs') !== null,
  google: secretStore.getApiKey('google') !== null
})

const wireStreamingControllerEvents = (
  streamingSessionController: Pick<StreamingSessionController, 'onSessionState' | 'onSegment' | 'onError'>
): void => {
  if (wiredStreamingControllers.has(streamingSessionController as object)) {
    return
  }

  wiredStreamingControllers.add(streamingSessionController as object)
  streamingSessionController.onSessionState(broadcastStreamingSessionState)
  streamingSessionController.onSegment(broadcastStreamingSegment)
  streamingSessionController.onError(broadcastStreamingError)
}

const executeRecordingCommandDispatch = async (
  commandRouter: RecordingCommandRoutingSurface,
  dispatch: RecordingCommandDispatch,
  initiatorWindowId: number | null = null
): Promise<void> => {
  if ('kind' in dispatch && dispatch.kind === 'streaming_start') {
    const ownerWindowId = resolveStreamingOwnerWindowId(initiatorWindowId)
    const delivered = dispatchRecordingCommandToOwner(dispatch, ownerWindowId)
    if (delivered > 0 && ownerWindowId !== null) {
      streamingSessionOwnerWindowIds.set(dispatch.sessionId, ownerWindowId)
    }
    return
  }

  if (!isStreamingStopRequestedDispatch(dispatch)) {
    broadcastRecordingCommand(dispatch)
    return
  }

  const ownerWindowId = streamingSessionOwnerWindowIds.get(dispatch.sessionId) ?? null
  const ackWait = createStreamingRendererStopAckWait(dispatch.sessionId, dispatch.reason, ownerWindowId)
  const delivered = dispatchRecordingCommandToOwner(dispatch, ownerWindowId)
  if (delivered === 0) {
    ackWait.dispose()
    await commandRouter.stopStreamingSession({
      sessionId: dispatch.sessionId,
      reason: dispatch.reason
    })
    streamingSessionOwnerWindowIds.delete(dispatch.sessionId)
    return
  }

  await ackWait.promise
  await commandRouter.stopStreamingSession({
    sessionId: dispatch.sessionId,
    reason: dispatch.reason
  })
  streamingSessionOwnerWindowIds.delete(dispatch.sessionId)
}

const runRecordingCommandThroughRouter = async (
  commandRouter: RecordingCommandRoutingSurface,
  command: RecordingCommand,
  initiatorWindowId: number | null = null
): Promise<void> => {
  const dispatch = await commandRouter.runRecordingCommand(command)
  if (dispatch) {
    await executeRecordingCommandDispatch(commandRouter, dispatch, initiatorWindowId)
  }
}

// --- IPC handler registration ---

const bindIpcHandlers = (svc: MainServices): void => {
  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong')
  ipcMain.handle(IPC_CHANNELS.getSettings, () => svc.settingsService.getSettings())
  ipcMain.handle(IPC_CHANNELS.setSettings, (_event, nextSettings: Settings) => {
    const saved = svc.settingsService.setSettings(nextSettings)
    svc.hotkeyService.registerFromSettings()
    return saved
  })
  ipcMain.handle(IPC_CHANNELS.getApiKeyStatus, () => getApiKeyStatus(svc.secretStore))
  ipcMain.handle(IPC_CHANNELS.setApiKey, (_event, provider: ApiKeyProvider, apiKey: string) => {
    svc.secretStore.setApiKey(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.deleteApiKey, (_event, provider: ApiKeyProvider) => {
    svc.secretStore.deleteApiKey(provider)
  })
  ipcMain.handle(IPC_CHANNELS.testApiKeyConnection, async (_event, provider: ApiKeyProvider, candidateApiKey?: string) => {
    const candidate = candidateApiKey?.trim() ?? ''
    const apiKey = candidate.length > 0 ? candidate : svc.secretStore.getApiKey(provider) ?? ''
    return svc.apiKeyConnectionService.testConnection(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.getHistory, () => svc.historyService.getRecords())
  ipcMain.handle(IPC_CHANNELS.getAudioInputSources, () => svc.commandRouter.getAudioInputSources())
  ipcMain.on(IPC_CHANNELS.playSound, (_event, event: SoundEvent) => {
    svc.soundService.play(event)
  })
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, async (event, command: RecordingCommand) => {
    await runRecordingCommandThroughRouter(svc.commandRouter, command, resolveRendererWindowIdFromSender(event.sender))
  })
  ipcMain.handle(
    IPC_CHANNELS.submitRecordedAudio,
    (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => {
      svc.commandRouter.submitRecordedAudio(payload)
    }
  )
  ipcMain.handle(IPC_CHANNELS.getStreamingSessionSnapshot, () => svc.streamingSessionController.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.startStreamingSession, () => svc.commandRouter.startStreamingSession())
  ipcMain.handle(IPC_CHANNELS.stopStreamingSession, (_event, request: StopStreamingSessionRequest) =>
    svc.commandRouter.stopStreamingSession(request)
  )
  ipcMain.handle(IPC_CHANNELS.ackStreamingRendererStop, (event, ack: StreamingRendererStopAck) => {
    resolveStreamingRendererStopAck(ack, resolveRendererWindowIdFromSender(event.sender))
  })
  ipcMain.handle(IPC_CHANNELS.pushStreamingAudioFrameBatch, (_event, batch: StreamingAudioFrameBatch) =>
    svc.streamingSessionController.pushAudioFrameBatch(batch)
  )
  ipcMain.handle(IPC_CHANNELS.runPickTransformationFromClipboard, async () => svc.hotkeyService.runPickAndRunTransform())
}

export const registerIpcHandlers = (): void => {
  const svc = initializeServices()
  wireStreamingControllerEvents(svc.streamingSessionController)
  bindIpcHandlers(svc)
  svc.hotkeyService.registerFromSettings()
}

export const registerIpcHandlersWithServices = (svc: MainServices): void => {
  services = svc
  wireStreamingControllerEvents(svc.streamingSessionController)
  bindIpcHandlers(svc)
}

export const resetMainServicesForTest = (): void => {
  services = null
  for (const pending of pendingStreamingRendererStopAcks.values()) {
    clearTimeout(pending.timeoutHandle)
    pending.resolve(false)
  }
  pendingStreamingRendererStopAcks.clear()
  streamingSessionOwnerWindowIds.clear()
}

export const unregisterGlobalHotkeys = (): void => {
  services?.hotkeyService.unregisterAll()
}
