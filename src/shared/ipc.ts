import type { Settings } from './domain'

export type RecordingCommand = 'startRecording' | 'stopRecording' | 'toggleRecording' | 'cancelRecording'

export interface IpcApi {
  ping: () => Promise<string>
  getSettings: () => Promise<Settings>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  runCompositeTransformFromClipboard: () => Promise<{ status: 'ok' | 'error'; message: string }>
}

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  runRecordingCommand: 'recording:run-command',
  runCompositeTransformFromClipboard: 'transform:composite-from-clipboard'
} as const
