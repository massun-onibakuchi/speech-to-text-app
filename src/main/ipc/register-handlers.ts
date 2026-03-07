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
  type SoundEvent,
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
    const streamingSessionController = new InMemoryStreamingSessionController({
      outputCoordinator,
      outputService,
      clipboardPolicy: new StreamingPasteClipboardPolicy()
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

    const runRecordingCommand = async (command: RecordingCommand): Promise<void> => {
      const dispatch = await commandRouter.runRecordingCommand(command)
      if (dispatch) {
        broadcastRecordingCommand(dispatch)
      }
    }

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

const broadcastRecordingCommand = (dispatch: RecordingCommandDispatch): void => {
  const windows = BrowserWindow.getAllWindows()
  const delivered = dispatchRecordingCommandToRenderers(windows, dispatch)
  if (delivered === 0) {
    logStructured({
      level: 'warn',
      scope: 'main',
      event: 'recording.dispatch_skipped_no_renderer',
      message: 'Recording command dispatch skipped because no renderer window is ready.',
      context: {
        command: dispatch.command,
        windowCount: windows.length
      }
    })
  }
}

const broadcastStreamingSessionState = (state: StreamingSessionStateSnapshot): void => {
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
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, async (_event, command: RecordingCommand) => {
    const dispatch = await svc.commandRouter.runRecordingCommand(command)
    if (dispatch) {
      broadcastRecordingCommand(dispatch)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.submitRecordedAudio,
    (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => {
      svc.commandRouter.submitRecordedAudio(payload)
    }
  )
  ipcMain.handle(IPC_CHANNELS.startStreamingSession, () => svc.commandRouter.startStreamingSession())
  ipcMain.handle(IPC_CHANNELS.stopStreamingSession, () => svc.commandRouter.stopStreamingSession())
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
}

export const unregisterGlobalHotkeys = (): void => {
  services?.hotkeyService.unregisterAll()
}
