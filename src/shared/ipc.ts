import type {
  FailureCategory,
  Settings,
  StreamingProvider,
  StreamingTransportKind,
  TerminalJobStatus
} from './domain'

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
export interface BatchRecordingCommandDispatch {
  command: RecordingCommand
  preferredDeviceId?: string
}
export type RendererInitiatedStreamingStopReason = 'user_stop' | 'user_cancel' | 'fatal_error'
export interface StreamingStartCommandDispatch {
  kind: 'streaming_start'
  sessionId: string
  preferredDeviceId?: string
}
export interface StreamingStopRequestedCommandDispatch {
  kind: 'streaming_stop_requested'
  sessionId: string
  reason: RendererInitiatedStreamingStopReason
}
export type RecordingCommandDispatch =
  | BatchRecordingCommandDispatch
  | StreamingStartCommandDispatch
  | StreamingStopRequestedCommandDispatch

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

export type StreamingSessionState = 'idle' | 'starting' | 'active' | 'stopping' | 'ended' | 'failed'
export type StreamingSessionStopReason = 'user_stop' | 'user_cancel' | 'fatal_error'
export interface StopStreamingSessionRequest {
  sessionId: string
  reason: RendererInitiatedStreamingStopReason
}
export interface StreamingRendererStopAck {
  sessionId: string
  reason: RendererInitiatedStreamingStopReason
}

export interface StreamingSessionStateSnapshot {
  sessionId: string | null
  state: StreamingSessionState
  provider: StreamingProvider | null
  transport: StreamingTransportKind | null
  model: string | null
  reason: StreamingSessionStopReason | null
}

export interface StreamingSegmentEvent {
  sessionId: string
  sequence: number
  text: string
  delimiter: string
  isFinal: boolean
  startedAt: string
  endedAt: string
}

export interface StreamingAudioFrame {
  samples: Float32Array
  timestampMs: number
}

export type StreamingAudioChunkFlushReason = 'speech_pause' | 'max_chunk' | 'session_stop' | 'discard_pending'

export interface StreamingAudioFrameBatch {
  sampleRateHz: number
  channels: number
  frames: StreamingAudioFrame[]
  flushReason: StreamingAudioChunkFlushReason | null
}

export interface StreamingErrorEvent {
  sessionId: string | null
  code: string
  message: string
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
  getApiKeyStatus: () => Promise<ApiKeyStatusSnapshot>
  setApiKey: (provider: ApiKeyProvider, apiKey: string) => Promise<void>
  deleteApiKey: (provider: ApiKeyProvider) => Promise<void>
  testApiKeyConnection: (provider: ApiKeyProvider, candidateApiKey?: string) => Promise<ApiKeyConnectionTestResult>
  getHistory: () => Promise<HistoryRecordSnapshot[]>
  getAudioInputSources: () => Promise<AudioInputSource[]>
  playSound: (event: SoundEvent) => Promise<void>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  submitRecordedAudio: (payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => Promise<void>
  getStreamingSessionSnapshot: () => Promise<StreamingSessionStateSnapshot>
  startStreamingSession: () => Promise<void>
  stopStreamingSession: (request: StopStreamingSessionRequest) => Promise<void>
  ackStreamingRendererStop: (ack: StreamingRendererStopAck) => Promise<void>
  pushStreamingAudioFrameBatch: (batch: StreamingAudioFrameBatch) => Promise<void>
  onRecordingCommand: (listener: (dispatch: RecordingCommandDispatch) => void) => () => void
  onStreamingSessionState: (listener: (state: StreamingSessionStateSnapshot) => void) => () => void
  onStreamingSegment: (listener: (segment: StreamingSegmentEvent) => void) => () => void
  onStreamingError: (listener: (error: StreamingErrorEvent) => void) => () => void
  runPickTransformationFromClipboard: () => Promise<void>
  onCompositeTransformStatus: (listener: (result: CompositeTransformResult) => void) => () => void
  onHotkeyError: (listener: (notification: HotkeyErrorNotification) => void) => () => void
  onSettingsUpdated: (listener: () => void) => () => void
  onOpenSettings: (listener: () => void) => () => void
}

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getApiKeyStatus: 'secrets:get-status',
  setApiKey: 'secrets:set-api-key',
  deleteApiKey: 'secrets:delete-api-key',
  testApiKeyConnection: 'secrets:test-api-key-connection',
  getHistory: 'history:get',
  getAudioInputSources: 'recording:get-audio-input-sources',
  playSound: 'sound:play',
  runRecordingCommand: 'recording:run-command',
  submitRecordedAudio: 'recording:submit-recorded-audio',
  getStreamingSessionSnapshot: 'streaming:get-session-snapshot',
  startStreamingSession: 'streaming:start-session',
  stopStreamingSession: 'streaming:stop-session',
  ackStreamingRendererStop: 'streaming:ack-renderer-stop',
  pushStreamingAudioFrameBatch: 'streaming:push-audio-frame-batch',
  onRecordingCommand: 'recording:on-command',
  onStreamingSessionState: 'streaming:on-session-state',
  onStreamingSegment: 'streaming:on-segment',
  onStreamingError: 'streaming:on-error',
  runPickTransformationFromClipboard: 'transform:pick-and-run-from-clipboard',
  onCompositeTransformStatus: 'transform:composite-status',
  onHotkeyError: 'hotkey:error',
  onSettingsUpdated: 'settings:on-updated',
  onOpenSettings: 'app:open-settings'
} as const
