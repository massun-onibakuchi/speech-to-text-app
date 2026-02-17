/**
 * Where: src/main/ipc/register-handlers.ts
 * What:  Composition root — instantiates services and registers IPC handlers.
 * Why:   Central wiring point where all main-process dependencies are assembled.
 *        Phase 2A: CommandRouter dispatches to CaptureQueue and TransformQueue
 *        with SerialOutputCoordinator for ordered output commits.
 */

import { BrowserWindow, ipcMain, globalShortcut } from 'electron'
import {
  IPC_CHANNELS,
  type ApiKeyProvider,
  type CompositeTransformResult,
  type HotkeyErrorNotification,
  type RecordingCommand,
  type RecordingCommandDispatch
} from '../../shared/ipc'
import type { Settings } from '../../shared/domain'
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
import { ClipboardClient } from '../infrastructure/clipboard-client'
import { SerialOutputCoordinator } from '../coordination/ordered-output-coordinator'
import { CaptureQueue } from '../queues/capture-queue'
import { TransformQueue } from '../queues/transform-queue'
import { createCaptureProcessor } from '../orchestrators/capture-pipeline'
import { createTransformProcessor } from '../orchestrators/transform-pipeline'
import { CommandRouter } from '../core/command-router'
import { dispatchRecordingCommandToRenderers } from './recording-command-dispatcher'

// --- Service instances ---
const settingsService = new SettingsService()
const secretStore = new SecretStore()
const historyService = new HistoryService()
const transcriptionService = new TranscriptionService()
const transformationService = new TransformationService()
const outputService = new OutputService()
const networkCompatibilityService = new NetworkCompatibilityService()
const clipboardClient = new ClipboardClient()
const apiKeyConnectionService = new ApiKeyConnectionService()

// --- Broadcast helpers (defined early so they can be used by pipeline wiring) ---

const broadcastCompositeTransformStatus = (result: CompositeTransformResult): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onCompositeTransformStatus, result)
  }
}

// --- Pipeline wiring (Phase 2A) ---
const outputCoordinator = new SerialOutputCoordinator()

const captureQueue = new CaptureQueue({
  processor: createCaptureProcessor({
    secretStore,
    transcriptionService,
    transformationService,
    outputService,
    historyService,
    networkCompatibilityService,
    outputCoordinator
  })
})

const transformQueue = new TransformQueue({
  processor: createTransformProcessor({
    secretStore,
    transformationService,
    outputService
  }),
  // Broadcast each transform result to renderer windows so the UI shows actual outcomes.
  onResult: broadcastCompositeTransformStatus
})

// RecordingOrchestrator handles recording commands and audio file persistence only.
// Enqueue-to-processing is done by CommandRouter via CaptureQueue.
const recordingOrchestrator = new RecordingOrchestrator({ settingsService })

const commandRouter = new CommandRouter({
  settingsService,
  recordingOrchestrator,
  captureQueue,
  transformQueue,
  clipboardClient
})

const broadcastHotkeyError = (notification: HotkeyErrorNotification): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onHotkeyError, notification)
  }
}

const broadcastRecordingCommand = (dispatch: RecordingCommandDispatch): void => {
  const delivered = dispatchRecordingCommandToRenderers(BrowserWindow.getAllWindows(), dispatch)
  if (delivered === 0) {
    throw new Error('No active renderer window is available to handle recording commands.')
  }
}

const runRecordingCommand = async (command: RecordingCommand): Promise<void> => {
  const dispatch = commandRouter.runRecordingCommand(command)
  broadcastRecordingCommand(dispatch)
}

const hotkeyService = new HotkeyService({
  globalShortcut,
  settingsService,
  commandRouter,
  runRecordingCommand,
  onCompositeResult: broadcastCompositeTransformStatus,
  onShortcutError: (payload) => {
    const notification: HotkeyErrorNotification = {
      combo: payload.combo,
      message: payload.message
    }
    console.error(`Global shortcut failed [${payload.combo} -> ${payload.accelerator}]: ${payload.message}`)
    broadcastHotkeyError(notification)
  }
})

const getApiKeyStatus = () => ({
  groq: secretStore.getApiKey('groq') !== null,
  elevenlabs: secretStore.getApiKey('elevenlabs') !== null,
  google: secretStore.getApiKey('google') !== null
})

// --- IPC handler registration ---

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong')
  ipcMain.handle(IPC_CHANNELS.getSettings, () => settingsService.getSettings())
  ipcMain.handle(IPC_CHANNELS.setSettings, (_event, nextSettings: Settings) => {
    const saved = settingsService.setSettings(nextSettings)
    hotkeyService.registerFromSettings()
    return saved
  })
  ipcMain.handle(IPC_CHANNELS.getApiKeyStatus, () => getApiKeyStatus())
  ipcMain.handle(IPC_CHANNELS.setApiKey, (_event, provider: ApiKeyProvider, apiKey: string) => {
    secretStore.setApiKey(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.testApiKeyConnection, async (_event, provider: ApiKeyProvider, candidateApiKey?: string) => {
    const candidate = candidateApiKey?.trim() ?? ''
    const apiKey = candidate.length > 0 ? candidate : secretStore.getApiKey(provider) ?? ''
    return apiKeyConnectionService.testConnection(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.getHistory, () => historyService.getRecords())
  ipcMain.handle(IPC_CHANNELS.getAudioInputSources, () => commandRouter.getAudioInputSources())
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, (_event, command: RecordingCommand) => runRecordingCommand(command))
  ipcMain.handle(
    IPC_CHANNELS.submitRecordedAudio,
    (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => {
      commandRouter.submitRecordedAudio(payload)
    }
  )
  ipcMain.handle(IPC_CHANNELS.runCompositeTransformFromClipboard, async () => commandRouter.runCompositeFromClipboard())

  hotkeyService.registerFromSettings()
}

export const unregisterGlobalHotkeys = (): void => {
  hotkeyService.unregisterAll()
}
