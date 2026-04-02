import type { FailureCategory, Settings, TerminalJobStatus } from './domain'
import type { LocalCleanupModelId, LocalCleanupRuntimeId } from './local-llm'

export type RecordingCommand = 'toggleRecording' | 'cancelRecording'
export type ApiKeyProvider = 'groq' | 'elevenlabs' | 'google'
export interface AudioInputSource {
  id: string
  label: string
}
export type SoundEvent =
  | 'recording_started'
  | 'recording_stopped'
  | 'recording_cancelled'
  | 'transformation_succeeded'
  | 'transformation_failed'
  | 'default_profile_changed'
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
  failureCategory?: FailureCategory | null
  createdAt: string
}

export interface CompositeTransformResult {
  status: 'ok' | 'error'
  message: string
}

export interface ScratchSpaceTranscriptionResult {
  status: 'ok' | 'error'
  message: string
  text: string | null
}

export interface ScratchSpaceExecutionResult {
  status: 'ok' | 'error'
  message: string
  text: string | null
}

export interface LocalCleanupAvailableModel {
  id: LocalCleanupModelId
  label: string
}

export type LocalCleanupReadinessStatus =
  | { kind: 'ready'; message: string }
  | { kind: 'runtime_unavailable'; message: string }
  | { kind: 'server_unreachable'; message: string }
  | { kind: 'auth_error'; message: string }
  | { kind: 'no_supported_models'; message: string }
  | { kind: 'selected_model_missing'; message: string }
  | { kind: 'unknown'; message: string }

export interface LocalCleanupReadinessSnapshot {
  runtime: LocalCleanupRuntimeId
  status: LocalCleanupReadinessStatus
  availableModels: LocalCleanupAvailableModel[]
  selectedModelId: LocalCleanupModelId
  selectedModelInstalled: boolean
}

// Shared non-terminal transform acknowledgement text used by main+renderer.
export const COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE = 'Transformation enqueued.'
export interface HotkeyErrorNotification {
  combo: string
  message: string
}

export interface IpcApi {
  ping: () => Promise<string>
  getSettings: () => Promise<Settings>
  setSettings: (settings: Settings) => Promise<Settings>
  getLocalCleanupStatus: () => Promise<LocalCleanupReadinessSnapshot>
  getApiKeyStatus: () => Promise<ApiKeyStatusSnapshot>
  setApiKey: (provider: ApiKeyProvider, apiKey: string) => Promise<void>
  deleteApiKey: (provider: ApiKeyProvider) => Promise<void>
  testApiKeyConnection: (provider: ApiKeyProvider, candidateApiKey?: string) => Promise<ApiKeyConnectionTestResult>
  getHistory: () => Promise<HistoryRecordSnapshot[]>
  getAudioInputSources: () => Promise<AudioInputSource[]>
  playSound: (event: SoundEvent) => Promise<void>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  submitRecordedAudio: (payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => Promise<void>
  getScratchSpaceDraft: () => Promise<string>
  setScratchSpaceDraft: (draft: string) => Promise<void>
  transcribeScratchSpaceAudio: (payload: {
    data: Uint8Array
    mimeType: string
    capturedAt: string
  }) => Promise<ScratchSpaceTranscriptionResult>
  runScratchSpaceTransformation: (payload: {
    text: string
    presetId: string
  }) => Promise<ScratchSpaceExecutionResult>
  hideScratchSpaceWindow: () => Promise<void>
  onRecordingCommand: (listener: (dispatch: RecordingCommandDispatch) => void) => () => void
  runPickTransformationFromClipboard: () => Promise<void>
  onCompositeTransformStatus: (listener: (result: CompositeTransformResult) => void) => () => void
  onHotkeyError: (listener: (notification: HotkeyErrorNotification) => void) => () => void
  onSettingsUpdated: (listener: () => void) => () => void
  onOpenSettings: (listener: () => void) => () => void
  onOpenScratchSpace: (listener: () => void) => () => void
}

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getLocalCleanupStatus: 'local-cleanup:get-status',
  getApiKeyStatus: 'secrets:get-status',
  setApiKey: 'secrets:set-api-key',
  deleteApiKey: 'secrets:delete-api-key',
  testApiKeyConnection: 'secrets:test-api-key-connection',
  getHistory: 'history:get',
  getAudioInputSources: 'recording:get-audio-input-sources',
  playSound: 'sound:play',
  runRecordingCommand: 'recording:run-command',
  submitRecordedAudio: 'recording:submit-recorded-audio',
  getScratchSpaceDraft: 'scratch-space:get-draft',
  setScratchSpaceDraft: 'scratch-space:set-draft',
  transcribeScratchSpaceAudio: 'scratch-space:transcribe-audio',
  runScratchSpaceTransformation: 'scratch-space:run-transformation',
  hideScratchSpaceWindow: 'scratch-space:hide-window',
  onRecordingCommand: 'recording:on-command',
  runPickTransformationFromClipboard: 'transform:pick-and-run-from-clipboard',
  onCompositeTransformStatus: 'transform:composite-status',
  onHotkeyError: 'hotkey:error',
  onSettingsUpdated: 'settings:on-updated',
  onOpenSettings: 'app:open-settings',
  onOpenScratchSpace: 'scratch-space:open'
} as const
