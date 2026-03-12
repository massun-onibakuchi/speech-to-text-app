/*
Where: src/renderer/native-recording.ts
What: Native (browser MediaRecorder) recording lifecycle and audio-source discovery.
Why: Extracted from renderer-app.tsx (Phase 6) to separate device/recording concerns
     from the orchestration layer. All functions receive a deps object so they remain
     pure with respect to module state other than the local recorderState singleton.
*/

import type { Settings } from '../shared/domain'
import type {
  ApiKeyStatusSnapshot,
  AudioInputSource,
  RecordingCommandDispatch,
  RendererInitiatedStreamingStopReason,
  StreamingAudioFrameBatch,
  StreamingAudioUtteranceChunk,
  StreamingSessionStateSnapshot
} from '../shared/ipc'
import { SYSTEM_DEFAULT_AUDIO_SOURCE } from './app-shell-react'
import type { ActivityItem } from './activity-feed'
import { formatFailureFeedback } from './failure-feedback'
import { isTransformedOutputRecordingBlocked } from './blocked-control'
import { resolveRecordingDeviceFallbackWarning, resolveRecordingDeviceId } from './recording-device'
import type { HistoryRecordSnapshot } from '../shared/ipc'
import {
  startGroqBrowserVadCapture,
  type GroqBrowserVadSink
} from './groq-browser-vad-capture'
import { startStreamingLiveCapture, type StreamingLiveCapture } from './streaming-live-capture'

// ---------------------------------------------------------------------------
// Local recorder state — module-level singleton, reset via resetRecordingState().
// ---------------------------------------------------------------------------
const recorderState = {
  mediaRecorder: null as MediaRecorder | null,
  mediaStream: null as MediaStream | null,
  streamingCapture: null as StreamingLiveCapture | null,
  streamingSessionId: null as string | null,
  lastHandledStreamingStopSessionId: null as string | null,
  chunks: [] as BlobPart[],
  shouldPersistOnStop: true,
  startedAt: '' as string
}

// Exported so stopRendererAppForTests can wipe recording state between tests.
export const resetRecordingState = (): void => {
  void recorderState.streamingCapture?.cancel().catch(() => {})
  recorderState.mediaRecorder = null
  recorderState.mediaStream = null
  recorderState.streamingCapture = null
  recorderState.streamingSessionId = null
  recorderState.lastHandledStreamingStopSessionId = null
  recorderState.chunks = []
  recorderState.shouldPersistOnStop = true
  recorderState.startedAt = ''
}

// ---------------------------------------------------------------------------
// State slice — only the fields that recording functions read or write.
// ---------------------------------------------------------------------------
export type RecordingMutableState = {
  settings: Settings | null
  apiKeyStatus: ApiKeyStatusSnapshot
  audioInputSources: AudioInputSource[]
  audioSourceHint: string
  hasCommandError: boolean
  pendingActionId: string | null
  pendingStreamingSessionId: string | null
  pendingStreamingCommandToken: number | null
  streamingSessionState: StreamingSessionStateSnapshot
}

// Dependencies injected from renderer-app.tsx.
export type NativeRecordingDeps = {
  state: RecordingMutableState
  addActivity: (message: string, tone?: ActivityItem['tone']) => void
  addTerminalActivity: (message: string, tone?: ActivityItem['tone']) => void
  addToast: (message: string, tone?: ActivityItem['tone']) => void
  logError: (event: string, error: unknown, context?: Record<string, unknown>) => void
  // Called after state mutations that need a React re-render (replaces refreshStatus/refreshCommandButtons).
  onStateChange: () => void
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const INITIAL_RECORDING_OUTCOME_POLL = {
  attempts: 8,
  delayMs: 600
} as const

const FOLLOW_UP_RECORDING_OUTCOME_POLL = {
  attempts: 24,
  delayMs: 1000
} as const

// Recording cues should play for global shortcuts even when another app is focused.
const playRecordingCue = (event: Parameters<typeof window.speechToTextApi.playSound>[0]): void => {
  void window.speechToTextApi.playSound(event)
}

export const isNativeRecording = (): boolean => recorderState.mediaRecorder !== null || recorderState.streamingCapture !== null

const pickRecordingMimeType = (): string | undefined => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return undefined
}

const cleanupRecorderResources = (): void => {
  recorderState.mediaRecorder = null
  if (recorderState.mediaStream) {
    for (const track of recorderState.mediaStream.getTracks()) {
      track.stop()
    }
  }
  recorderState.mediaStream = null
  recorderState.streamingCapture = null
  recorderState.streamingSessionId = null
  recorderState.chunks = []
  recorderState.shouldPersistOnStop = true
  recorderState.startedAt = ''
}

const buildAudioTrackConstraints = (settings: Settings, selectedDeviceId?: string): MediaTrackConstraints => ({
  ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
  sampleRate: { ideal: settings.recording.sampleRateHz },
  channelCount: { ideal: settings.recording.channels }
})

const buildGroqBrowserVadTrackConstraints = (
  _settings: Settings,
  selectedDeviceId?: string
): MediaTrackConstraints => ({
  ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
  // Keep the Groq browser-VAD path on the same plain 16 kHz mono stream
  // shape used by Epicenter instead of inheriting arbitrary app recording
  // settings that can perturb MicVAD confidence on follow-up utterances.
  sampleRate: { ideal: 16_000 },
  channelCount: { ideal: 1 }
})

const createStreamingAudioSink = (sessionId: string) => ({
  pushStreamingAudioFrameBatch: (batch: Omit<StreamingAudioFrameBatch, 'sessionId'>): Promise<void> =>
    window.speechToTextApi.pushStreamingAudioFrameBatch({
      ...batch,
      sessionId
    })
})

const createGroqBrowserVadSink = (sessionId: string): GroqBrowserVadSink => ({
  pushStreamingAudioUtteranceChunk: async (chunk: Omit<StreamingAudioUtteranceChunk, 'sessionId'>): Promise<void> => {
    const api = window.speechToTextApi
    if (!api) {
      throw new Error('speechToTextApi bridge is not available.')
    }
    await api.pushStreamingAudioUtteranceChunk({
      ...chunk,
      sessionId
    })
  }
})

const resolveStreamingProvider = (
  state: RecordingMutableState,
  sessionId: string
): StreamingSessionStateSnapshot['provider'] => {
  const snapshotProvider =
    state.streamingSessionState.sessionId === sessionId
      ? state.streamingSessionState.provider
      : null
  const settingsProvider = state.settings?.processing.streaming.provider ?? null

  if (snapshotProvider && settingsProvider && snapshotProvider !== settingsProvider) {
    throw new Error(`Streaming provider mismatch for session ${sessionId}.`)
  }

  return snapshotProvider ?? settingsProvider
}

// ---------------------------------------------------------------------------
// Audio source discovery
// ---------------------------------------------------------------------------

export const dedupeAudioSources = (sources: AudioInputSource[]): AudioInputSource[] => {
  const unique = new Map<string, AudioInputSource>()
  for (const source of sources) {
    const id = source.id.trim()
    const label = source.label.trim()
    if (id.length === 0 || label.length === 0) {
      continue
    }
    if (!unique.has(id)) {
      unique.set(id, { id, label })
    }
  }
  return [...unique.values()]
}

export const getBrowserAudioInputSources = async (): Promise<AudioInputSource[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }

  try {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch {
      // Continue with enumerateDevices; labels may be unavailable without permission.
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    let unnamedCount = 0
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => {
        const id = device.deviceId.trim()
        if (id.length === 0) {
          return null
        }
        const label = device.label.trim()
        if (label.length > 0) {
          return { id, label }
        }
        unnamedCount += 1
        return { id, label: `Microphone ${unnamedCount}` }
      })
      .filter((source): source is AudioInputSource => source !== null)
  } catch {
    return []
  }
}

// Merge main-process and browser sources, dedupe, and update state.
export const refreshAudioInputSources = async (deps: NativeRecordingDeps, announce = false): Promise<void> => {
  const { state, addToast } = deps
  const mainSources = await window.speechToTextApi.getAudioInputSources()
  const browserSources = await getBrowserAudioInputSources()
  const merged = dedupeAudioSources([SYSTEM_DEFAULT_AUDIO_SOURCE, ...mainSources, ...browserSources])
  state.audioInputSources = merged.length > 0 ? merged : [SYSTEM_DEFAULT_AUDIO_SOURCE]

  if (state.audioInputSources.length <= 1) {
    state.audioSourceHint =
      'No named microphone sources were discovered. Recording still uses System Default. Grant microphone permission, then click Refresh.'
  } else {
    state.audioSourceHint = `Detected ${state.audioInputSources.length - 1} selectable microphone source(s).`
  }

  if (announce) {
    addToast(state.audioSourceHint, 'info')
  }
}

// ---------------------------------------------------------------------------
// Recording lifecycle
// ---------------------------------------------------------------------------

export const resolveSuccessfulRecordingMessage = (
  record: HistoryRecordSnapshot,
  selectedSource: Settings['output']['selectedTextSource']
): string => {
  const transcript = record.transcriptText?.trim() ?? ''
  const transformed = record.transformedText?.trim() ?? ''

  if (selectedSource === 'transformed' && transformed.length > 0) {
    return transformed
  }
  if (selectedSource === 'transcript' && transcript.length > 0) {
    return transcript
  }
  if (transformed.length > 0) {
    return transformed
  }
  if (transcript.length > 0) {
    return transcript
  }
  return 'Transcription complete.'
}

type RecordingOutcomePollPhase = {
  attempts: number
  delayMs: number
}

export type PollRecordingOutcomeOptions = {
  initialPhase?: RecordingOutcomePollPhase
  followUpPhase?: RecordingOutcomePollPhase
}

const resolvePollPhase = (
  phase: RecordingOutcomePollPhase | undefined,
  fallback: RecordingOutcomePollPhase
): RecordingOutcomePollPhase => ({
  attempts: phase?.attempts ?? fallback.attempts,
  delayMs: phase?.delayMs ?? fallback.delayMs
})

const appendTerminalRecordingOutcome = (deps: NativeRecordingDeps, record: HistoryRecordSnapshot): void => {
  const { addTerminalActivity, addToast } = deps
  if (record.terminalStatus === 'succeeded') {
    const selectedSource = deps.state.settings?.output.selectedTextSource ?? 'transformed'
    addTerminalActivity(resolveSuccessfulRecordingMessage(record, selectedSource), 'success')
    addToast('Transcription complete.', 'success')
    return
  }

  const detail = formatFailureFeedback({
    terminalStatus: record.terminalStatus,
    failureDetail: record.failureDetail,
    failureCategory: record.failureCategory
  })
  addTerminalActivity(detail, 'error')
  addToast(detail, 'error')
}

const pollForRecordingHistoryMatch = async (
  deps: NativeRecordingDeps,
  capturedAt: string,
  phase: RecordingOutcomePollPhase
): Promise<{ kind: 'match'; record: HistoryRecordSnapshot } | { kind: 'missing' } | { kind: 'error' }> => {
  const { addToast, logError } = deps
  for (let attempt = 0; attempt < phase.attempts; attempt += 1) {
    try {
      const records = await window.speechToTextApi.getHistory()
      const match = records.find((record) => record.capturedAt === capturedAt)
      if (match) {
        return { kind: 'match', record: match }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown history retrieval error'
      logError('renderer.history_refresh_failed', error)
      addToast(`History refresh failed: ${message}`, 'error')
      return { kind: 'error' }
    }

    if (attempt < phase.attempts - 1) {
      await sleep(phase.delayMs)
    }
  }
  return { kind: 'missing' }
}

// Exported for focused regression coverage of terminal-activity projection behavior.
export const pollRecordingOutcome = async (
  deps: NativeRecordingDeps,
  capturedAt: string,
  options?: PollRecordingOutcomeOptions
): Promise<void> => {
  const { addToast } = deps
  const initialPhase = resolvePollPhase(options?.initialPhase, INITIAL_RECORDING_OUTCOME_POLL)
  const followUpPhase = resolvePollPhase(options?.followUpPhase, FOLLOW_UP_RECORDING_OUTCOME_POLL)

  const initialMatch = await pollForRecordingHistoryMatch(deps, capturedAt, initialPhase)
  if (initialMatch.kind === 'match') {
    appendTerminalRecordingOutcome(deps, initialMatch.record)
    return
  }
  if (initialMatch.kind === 'error') {
    return
  }

  addToast('Recording submitted. Terminal result has not appeared yet.', 'info')

  const followUpMatch = await pollForRecordingHistoryMatch(deps, capturedAt, followUpPhase)
  if (followUpMatch.kind === 'match') {
    appendTerminalRecordingOutcome(deps, followUpMatch.record)
  }
}

export const startNativeRecording = async (
  deps: NativeRecordingDeps,
  preferredDeviceId?: string,
  streamingSessionId?: string
): Promise<void> => {
  const { state, addToast } = deps
  if (isNativeRecording()) {
    throw new Error('Recording is already in progress.')
  }
  if (!state.settings) {
    throw new Error('Settings are not loaded yet.')
  }
  const isStreamingMode = state.settings.processing.mode === 'streaming'
  if (state.settings.recording.method !== 'cpal') {
    throw new Error(`Recording method ${state.settings.recording.method} is not supported yet.`)
  }
  if (!isStreamingMode) {
    const provider = state.settings.transcription.provider
    if (!state.apiKeyStatus[provider]) {
      const providerLabel = provider === 'groq' ? 'Groq' : 'ElevenLabs'
      throw new Error(`Missing ${providerLabel} API key. Add it in Settings > Speech-to-Text.`)
    }
  }
  if (!isStreamingMode && isTransformedOutputRecordingBlocked(state.settings, state.apiKeyStatus)) {
    throw new Error('Missing Google API key. Add it in Settings > LLM Transformation, or switch output mode to Transcript.')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This environment does not support microphone recording.')
  }

  const selectedDeviceId = resolveRecordingDeviceId({
    preferredDeviceId,
    configuredDeviceId: state.settings.recording.device,
    configuredDetectedAudioSource: state.settings.recording.detectedAudioSource,
    audioInputSources: state.audioInputSources
  })
  const fallbackWarning = resolveRecordingDeviceFallbackWarning({
    configuredDeviceId: state.settings.recording.device,
    resolvedDeviceId: selectedDeviceId
  })
  if (fallbackWarning) {
    addToast(fallbackWarning, 'info')
  }
  const constraints: MediaStreamConstraints = {
    audio: buildAudioTrackConstraints(state.settings, selectedDeviceId)
  }

  if (isStreamingMode) {
    if (!streamingSessionId) {
      throw new Error('Streaming live capture requires a sessionId.')
    }

    recorderState.streamingSessionId = streamingSessionId
    recorderState.lastHandledStreamingStopSessionId = null
    const streamingProvider = resolveStreamingProvider(state, streamingSessionId)
    try {
      const onFatalError = (error: unknown): void => {
        const message = error instanceof Error ? error.message : 'Unknown streaming capture error'
        const sessionId = recorderState.streamingSessionId ?? state.streamingSessionState.sessionId
        deps.logError('renderer.streaming_capture_failed', error)
        recorderState.streamingCapture = null
        state.hasCommandError = true
        state.pendingStreamingSessionId = null
        state.pendingStreamingCommandToken = null
        deps.addToast(`Streaming capture failed: ${message}`, 'error')
        deps.onStateChange()
        if (!sessionId) {
          deps.logError('renderer.streaming_capture_failed_missing_session', error)
          return
        }
        void window.speechToTextApi.stopStreamingSession({
          sessionId,
          reason: 'fatal_error'
        }).catch((stopError) => {
          deps.logError('renderer.streaming_capture_failed_stop_cleanup', stopError)
        })
      }

      recorderState.streamingCapture = streamingProvider === 'groq_whisper_large_v3_turbo'
        ? await startGroqBrowserVadCapture({
            sessionId: streamingSessionId,
            deviceConstraints: buildGroqBrowserVadTrackConstraints(state.settings, selectedDeviceId),
            sink: createGroqBrowserVadSink(streamingSessionId),
            onFatalError,
            onBackpressureStateChange: ({ paused, durationMs }) => {
              if (paused) {
                deps.addActivity('Groq upload backlog detected. Pausing utterance delivery until the queue drains.', 'info')
                deps.addToast('Groq upload backlog detected. Live dictation is waiting for uploads.', 'info')
                return
              }

              deps.addActivity(
                `Groq upload backlog cleared${typeof durationMs === 'number' ? ` after ${Math.round(durationMs)} ms` : ''}.`,
                'info'
              )
            }
          })
        : await startStreamingLiveCapture({
            deviceConstraints: constraints.audio as MediaTrackConstraints,
            requestedSampleRateHz: state.settings.recording.sampleRateHz,
            channels: state.settings.recording.channels,
            sink: createStreamingAudioSink(streamingSessionId),
            onFatalError
          })
    } catch (error) {
      recorderState.streamingSessionId = null
      throw error
    }
    return
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
  const preferredMimeType = pickRecordingMimeType()
  const mediaRecorder = preferredMimeType ? new MediaRecorder(mediaStream, { mimeType: preferredMimeType }) : new MediaRecorder(mediaStream)

  recorderState.mediaRecorder = mediaRecorder
  recorderState.mediaStream = mediaStream
  recorderState.chunks = []
  recorderState.shouldPersistOnStop = true
  recorderState.startedAt = new Date().toISOString()

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      recorderState.chunks.push(event.data)
    }
  })

  mediaRecorder.start()
}

export const stopNativeRecording = async (deps: NativeRecordingDeps): Promise<void> => {
  if (recorderState.streamingCapture) {
    const streamingCapture = recorderState.streamingCapture
    cleanupRecorderResources()
    await streamingCapture.stop('user_stop')
    return
  }

  const mediaRecorder = recorderState.mediaRecorder
  if (!mediaRecorder) {
    return
  }
  const capturedAt = recorderState.startedAt || new Date().toISOString()

  const capturePromise = new Promise<void>((resolve, reject) => {
    mediaRecorder.addEventListener(
      'stop',
      async () => {
        try {
          let submitted = false
          if (recorderState.shouldPersistOnStop && recorderState.chunks.length > 0) {
            const blob = new Blob(recorderState.chunks, { type: mediaRecorder.mimeType || 'audio/webm' })
            const data = new Uint8Array(await blob.arrayBuffer())
            await window.speechToTextApi.submitRecordedAudio({
              data,
              mimeType: blob.type || 'audio/webm',
              capturedAt
            })
            submitted = true
          }
          cleanupRecorderResources()
          if (submitted) {
            void pollRecordingOutcome(deps, capturedAt)
          }
          resolve()
        } catch (error) {
          cleanupRecorderResources()
          reject(error)
        }
      },
      { once: true }
    )

    mediaRecorder.addEventListener(
      'error',
      () => {
        cleanupRecorderResources()
        reject(new Error('Native recording failed to stop cleanly.'))
      },
      { once: true }
    )
  })

  mediaRecorder.stop()
  await capturePromise
}

export const cancelNativeRecording = async (deps: NativeRecordingDeps): Promise<void> => {
  if (recorderState.streamingCapture) {
    const streamingCapture = recorderState.streamingCapture
    cleanupRecorderResources()
    await streamingCapture.cancel()
    return
  }

  if (!recorderState.mediaRecorder) {
    return
  }
  recorderState.shouldPersistOnStop = false
  await stopNativeRecording(deps)
}

const notifyIdleRecordingCommand = (deps: NativeRecordingDeps): void => {
  deps.addToast('Recording is not in progress.', 'info')
}

const resolveActiveStreamingSessionId = (state: RecordingMutableState): string | null =>
  recorderState.streamingSessionId ?? state.streamingSessionState.sessionId

const isMatchingStreamingSession = (state: RecordingMutableState, sessionId: string): boolean =>
  resolveActiveStreamingSessionId(state) === sessionId

export const handleStreamingSessionStateUpdate = async (
  deps: NativeRecordingDeps,
  snapshot: StreamingSessionStateSnapshot
): Promise<void> => {
  if (!recorderState.streamingCapture) {
    return
  }
  if (!snapshot.sessionId) {
    return
  }
  if (!isMatchingStreamingSession(deps.state, snapshot.sessionId)) {
    return
  }

  // Starting/active/stopping are main-runtime lifecycle states only. Renderer-side
  // capture stays alive until a terminal state arrives or the user explicitly
  // triggers stop/cancel through the normal recording command path.
  if (snapshot.state !== 'ended' && snapshot.state !== 'failed') {
    return
  }

  const streamingCapture = recorderState.streamingCapture
  cleanupRecorderResources()

  if (snapshot.state === 'failed' || snapshot.reason === 'fatal_error') {
    await streamingCapture.stop('fatal_error')
  } else if (snapshot.reason === 'user_cancel') {
    await streamingCapture.cancel()
  } else {
    await streamingCapture.stop(snapshot.reason ?? 'user_stop')
  }

  if (snapshot.state === 'failed') {
    deps.state.hasCommandError = true
    deps.onStateChange()
    return
  }
}

export const handleRecordingCommandDispatch = async (deps: NativeRecordingDeps, dispatch: RecordingCommandDispatch): Promise<void> => {
  const { state, addToast, logError, onStateChange } = deps
  if ('kind' in dispatch) {
    if (dispatch.kind === 'streaming_start') {
      const canStartSession =
        state.streamingSessionState.sessionId === null ||
        (state.streamingSessionState.sessionId === dispatch.sessionId &&
          (state.streamingSessionState.state === 'starting' || state.streamingSessionState.state === 'active'))
      if (!canStartSession) {
        return
      }

      try {
        if (isNativeRecording()) {
          return
        }

        await startNativeRecording(deps, dispatch.preferredDeviceId, dispatch.sessionId)
        playRecordingCue('recording_started')
        state.hasCommandError = false
        addToast('Recording started.', 'success')
      } catch (error) {
        recorderState.streamingSessionId = null
        logError('renderer.streaming_command_failed', error, {
          kind: dispatch.kind
        })
        state.hasCommandError = true
        const message = error instanceof Error ? error.message : 'Unknown recording error'
        addToast(`${dispatch.kind} failed: ${message}`, 'error')
      } finally {
        onStateChange()
      }
      return
    }

    const currentSessionId = resolveActiveStreamingSessionId(deps.state)
    if (currentSessionId !== dispatch.sessionId) {
      return
    }
    if (recorderState.lastHandledStreamingStopSessionId === dispatch.sessionId) {
      return
    }

    let shouldAcknowledge = true
    try {
      if (isNativeRecording()) {
        if (dispatch.reason === 'user_stop') {
          await stopNativeRecording(deps)
          playRecordingCue('recording_stopped')
          addToast('Recording stopped.', 'success')
        } else {
          await cancelNativeRecording(deps)
          if (dispatch.reason === 'user_cancel') {
            playRecordingCue('recording_cancelled')
            addToast('Recording cancelled.', 'info')
          }
        }
      }

      state.hasCommandError = false
    } catch (error) {
      shouldAcknowledge = false
      logError('renderer.streaming_command_failed', error, {
        kind: dispatch.kind,
        reason: dispatch.reason
      })
      state.hasCommandError = true
      const message = error instanceof Error ? error.message : 'Unknown recording error'
      addToast(`${dispatch.kind} failed: ${message}`, 'error')
    } finally {
      if (shouldAcknowledge) {
        recorderState.lastHandledStreamingStopSessionId = dispatch.sessionId
        void acknowledgeStreamingRendererStop(logError, dispatch.sessionId, dispatch.reason)
      }
      onStateChange()
    }
    return
  }

  const command = dispatch.command
  try {
    if (command === 'toggleRecording') {
      if (isNativeRecording()) {
        await stopNativeRecording(deps)
        playRecordingCue('recording_stopped')
        addToast(
          state.settings?.processing.mode === 'streaming'
            ? 'Recording stopped.'
            : 'Recording stopped. Capture queued for transcription.',
          'success'
        )
      } else {
        await startNativeRecording(deps, dispatch.preferredDeviceId)
        playRecordingCue('recording_started')
        addToast('Recording started.', 'success')
      }
      state.hasCommandError = false
      onStateChange()
      return
    }

    if (command === 'cancelRecording') {
      if (!isNativeRecording()) {
        notifyIdleRecordingCommand(deps)
        return
      }
      await cancelNativeRecording(deps)
      state.hasCommandError = false
      playRecordingCue('recording_cancelled')
      addToast('Recording cancelled.', 'info')
      onStateChange()
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    logError('renderer.recording_command_failed', error, { command })
    state.hasCommandError = true
    addToast(`${command} failed: ${message}`, 'error')
    onStateChange()
  }
}

const acknowledgeStreamingRendererStop = async (
  logError: NativeRecordingDeps['logError'],
  sessionId: string,
  reason: RendererInitiatedStreamingStopReason
): Promise<void> => {
  try {
    await window.speechToTextApi.ackStreamingRendererStop({
      sessionId,
      reason
    })
  } catch (error) {
    logError('renderer.streaming_renderer_stop_ack_failed', error, {
      sessionId,
      reason
    })
  }
}
