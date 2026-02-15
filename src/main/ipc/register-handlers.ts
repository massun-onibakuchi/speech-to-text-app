import { BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { IPC_CHANNELS, type ApiKeyProvider, type CompositeTransformResult, type RecordingCommand } from '../../shared/ipc'
import type { Settings } from '../../shared/domain'
import { SettingsService } from '../services/settings-service'
import { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import { TransformationOrchestrator } from '../orchestrators/transformation-orchestrator'
import { HistoryService } from '../services/history-service'
import { SecretStore } from '../services/secret-store'
import { HotkeyService } from '../services/hotkey-service'
import { ApiKeyConnectionService } from '../services/api-key-connection-service'

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

const hotkeyService = new HotkeyService({
  globalShortcut,
  settingsService,
  transformationOrchestrator,
  recordingOrchestrator,
  onCompositeResult: broadcastCompositeTransformStatus
})

const runRecordingCommand = async (command: RecordingCommand): Promise<void> => {
  await recordingOrchestrator.runCommand(command)
}

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
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, (_event, command: RecordingCommand) => runRecordingCommand(command))
  ipcMain.handle(IPC_CHANNELS.runCompositeTransformFromClipboard, async () => transformationOrchestrator.runCompositeFromClipboard())

  hotkeyService.registerFromSettings()
}

export const unregisterGlobalHotkeys = (): void => {
  hotkeyService.unregisterAll()
}
