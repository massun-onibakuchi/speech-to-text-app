import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type ApiKeyProvider,
  type CompositeTransformResult,
  type HotkeyErrorNotification,
  type IpcApi,
  type SoundEvent,
  type RecordingCommandDispatch,
  type RecordingCommand
} from '../shared/ipc'
import type { Settings } from '../shared/domain'

const api: IpcApi = {
  ping: async (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: async (settings: Settings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
  getLocalCleanupStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.getLocalCleanupStatus),
  getApiKeyStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.getApiKeyStatus),
  setApiKey: async (provider: ApiKeyProvider, apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.setApiKey, provider, apiKey),
  deleteApiKey: async (provider: ApiKeyProvider) => ipcRenderer.invoke(IPC_CHANNELS.deleteApiKey, provider),
  testApiKeyConnection: async (provider: ApiKeyProvider, candidateApiKey?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.testApiKeyConnection, provider, candidateApiKey),
  getHistory: async () => ipcRenderer.invoke(IPC_CHANNELS.getHistory),
  getAudioInputSources: async () => ipcRenderer.invoke(IPC_CHANNELS.getAudioInputSources),
  playSound: async (event: SoundEvent) => {
    ipcRenderer.send(IPC_CHANNELS.playSound, event)
  },
  runRecordingCommand: async (command: RecordingCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.runRecordingCommand, command),
  submitRecordedAudio: async (payload) => ipcRenderer.invoke(IPC_CHANNELS.submitRecordedAudio, payload),
  getScratchSpaceDraft: async () => ipcRenderer.invoke(IPC_CHANNELS.getScratchSpaceDraft),
  setScratchSpaceDraft: async (draft: string) => ipcRenderer.invoke(IPC_CHANNELS.setScratchSpaceDraft, draft),
  transcribeScratchSpaceAudio: async (payload) => ipcRenderer.invoke(IPC_CHANNELS.transcribeScratchSpaceAudio, payload),
  runScratchSpaceTransformation: async (payload) => ipcRenderer.invoke(IPC_CHANNELS.runScratchSpaceTransformation, payload),
  hideScratchSpaceWindow: async () => ipcRenderer.invoke(IPC_CHANNELS.hideScratchSpaceWindow),
  onRecordingCommand: (listener: (dispatch: RecordingCommandDispatch) => void) => {
    const handler = (_event: unknown, dispatch: RecordingCommandDispatch) => listener(dispatch)
    ipcRenderer.on(IPC_CHANNELS.onRecordingCommand, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onRecordingCommand, handler)
    }
  },
  runPickTransformationFromClipboard: async () => ipcRenderer.invoke(IPC_CHANNELS.runPickTransformationFromClipboard),
  onCompositeTransformStatus: (listener: (result: CompositeTransformResult) => void) => {
    const handler = (_event: unknown, result: CompositeTransformResult) => listener(result)
    ipcRenderer.on(IPC_CHANNELS.onCompositeTransformStatus, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onCompositeTransformStatus, handler)
    }
  },
  onHotkeyError: (listener: (notification: HotkeyErrorNotification) => void) => {
    const handler = (_event: unknown, notification: HotkeyErrorNotification) => listener(notification)
    ipcRenderer.on(IPC_CHANNELS.onHotkeyError, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onHotkeyError, handler)
    }
  },
  onSettingsUpdated: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.onSettingsUpdated, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onSettingsUpdated, handler)
    }
  },
  onOpenSettings: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.onOpenSettings, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onOpenSettings, handler)
    }
  },
  onOpenScratchSpace: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.onOpenScratchSpace, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onOpenScratchSpace, handler)
    }
  }
}

contextBridge.exposeInMainWorld('speechToTextApi', api)
contextBridge.exposeInMainWorld('electronPlatform', process.platform)
