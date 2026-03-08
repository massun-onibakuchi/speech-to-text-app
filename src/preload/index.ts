import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type ApiKeyProvider,
  type CompositeTransformResult,
  type HotkeyErrorNotification,
  type IpcApi,
  type StopStreamingSessionRequest,
  type SoundEvent,
  type StreamingErrorEvent,
  type RecordingCommandDispatch,
  type RecordingCommand,
  type StreamingRendererStopAck,
  type StreamingSegmentEvent,
  type StreamingSessionStateSnapshot
} from '../shared/ipc'
import type { Settings } from '../shared/domain'

const api: IpcApi = {
  ping: async (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: async (settings: Settings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
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
  startStreamingSession: async () => ipcRenderer.invoke(IPC_CHANNELS.startStreamingSession),
  stopStreamingSession: async (request: StopStreamingSessionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.stopStreamingSession, request),
  ackStreamingRendererStop: async (ack: StreamingRendererStopAck) =>
    ipcRenderer.invoke(IPC_CHANNELS.ackStreamingRendererStop, ack),
  pushStreamingAudioFrameBatch: async (batch) => ipcRenderer.invoke(IPC_CHANNELS.pushStreamingAudioFrameBatch, batch),
  onRecordingCommand: (listener: (dispatch: RecordingCommandDispatch) => void) => {
    const handler = (_event: unknown, dispatch: RecordingCommandDispatch) => listener(dispatch)
    ipcRenderer.on(IPC_CHANNELS.onRecordingCommand, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onRecordingCommand, handler)
    }
  },
  onStreamingSessionState: (listener: (state: StreamingSessionStateSnapshot) => void) => {
    const handler = (_event: unknown, state: StreamingSessionStateSnapshot) => listener(state)
    ipcRenderer.on(IPC_CHANNELS.onStreamingSessionState, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onStreamingSessionState, handler)
    }
  },
  onStreamingSegment: (listener: (segment: StreamingSegmentEvent) => void) => {
    const handler = (_event: unknown, segment: StreamingSegmentEvent) => listener(segment)
    ipcRenderer.on(IPC_CHANNELS.onStreamingSegment, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onStreamingSegment, handler)
    }
  },
  onStreamingError: (listener: (error: StreamingErrorEvent) => void) => {
    const handler = (_event: unknown, error: StreamingErrorEvent) => listener(error)
    ipcRenderer.on(IPC_CHANNELS.onStreamingError, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onStreamingError, handler)
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
  }
}

contextBridge.exposeInMainWorld('speechToTextApi', api)
contextBridge.exposeInMainWorld('electronPlatform', process.platform)
