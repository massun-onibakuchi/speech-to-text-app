import { ipcMain } from 'electron'
import { IPC_CHANNELS, type RecordingCommand } from '../../shared/ipc'
import { SettingsService } from '../services/settings-service'
import { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import { TransformationOrchestrator } from '../orchestrators/transformation-orchestrator'
import { HistoryService } from '../services/history-service'

const settingsService = new SettingsService()
const recordingOrchestrator = new RecordingOrchestrator()
const transformationOrchestrator = new TransformationOrchestrator()
const historyService = new HistoryService()

const runRecordingCommand = async (command: RecordingCommand): Promise<void> => {
  await recordingOrchestrator.runCommand(command)
}

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong')
  ipcMain.handle(IPC_CHANNELS.getSettings, () => settingsService.getSettings())
  ipcMain.handle(IPC_CHANNELS.getHistory, () => historyService.getRecords())
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, (_event, command: RecordingCommand) => runRecordingCommand(command))
  ipcMain.handle(IPC_CHANNELS.runCompositeTransformFromClipboard, () =>
    transformationOrchestrator.runCompositeFromClipboard()
  )
}
