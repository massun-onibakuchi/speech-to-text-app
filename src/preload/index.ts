import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type IpcApi, type RecordingCommand } from '../shared/ipc'

const api: IpcApi = {
  ping: async (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  runRecordingCommand: async (command: RecordingCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.runRecordingCommand, command),
  runCompositeTransformFromClipboard: async () => ipcRenderer.invoke(IPC_CHANNELS.runCompositeTransformFromClipboard)
}

contextBridge.exposeInMainWorld('speechToTextApi', api)
