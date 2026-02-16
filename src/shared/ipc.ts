import type { Settings, TerminalJobStatus } from './domain'

export type RecordingCommand = 'startRecording' | 'stopRecording' | 'toggleRecording' | 'cancelRecording'
export type ApiKeyProvider = 'groq' | 'elevenlabs' | 'google'
export interface AudioInputSource {
  id: string
  label: string
}
export interface RecordingCommandDispatch {
  command: RecordingCommand
  preferredDeviceId?: string
}

export interface ApiKeyStatusSnapshot {
  groq: boolean
  elevenlabs: boolean
  google: boolean
}
export interface ApiKeyConnectionTestResult {
  provider: ApiKeyProvider
  status: 'success' | 'failed'
  message: string
}

export interface HistoryRecordSnapshot {
  jobId: string
  capturedAt: string
  transcriptText: string | null
  transformedText: string | null
  terminalStatus: TerminalJobStatus
  failureDetail?: string | null
  createdAt: string
}

export interface CompositeTransformResult {
  status: 'ok' | 'error'
  message: string
}
export interface HotkeyErrorNotification {
  combo: string
  message: string
}

export interface IpcApi {
  ping: () => Promise<string>
  getSettings: () => Promise<Settings>
  setSettings: (settings: Settings) => Promise<Settings>
  getApiKeyStatus: () => Promise<ApiKeyStatusSnapshot>
  setApiKey: (provider: ApiKeyProvider, apiKey: string) => Promise<void>
  testApiKeyConnection: (provider: ApiKeyProvider, candidateApiKey?: string) => Promise<ApiKeyConnectionTestResult>
  getHistory: () => Promise<HistoryRecordSnapshot[]>
  getAudioInputSources: () => Promise<AudioInputSource[]>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  submitRecordedAudio: (payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => Promise<void>
  onRecordingCommand: (listener: (dispatch: RecordingCommandDispatch) => void) => () => void
  runCompositeTransformFromClipboard: () => Promise<CompositeTransformResult>
  onCompositeTransformStatus: (listener: (result: CompositeTransformResult) => void) => () => void
  onHotkeyError: (listener: (notification: HotkeyErrorNotification) => void) => () => void
}

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getApiKeyStatus: 'secrets:get-status',
  setApiKey: 'secrets:set-api-key',
  testApiKeyConnection: 'secrets:test-api-key-connection',
  getHistory: 'history:get',
  getAudioInputSources: 'recording:get-audio-input-sources',
  runRecordingCommand: 'recording:run-command',
  submitRecordedAudio: 'recording:submit-recorded-audio',
  onRecordingCommand: 'recording:on-command',
  runCompositeTransformFromClipboard: 'transform:composite-from-clipboard',
  onCompositeTransformStatus: 'transform:composite-status',
  onHotkeyError: 'hotkey:error'
} as const
