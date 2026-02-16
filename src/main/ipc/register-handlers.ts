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
import { TransformationOrchestrator } from '../orchestrators/transformation-orchestrator'
import { HistoryService } from '../services/history-service'
import { SecretStore } from '../services/secret-store'
import { HotkeyService } from '../services/hotkey-service'
import { ApiKeyConnectionService } from '../services/api-key-connection-service'
import { dispatchRecordingCommandToRenderers } from './recording-command-dispatcher'

const settingsService = new SettingsService()
const recordingOrchestrator = new RecordingOrchestrator()
const transformationOrchestrator = new TransformationOrchestrator()
const historyService = new HistoryService()
const secretStore = new SecretStore()
const apiKeyConnectionService = new ApiKeyConnectionService()

const broadcastCompositeTransformStatus = (result: CompositeTransformResult): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onCompositeTransformStatus, result)
  }
}

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
  const dispatch = recordingOrchestrator.runCommand(command)
  broadcastRecordingCommand(dispatch)
}

const hotkeyService = new HotkeyService({
  globalShortcut,
  settingsService,
  transformationOrchestrator,
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
  ipcMain.handle(IPC_CHANNELS.getAudioInputSources, () => recordingOrchestrator.getAudioInputSources())
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, (_event, command: RecordingCommand) => runRecordingCommand(command))
  ipcMain.handle(
    IPC_CHANNELS.submitRecordedAudio,
    (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => {
      recordingOrchestrator.submitRecordedAudio(payload)
    }
  )
  ipcMain.handle(IPC_CHANNELS.runCompositeTransformFromClipboard, async () => transformationOrchestrator.runCompositeFromClipboard())

  hotkeyService.registerFromSettings()
}

export const unregisterGlobalHotkeys = (): void => {
  hotkeyService.unregisterAll()
}
