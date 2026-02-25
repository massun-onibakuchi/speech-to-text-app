/*
Where: src/renderer/native-recording.ts
What: Native (browser MediaRecorder) recording lifecycle and audio-source discovery.
Why: Extracted from renderer-app.tsx (Phase 6) to separate device/recording concerns
     from the orchestration layer. All functions receive a deps object so they remain
     pure with respect to module state other than the local recorderState singleton.
*/

import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, AudioInputSource, RecordingCommandDispatch } from '../shared/ipc'
import { SYSTEM_DEFAULT_AUDIO_SOURCE } from './app-shell-react'
import type { ActivityItem } from './activity-feed'
import { formatFailureFeedback } from './failure-feedback'
import { resolveRecordingDeviceFallbackWarning, resolveRecordingDeviceId } from './recording-device'

// ---------------------------------------------------------------------------
// Local recorder state — module-level singleton, reset via resetRecordingState().
// ---------------------------------------------------------------------------
const recorderState = {
  mediaRecorder: null as MediaRecorder | null,
  mediaStream: null as MediaStream | null,
  chunks: [] as BlobPart[],
  shouldPersistOnStop: true,
  startedAt: '' as string
}

// Exported so stopRendererAppForTests can wipe recording state between tests.
export const resetRecordingState = (): void => {
  recorderState.mediaRecorder = null
  recorderState.mediaStream = null
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
}

// Dependencies injected from renderer-app.tsx.
export type NativeRecordingDeps = {
  state: RecordingMutableState
  addActivity: (message: string, tone?: ActivityItem['tone']) => void
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

// Play a sound only when the app window is focused (avoids sound on background hotkey triggers).
const playSoundIfFocused = (event: Parameters<typeof window.speechToTextApi.playSound>[0]): void => {
  if (!document.hasFocus()) {
    return
  }
  void window.speechToTextApi.playSound(event)
}

export const isNativeRecording = (): boolean => recorderState.mediaRecorder !== null

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
  recorderState.chunks = []
  recorderState.shouldPersistOnStop = true
}

const buildAudioTrackConstraints = (settings: Settings, selectedDeviceId?: string): MediaTrackConstraints => ({
  ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
  sampleRate: { ideal: settings.recording.sampleRateHz },
  channelCount: { ideal: settings.recording.channels }
})

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
  const { state, addActivity, addToast } = deps
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
    addActivity(state.audioSourceHint, 'info')
    addToast(state.audioSourceHint, 'info')
  }
}

// ---------------------------------------------------------------------------
// Recording lifecycle
// ---------------------------------------------------------------------------

const pollRecordingOutcome = async (deps: NativeRecordingDeps, capturedAt: string): Promise<void> => {
  const { addActivity, addToast, logError } = deps
  const attempts = 8
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const records = await window.speechToTextApi.getHistory()
      const match = records.find((record) => record.capturedAt === capturedAt)
      if (match) {
        if (match.terminalStatus === 'succeeded') {
          addActivity('Transcription complete.', 'success')
          addToast('Transcription complete.', 'success')
        } else {
          const detail = formatFailureFeedback({
            terminalStatus: match.terminalStatus,
            failureDetail: match.failureDetail,
            failureCategory: match.failureCategory
          })
          addActivity(detail, 'error')
          addToast(detail, 'error')
        }
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown history retrieval error'
      logError('renderer.history_refresh_failed', error)
      addActivity(`History refresh failed: ${message}`, 'error')
      addToast(`History refresh failed: ${message}`, 'error')
      return
    }

    await sleep(600)
  }

  addActivity('Recording submitted. Terminal result has not appeared yet.', 'info')
  addToast('Recording submitted. Terminal result has not appeared yet.', 'info')
}

export const startNativeRecording = async (deps: NativeRecordingDeps, preferredDeviceId?: string): Promise<void> => {
  const { state, addActivity, addToast } = deps
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This environment does not support microphone recording.')
  }
  if (isNativeRecording()) {
    throw new Error('Recording is already in progress.')
  }
  if (!state.settings) {
    throw new Error('Settings are not loaded yet.')
  }
  if (state.settings.recording.method !== 'cpal') {
    throw new Error(`Recording method ${state.settings.recording.method} is not supported yet.`)
  }
  const provider = state.settings.transcription.provider
  if (!state.apiKeyStatus[provider]) {
    const providerLabel = provider === 'groq' ? 'Groq' : 'ElevenLabs'
    throw new Error(`Missing ${providerLabel} API key. Add it in Settings > Provider API Keys.`)
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
    addActivity(fallbackWarning, 'info')
    addToast(fallbackWarning, 'info')
  }
  const constraints: MediaStreamConstraints = {
    audio: buildAudioTrackConstraints(state.settings, selectedDeviceId)
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
  if (!recorderState.mediaRecorder) {
    return
  }
  recorderState.shouldPersistOnStop = false
  await stopNativeRecording(deps)
}

const notifyIdleRecordingCommand = (deps: NativeRecordingDeps): void => {
  deps.addActivity('Recording is not in progress.', 'info')
  deps.addToast('Recording is not in progress.', 'info')
}

export const handleRecordingCommandDispatch = async (deps: NativeRecordingDeps, dispatch: RecordingCommandDispatch): Promise<void> => {
  const { state, addActivity, addToast, logError, onStateChange } = deps
  const command = dispatch.command
  try {
    if (command === 'startRecording') {
      await startNativeRecording(deps, dispatch.preferredDeviceId)
      state.hasCommandError = false
      addActivity('Recording started.', 'success')
      playSoundIfFocused('recording_started')
      addToast('Recording started.', 'success')
      onStateChange()
      return
    }

    if (command === 'stopRecording') {
      if (!isNativeRecording()) {
        notifyIdleRecordingCommand(deps)
        return
      }
      await stopNativeRecording(deps)
      state.hasCommandError = false
      addActivity('Recording captured and queued for transcription.', 'success')
      playSoundIfFocused('recording_stopped')
      addToast('Recording stopped. Capture queued for transcription.', 'success')
      onStateChange()
      return
    }

    if (command === 'toggleRecording') {
      if (isNativeRecording()) {
        await stopNativeRecording(deps)
        addActivity('Recording captured and queued for transcription.', 'success')
        playSoundIfFocused('recording_stopped')
        addToast('Recording stopped. Capture queued for transcription.', 'success')
      } else {
        await startNativeRecording(deps, dispatch.preferredDeviceId)
        addActivity('Recording started.', 'success')
        playSoundIfFocused('recording_started')
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
      addActivity('Recording cancelled.', 'info')
      playSoundIfFocused('recording_cancelled')
      addToast('Recording cancelled.', 'info')
      onStateChange()
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    logError('renderer.recording_command_failed', error, { command })
    state.hasCommandError = true
    addActivity(`${command} failed: ${message}`, 'error')
    addToast(`${command} failed: ${message}`, 'error')
    onStateChange()
  }
}
