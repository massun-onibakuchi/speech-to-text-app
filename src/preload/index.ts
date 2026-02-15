import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ApiKeyProvider, type CompositeTransformResult, type IpcApi, type RecordingCommand } from '../shared/ipc'
import type { Settings } from '../shared/domain'

const api: IpcApi = {
  ping: async (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: async (settings: Settings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
  getApiKeyStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.getApiKeyStatus),
  setApiKey: async (provider: ApiKeyProvider, apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.setApiKey, provider, apiKey),
  testApiKeyConnection: async (provider: ApiKeyProvider, candidateApiKey?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.testApiKeyConnection, provider, candidateApiKey),
  getHistory: async () => ipcRenderer.invoke(IPC_CHANNELS.getHistory),
  runRecordingCommand: async (command: RecordingCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.runRecordingCommand, command),
  runCompositeTransformFromClipboard: async () => ipcRenderer.invoke(IPC_CHANNELS.runCompositeTransformFromClipboard),
  onCompositeTransformStatus: (listener: (result: CompositeTransformResult) => void) => {
    const handler = (_event: unknown, result: CompositeTransformResult) => listener(result)
    ipcRenderer.on(IPC_CHANNELS.onCompositeTransformStatus, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onCompositeTransformStatus, handler)
    }
  }
}

contextBridge.exposeInMainWorld('speechToTextApi', api)
