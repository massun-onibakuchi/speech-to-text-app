import type { Settings, TerminalJobStatus } from './domain'

export type RecordingCommand = 'startRecording' | 'stopRecording' | 'toggleRecording' | 'cancelRecording'

export interface HistoryRecordSnapshot {
  jobId: string
  capturedAt: string
  transcriptText: string | null
  transformedText: string | null
  terminalStatus: TerminalJobStatus
  createdAt: string
}

export interface IpcApi {
  ping: () => Promise<string>
  getSettings: () => Promise<Settings>
  getHistory: () => Promise<HistoryRecordSnapshot[]>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  runCompositeTransformFromClipboard: () => Promise<{ status: 'ok' | 'error'; message: string }>
}

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  getHistory: 'history:get',
  runRecordingCommand: 'recording:run-command',
  runCompositeTransformFromClipboard: 'transform:composite-from-clipboard'
} as const
