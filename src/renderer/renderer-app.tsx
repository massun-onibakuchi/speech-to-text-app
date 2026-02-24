/*
Where: src/renderer/renderer-app.tsx
What: React-owned renderer app orchestration for Home + Settings surfaces.
Why: Remove legacy string-template shell rendering while preserving behavior and selector contracts.

File size note: This file intentionally exceeds the 600 LOC policy. It covers state, IPC wiring,
settings save/autosave, native recording, and the AppShell JSX tree. Splitting it requires
refactoring AppShell to receive ~30 callbacks as explicit props (currently closed over) before
sub-modules can be extracted without circular imports. That work is tracked in Phase 6 of
docs/tsx-migration-completion-work-plan.md with a clear extraction plan.
*/

import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import { logStructured } from '../shared/error-logging'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type {
  ApiKeyProvider,
  ApiKeyStatusSnapshot,
  AudioInputSource,
  CompositeTransformResult,
  HotkeyErrorNotification,
  RecordingCommand,
  RecordingCommandDispatch
} from '../shared/ipc'
import { appendActivityItem, type ActivityItem } from './activity-feed'
import { resolveTransformBlockedMessage } from './blocked-control'
import { formatFailureFeedback } from './failure-feedback'
import { HomeReact } from './home-react'
import { applyHotkeyErrorNotification } from './hotkey-error'
import { resolveDetectedAudioSource, resolveRecordingDeviceFallbackWarning, resolveRecordingDeviceId } from './recording-device'
import { SettingsApiKeysReact } from './settings-api-keys-react'
import { SettingsEndpointOverridesReact } from './settings-endpoint-overrides-react'
import { SettingsOutputReact } from './settings-output-react'
import { SettingsRecordingReact } from './settings-recording-react'
import { SettingsSaveReact } from './settings-save-react'
import { SettingsShortcutEditorReact } from './settings-shortcut-editor-react'
import { SettingsShortcutsReact, type ShortcutBinding } from './settings-shortcuts-react'
import { SettingsTransformationReact } from './settings-transformation-react'
import { ShellChromeReact } from './shell-chrome-react'
import { type SettingsValidationErrors, validateSettingsFormInput } from './settings-validation'

type AppPage = 'home' | 'settings'
type StaggerStyle = CSSProperties & { '--delay': string }

interface ToastItem {
  id: number
  message: string
  tone: ActivityItem['tone']
}

interface AppShellProps {
  state: typeof state
  onDismissToast: (toastId: number) => void
}

let app: HTMLDivElement | null = null
let appRoot: Root | null = null
let unlistenCompositeTransformStatus: (() => void) | null = null
let unlistenRecordingCommand: (() => void) | null = null
let unlistenHotkeyError: (() => void) | null = null
const state = {
  currentPage: 'home' as AppPage,
  ping: 'pong',
  settings: null as Settings | null,
  apiKeyStatus: {
    groq: false,
    elevenlabs: false,
    google: false
  } as ApiKeyStatusSnapshot,
  apiKeySaveStatus: {
    groq: '',
    elevenlabs: '',
    google: ''
  } as Record<ApiKeyProvider, string>,
  apiKeyTestStatus: {
    groq: '',
    elevenlabs: '',
    google: ''
  } as Record<ApiKeyProvider, string>,
  apiKeysSaveMessage: '',
  activity: [] as ActivityItem[],
  pendingActionId: null as string | null,
  activityCounter: 0,
  toasts: [] as ToastItem[],
  toastCounter: 0,
  toastTimers: new Map<number, ReturnType<typeof setTimeout>>(),
  lastTransformSummary: 'No transformation run yet.',
  settingsSaveMessage: '',
  audioInputSources: [] as AudioInputSource[],
  audioSourceHint: '',
  hasCommandError: false,
  settingsValidationErrors: {} as SettingsValidationErrors,
  persistedSettings: null as Settings | null,
  autosaveTimer: null as ReturnType<typeof setTimeout> | null,
  autosaveGeneration: 0
}

const recorderState = {
  mediaRecorder: null as MediaRecorder | null,
  mediaStream: null as MediaStream | null,
  chunks: [] as BlobPart[],
  shouldPersistOnStop: true,
  startedAt: '' as string
}

const NON_SECRET_AUTOSAVE_DEBOUNCE_MS = 450
const HOME_API_KEY_STATUS_REFRESH_ATTEMPTS = 3
const HOME_API_KEY_STATUS_REFRESH_DELAY_MS = 250

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const logRendererError = (event: string, error: unknown, context?: Record<string, unknown>): void => {
  logStructured({
    level: 'error',
    scope: 'renderer',
    event,
    error,
    context
  })
}

const addActivity = (message: string, tone: ActivityItem['tone'] = 'info'): void => {
  state.activity = appendActivityItem(state.activity, {
    id: ++state.activityCounter,
    message,
    tone,
    createdAt: new Date().toLocaleTimeString()
  })
}

const dismissToast = (toastId: number): void => {
  const timer = state.toastTimers.get(toastId)
  if (timer !== undefined) {
    clearTimeout(timer)
    state.toastTimers.delete(toastId)
  }
  state.toasts = state.toasts.filter((toast) => toast.id !== toastId)
}

const addToast = (message: string, tone: ActivityItem['tone'] = 'info'): void => {
  const toast: ToastItem = {
    id: ++state.toastCounter,
    message,
    tone
  }
  state.toasts = [...state.toasts, toast]
  if (state.toasts.length > 4) {
    const overflow = state.toasts.splice(0, state.toasts.length - 4)
    for (const removed of overflow) {
      const timer = state.toastTimers.get(removed.id)
      if (timer !== undefined) {
        clearTimeout(timer)
        state.toastTimers.delete(removed.id)
      }
    }
  }
  const timer = setTimeout(() => {
    dismissToast(toast.id)
    rerenderShellFromState()
  }, 6000)
  state.toastTimers.set(toast.id, timer)
  rerenderShellFromState()
}

const playSoundIfFocused = (event: Parameters<typeof window.speechToTextApi.playSound>[0]): void => {
  if (!document.hasFocus()) {
    return
  }
  void window.speechToTextApi.playSound(event)
}

const setSettingsValidationErrors = (errors: SettingsValidationErrors): void => {
  state.settingsValidationErrors = errors
  rerenderShellFromState()
}

const setSettingsSaveMessage = (message: string): void => {
  state.settingsSaveMessage = message
  rerenderShellFromState()
}

const clearAutosaveTimer = (): void => {
  if (state.autosaveTimer === null) {
    return
  }
  clearTimeout(state.autosaveTimer)
  state.autosaveTimer = null
}

const invalidatePendingAutosave = (): void => {
  clearAutosaveTimer()
  state.autosaveGeneration += 1
}

const settingsEquals = (left: Settings, right: Settings): boolean => JSON.stringify(left) === JSON.stringify(right)

const runNonSecretAutosave = async (generation: number, nextSettings: Settings): Promise<void> => {
  if (state.persistedSettings && settingsEquals(nextSettings, state.persistedSettings)) {
    return
  }
  try {
    const saved = await window.speechToTextApi.setSettings(nextSettings)
    if (generation !== state.autosaveGeneration) {
      return
    }
    state.settings = saved
    state.persistedSettings = structuredClone(saved)
    rerenderShellFromState()
    setSettingsSaveMessage('Settings autosaved.')
  } catch (error) {
    if (generation !== state.autosaveGeneration) {
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown autosave error'
    logRendererError('renderer.settings_autosave_failed', error)
    const rollback = state.persistedSettings ? structuredClone(state.persistedSettings) : null
    if (rollback) {
      state.settings = rollback
      state.currentPage = 'settings'
      rerenderShellFromState()
    }
    setSettingsSaveMessage(`Autosave failed: ${message}. Reverted unsaved changes.`)
    addToast(`Autosave failed: ${message}`, 'error')
  }
}

const scheduleNonSecretAutosave = (): void => {
  if (!state.settings) {
    return
  }
  clearAutosaveTimer()
  const generation = ++state.autosaveGeneration
  const snapshot = structuredClone(state.settings)
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null
    void runNonSecretAutosave(generation, snapshot)
  }, NON_SECRET_AUTOSAVE_DEBOUNCE_MS)
}

const applyNonSecretAutosavePatch = (updater: (current: Settings) => Settings): void => {
  if (!state.settings) {
    return
  }
  state.settings = updater(state.settings)
  scheduleNonSecretAutosave()
  rerenderShellFromState()
}

const resolveShortcutBindings = (settings: Settings): Settings['shortcuts'] => ({
  ...DEFAULT_SETTINGS.shortcuts,
  ...settings.shortcuts
})

const resolveTransformationPreset = (settings: Settings, presetId: string) =>
  settings.transformation.presets.find((preset) => preset.id === presetId) ?? settings.transformation.presets[0]

const buildShortcutContract = (settings: Settings): ShortcutBinding[] => {
  const shortcuts = resolveShortcutBindings(settings)
  return [
    { action: 'Start recording', combo: shortcuts.startRecording },
    { action: 'Stop recording', combo: shortcuts.stopRecording },
    { action: 'Toggle recording', combo: shortcuts.toggleRecording },
    { action: 'Cancel recording', combo: shortcuts.cancelRecording },
    { action: 'Run transform', combo: shortcuts.runTransform },
    { action: 'Run transform on selection', combo: shortcuts.runTransformOnSelection },
    { action: 'Pick transformation', combo: shortcuts.pickTransformation },
    { action: 'Change transformation default', combo: shortcuts.changeTransformationDefault }
  ]
}

const SYSTEM_DEFAULT_AUDIO_SOURCE: AudioInputSource = {
  id: 'system_default',
  label: 'System Default Microphone'
}

const dedupeAudioSources = (sources: AudioInputSource[]): AudioInputSource[] => {
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

const getBrowserAudioInputSources = async (): Promise<AudioInputSource[]> => {
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

const isNativeRecording = (): boolean => recorderState.mediaRecorder !== null

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

const pollRecordingOutcome = async (capturedAt: string): Promise<void> => {
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
      logRendererError('renderer.history_refresh_failed', error)
      addActivity(`History refresh failed: ${message}`, 'error')
      addToast(`History refresh failed: ${message}`, 'error')
      return
    }

    await sleep(600)
  }

  addActivity('Recording submitted. Terminal result has not appeared yet.', 'info')
  addToast('Recording submitted. Terminal result has not appeared yet.', 'info')
}

const startNativeRecording = async (preferredDeviceId?: string): Promise<void> => {
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

const stopNativeRecording = async (): Promise<void> => {
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
            void pollRecordingOutcome(capturedAt)
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

const cancelNativeRecording = async (): Promise<void> => {
  if (!recorderState.mediaRecorder) {
    return
  }
  recorderState.shouldPersistOnStop = false
  await stopNativeRecording()
}

const handleRecordingCommandDispatch = async (dispatch: RecordingCommandDispatch): Promise<void> => {
  const command = dispatch.command
  try {
    if (command === 'startRecording') {
      await startNativeRecording(dispatch.preferredDeviceId)
      state.hasCommandError = false
      addActivity('Recording started.', 'success')
      playSoundIfFocused('recording_started')
      addToast('Recording started.', 'success')
      refreshStatus()
      return
    }

    if (command === 'stopRecording') {
      await stopNativeRecording()
      state.hasCommandError = false
      addActivity('Recording captured and queued for transcription.', 'success')
      playSoundIfFocused('recording_stopped')
      addToast('Recording stopped. Capture queued for transcription.', 'success')
      refreshStatus()
      return
    }

    if (command === 'toggleRecording') {
      if (isNativeRecording()) {
        await stopNativeRecording()
        addActivity('Recording captured and queued for transcription.', 'success')
        playSoundIfFocused('recording_stopped')
        addToast('Recording stopped. Capture queued for transcription.', 'success')
      } else {
        await startNativeRecording(dispatch.preferredDeviceId)
        addActivity('Recording started.', 'success')
        playSoundIfFocused('recording_started')
        addToast('Recording started.', 'success')
      }
      state.hasCommandError = false
      refreshStatus()
      return
    }

    if (command === 'cancelRecording') {
      await cancelNativeRecording()
      state.hasCommandError = false
      addActivity('Recording cancelled.', 'info')
      playSoundIfFocused('recording_cancelled')
      addToast('Recording cancelled.', 'info')
      refreshStatus()
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    logRendererError('renderer.recording_command_failed', error, { command })
    state.hasCommandError = true
    addActivity(`${command} failed: ${message}`, 'error')
    addToast(`${command} failed: ${message}`, 'error')
    refreshStatus()
  }
}

const refreshAudioInputSources = async (announce = false): Promise<void> => {
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

const openSettingsRoute = (): void => {
  state.currentPage = 'settings'
  rerenderShellFromState()
}

const navigateToPage = (page: AppPage): void => {
  state.currentPage = page
  rerenderShellFromState()
  if (page === 'home') {
    void refreshApiKeyStatusFromMainWithRetry()
  }
}

const refreshApiKeyStatusFromMain = async (): Promise<void> => {
  try {
    state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
    rerenderShellFromState()
  } catch (error) {
    logRendererError('renderer.api_key_status_refresh_failed', error)
  }
}

const refreshApiKeyStatusFromMainWithRetry = async (): Promise<void> => {
  for (let attempt = 0; attempt < HOME_API_KEY_STATUS_REFRESH_ATTEMPTS; attempt += 1) {
    await refreshApiKeyStatusFromMain()
    if (attempt < HOME_API_KEY_STATUS_REFRESH_ATTEMPTS - 1) {
      await sleep(HOME_API_KEY_STATUS_REFRESH_DELAY_MS)
    }
  }
}

const applyCompositeResult = (result: CompositeTransformResult): void => {
  if (result.status === 'ok') {
    state.hasCommandError = false
    state.lastTransformSummary = `Last transform: success (${new Date().toLocaleTimeString()})`
    addActivity(`Transform complete: ${result.message}`, 'success')
    addToast(`Transform complete: ${result.message}`, 'success')
  } else {
    state.hasCommandError = true
    state.lastTransformSummary = `Last transform: failed (${new Date().toLocaleTimeString()}) - ${result.message}`
    addActivity(`Transform error: ${result.message}`, 'error')
    addToast(`Transform error: ${result.message}`, 'error')
  }
  refreshStatus()
  refreshCommandButtons()
}

const runRecordingCommandAction = async (command: RecordingCommand): Promise<void> => {
  if (state.pendingActionId !== null) {
    return
  }

  state.pendingActionId = `recording:${command}`
  state.hasCommandError = false
  refreshCommandButtons()
  refreshStatus()
  addActivity(`Running ${command}...`)
  try {
    await window.speechToTextApi.runRecordingCommand(command)
    addActivity(`${command} dispatched`, 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    logRendererError('renderer.recording_dispatch_failed', error, { command })
    state.hasCommandError = true
    addActivity(`${command} failed: ${message}`, 'error')
    addToast(`${command} failed: ${message}`, 'error')
  }
  state.pendingActionId = null
  refreshCommandButtons()
  refreshStatus()
}

const runCompositeTransformAction = async (): Promise<void> => {
  if (state.pendingActionId !== null) {
    return
  }
  if (!state.settings) {
    return
  }
  const blockedMessage = resolveTransformBlockedMessage(state.settings, state.apiKeyStatus)
  if (blockedMessage) {
    addActivity(`${blockedMessage.reason} ${blockedMessage.nextStep}`, 'error')
    addToast(`${blockedMessage.reason} ${blockedMessage.nextStep}`, 'error')
    return
  }
  state.pendingActionId = 'transform:composite'
  state.hasCommandError = false
  refreshCommandButtons()
  refreshStatus()
  addActivity('Running clipboard transform...')
  try {
    const result = await window.speechToTextApi.runCompositeTransformFromClipboard()
    applyCompositeResult(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown transform error'
    logRendererError('renderer.run_transform_failed', error)
    state.hasCommandError = true
    addActivity(`Transform failed: ${message}`, 'error')
    addToast(`Transform failed: ${message}`, 'error')
  }
  state.pendingActionId = null
  refreshCommandButtons()
  refreshStatus()
}

const runApiKeyConnectionTest = async (provider: ApiKeyProvider, candidateValue: string): Promise<void> => {
  state.apiKeyTestStatus[provider] = 'Testing connection...'
  rerenderShellFromState()
  try {
    const result = await window.speechToTextApi.testApiKeyConnection(provider, candidateValue)
    state.apiKeyTestStatus[provider] = `${result.status === 'success' ? 'Success' : 'Failed'}: ${result.message}`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API key test error'
    state.apiKeyTestStatus[provider] = `Failed: ${message}`
  }
  rerenderShellFromState()
}

const saveApiKeys = async (values: Record<ApiKeyProvider, string>): Promise<void> => {
  state.apiKeysSaveMessage = ''
  const entries: Array<{ provider: ApiKeyProvider; value: string }> = [
    { provider: 'groq', value: values.groq.trim() },
    { provider: 'elevenlabs', value: values.elevenlabs.trim() },
    { provider: 'google', value: values.google.trim() }
  ]
  const toSave = entries.filter((entry) => entry.value.length > 0)
  if (toSave.length === 0) {
    state.apiKeysSaveMessage = 'Enter at least one API key to save.'
    for (const entry of entries) {
      state.apiKeySaveStatus[entry.provider] = ''
    }
    addToast('Enter at least one API key to save.', 'error')
    rerenderShellFromState()
    return
  }

  try {
    await Promise.all(toSave.map((entry) => window.speechToTextApi.setApiKey(entry.provider, entry.value)))
    state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
    for (const entry of entries) {
      state.apiKeySaveStatus[entry.provider] = toSave.some((saved) => saved.provider === entry.provider) ? 'Saved.' : ''
    }
    state.apiKeysSaveMessage = 'API keys saved.'
    addActivity(`Saved ${toSave.length} API key value(s).`, 'success')
    addToast('API keys saved.', 'success')
    rerenderShellFromState()
    refreshStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API key save error'
    logRendererError('renderer.api_key_save_failed', error)
    for (const entry of entries) {
      if (toSave.some((saved) => saved.provider === entry.provider)) {
        state.apiKeySaveStatus[entry.provider] = `Failed: ${message}`
      }
    }
    state.apiKeysSaveMessage = `Failed to save API keys: ${message}`
    addActivity(`API key save failed: ${message}`, 'error')
    addToast(`API key save failed: ${message}`, 'error')
    rerenderShellFromState()
  }
}

const restoreOutputAndShortcutsDefaults = async (): Promise<void> => {
  if (!state.settings) {
    return
  }
  const restored: Settings = {
    ...state.settings,
    output: structuredClone(DEFAULT_SETTINGS.output),
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts
    }
  }

  try {
    invalidatePendingAutosave()
    const saved = await window.speechToTextApi.setSettings(restored)
    state.settings = saved
    state.persistedSettings = structuredClone(saved)
    rerenderShellFromState()
    setSettingsSaveMessage('Defaults restored.')
    addActivity('Output and shortcut defaults restored.', 'success')
    addToast('Defaults restored.', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown defaults restore error'
    setSettingsSaveMessage(`Failed to restore defaults: ${message}`)
    addActivity(`Defaults restore failed: ${message}`, 'error')
    addToast(`Defaults restore failed: ${message}`, 'error')
  }
}

const setActiveTransformationPreset = (activePresetId: string): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      activePresetId
    }
  }
  rerenderShellFromState()
}

const setDefaultTransformationPreset = (defaultPresetId: string): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      defaultPresetId
    }
  }
  rerenderShellFromState()
}

const patchActiveTransformationPresetDraft = (
  patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
): void => {
  if (!state.settings) {
    return
  }
  const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      presets: state.settings.transformation.presets.map((preset) => (preset.id === activePreset.id ? { ...preset, ...patch } : preset))
    }
  }
}

const patchTranscriptionBaseUrlDraft = (value: string): void => {
  if (!state.settings) {
    return
  }
  const provider = state.settings.transcription.provider
  state.settings = {
    ...state.settings,
    transcription: {
      ...state.settings.transcription,
      baseUrlOverrides: {
        ...state.settings.transcription.baseUrlOverrides,
        [provider]: value
      }
    }
  }
}

const patchTransformationBaseUrlDraft = (value: string): void => {
  if (!state.settings) {
    return
  }
  const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      baseUrlOverrides: {
        ...state.settings.transformation.baseUrlOverrides,
        [activePreset.provider]: value
      }
    }
  }
}

const patchShortcutDraft = (
  key:
    | 'startRecording'
    | 'stopRecording'
    | 'toggleRecording'
    | 'cancelRecording'
    | 'runTransform'
    | 'runTransformOnSelection'
    | 'pickTransformation'
    | 'changeTransformationDefault',
  value: string
): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    shortcuts: {
      ...state.settings.shortcuts,
      [key]: value
    }
  }
}

const patchRecordingMethodDraft = (method: Settings['recording']['method']): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    recording: {
      ...state.settings.recording,
      method
    }
  }
}

const patchRecordingSampleRateDraft = (sampleRateHz: Settings['recording']['sampleRateHz']): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    recording: {
      ...state.settings.recording,
      sampleRateHz
    }
  }
}

const patchRecordingDeviceDraft = (deviceId: string): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    recording: {
      ...state.settings.recording,
      device: deviceId,
      autoDetectAudioSource: deviceId === 'system_default',
      detectedAudioSource: resolveDetectedAudioSource(deviceId, state.audioInputSources)
    }
  }
}

const addTransformationPreset = (): void => {
  if (!state.settings) {
    return
  }
  const id = `preset-${Date.now()}`
  const newPreset = {
    id,
    name: `Preset ${state.settings.transformation.presets.length + 1}`,
    provider: 'google' as const,
    model: 'gemini-2.5-flash' as const,
    systemPrompt: '',
    userPrompt: '',
    shortcut: resolveShortcutBindings(state.settings).runTransform
  }
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      activePresetId: id,
      presets: [...state.settings.transformation.presets, newPreset]
    }
  }
  rerenderShellFromState()
  setSettingsSaveMessage('Configuration added. Save settings to persist.')
}

const removeTransformationPreset = (activePresetId: string): void => {
  if (!state.settings) {
    return
  }
  const presets = state.settings.transformation.presets
  if (presets.length <= 1) {
    setSettingsSaveMessage('At least one configuration is required.')
    return
  }
  const remaining = presets.filter((preset) => preset.id !== activePresetId)
  const fallbackId = remaining[0].id
  const defaultPresetId =
    state.settings.transformation.defaultPresetId === activePresetId ? fallbackId : state.settings.transformation.defaultPresetId
  state.settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      activePresetId: fallbackId,
      defaultPresetId,
      presets: remaining
    }
  }
  rerenderShellFromState()
  setSettingsSaveMessage('Configuration removed. Save settings to persist.')
}

const saveSettingsFromState = async (): Promise<void> => {
  if (!state.settings) {
    return
  }
  const shortcutDraft = resolveShortcutBindings(state.settings)
  const activePreset = resolveTransformationPreset(state.settings, state.settings.transformation.activePresetId)

  const formValidation = validateSettingsFormInput({
    transcriptionBaseUrlRaw: state.settings.transcription.baseUrlOverrides[state.settings.transcription.provider] ?? '',
    transformationBaseUrlRaw: state.settings.transformation.baseUrlOverrides[activePreset.provider] ?? '',
    presetNameRaw: activePreset.name,
    shortcuts: {
      startRecording: shortcutDraft.startRecording,
      stopRecording: shortcutDraft.stopRecording,
      toggleRecording: shortcutDraft.toggleRecording,
      cancelRecording: shortcutDraft.cancelRecording,
      runTransform: shortcutDraft.runTransform,
      runTransformOnSelection: shortcutDraft.runTransformOnSelection,
      pickTransformation: shortcutDraft.pickTransformation,
      changeTransformationDefault: shortcutDraft.changeTransformationDefault
    }
  })
  setSettingsValidationErrors(formValidation.errors)
  if (Object.keys(formValidation.errors).length > 0) {
    setSettingsSaveMessage('Fix the highlighted validation errors before saving.')
    addToast('Settings validation failed. Fix highlighted fields.', 'error')
    return
  }

  const updatedActivePreset = {
    ...activePreset,
    name: formValidation.normalized.presetName
  }
  const updatedPresets = state.settings.transformation.presets.map((preset) =>
    preset.id === updatedActivePreset.id ? updatedActivePreset : preset
  )

  const nextSettings: Settings = {
    ...state.settings,
    transformation: {
      ...state.settings.transformation,
      baseUrlOverrides: {
        ...state.settings.transformation.baseUrlOverrides,
        [updatedActivePreset.provider]: formValidation.normalized.transformationBaseUrlOverride
      },
      presets: updatedPresets
    },
    transcription: {
      ...state.settings.transcription,
      baseUrlOverrides: {
        ...state.settings.transcription.baseUrlOverrides,
        [state.settings.transcription.provider]: formValidation.normalized.transcriptionBaseUrlOverride
      }
    },
    shortcuts: {
      ...state.settings.shortcuts,
      ...formValidation.normalized.shortcuts
    }
  }

  try {
    invalidatePendingAutosave()
    const saved = await window.speechToTextApi.setSettings(nextSettings)
    state.settings = saved
    state.persistedSettings = structuredClone(saved)
    rerenderShellFromState()
    setSettingsSaveMessage('Settings saved.')
    addActivity('Settings updated.', 'success')
    addToast('Settings saved.', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown settings save error'
    logRendererError('renderer.settings_save_failed', error)
    setSettingsSaveMessage(`Failed to save settings: ${message}`)
    addActivity(`Settings save failed: ${message}`, 'error')
    addToast(`Settings save failed: ${message}`, 'error')
  }
}

const refreshStatus = (): void => {
  rerenderShellFromState()
}

const refreshCommandButtons = (): void => {
  rerenderShellFromState()
}

const handleSettingsEnterSaveKeydown = (event: ReactKeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'Enter' || event.defaultPrevented || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  if (state.currentPage !== 'settings') {
    return
  }
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  if (!target.closest('.settings-form')) {
    return
  }
  if (target instanceof HTMLTextAreaElement) {
    return
  }
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return
  }
  event.preventDefault()
  void saveSettingsFromState()
}

const wireActions = (): void => {
  if (!unlistenCompositeTransformStatus) {
    unlistenCompositeTransformStatus = window.speechToTextApi.onCompositeTransformStatus((result) => {
      applyCompositeResult(result)
    })
  }

  if (!unlistenRecordingCommand) {
    unlistenRecordingCommand = window.speechToTextApi.onRecordingCommand((dispatch) => {
      void handleRecordingCommandDispatch(dispatch)
    })
  }

  if (!unlistenHotkeyError) {
    unlistenHotkeyError = window.speechToTextApi.onHotkeyError((notification: HotkeyErrorNotification) => {
      applyHotkeyErrorNotification(notification, addActivity, addToast)
    })
  }
}

const AppShell = ({ state: uiState, onDismissToast }: AppShellProps) => {
  if (!uiState.settings) {
    return (
      <main className="shell shell-failure">
        <section className="card">
          <p className="eyebrow">Renderer Initialization Error</p>
          <h1>UI failed to initialize</h1>
          <p className="muted">Settings are unavailable.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <ShellChromeReact
        ping={uiState.ping}
        settings={uiState.settings}
        currentPage={uiState.currentPage}
        onNavigate={navigateToPage}
      />
      <section
        className={`grid page-home${uiState.currentPage === 'home' ? '' : ' is-hidden'}`}
        data-page="home"
      >
        <HomeReact
          settings={uiState.settings}
          apiKeyStatus={uiState.apiKeyStatus}
          lastTransformSummary={uiState.lastTransformSummary}
          pendingActionId={uiState.pendingActionId}
          hasCommandError={uiState.hasCommandError}
          isRecording={isNativeRecording()}
          onRunRecordingCommand={(command: RecordingCommand) => {
            void runRecordingCommandAction(command)
          }}
          onRunCompositeTransform={() => {
            void runCompositeTransformAction()
          }}
          onOpenSettings={() => {
            openSettingsRoute()
          }}
        />
      </section>
      <section
        className={`grid page-settings${uiState.currentPage === 'settings' ? '' : ' is-hidden'}`}
        data-page="settings"
        onKeyDown={handleSettingsEnterSaveKeydown}
      >
        <article
          className="card settings"
          data-stagger=""
          style={{ '--delay': '220ms' } as StaggerStyle}
        >
          <div className="panel-head">
            <h2>Settings</h2>
          </div>
          <SettingsApiKeysReact
            apiKeyStatus={uiState.apiKeyStatus}
            apiKeySaveStatus={uiState.apiKeySaveStatus}
            apiKeyTestStatus={uiState.apiKeyTestStatus}
            saveMessage={uiState.apiKeysSaveMessage}
            onTestApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
              await runApiKeyConnectionTest(provider, candidateValue)
            }}
            onSaveApiKeys={async (values: Record<ApiKeyProvider, string>) => {
              await saveApiKeys(values)
            }}
          />
          <section className="settings-form">
            <SettingsRecordingReact
              settings={uiState.settings}
              audioInputSources={uiState.audioInputSources.length > 0 ? uiState.audioInputSources : [SYSTEM_DEFAULT_AUDIO_SOURCE]}
              audioSourceHint={uiState.audioSourceHint}
              onRefreshAudioSources={async () => {
                try {
                  await refreshAudioInputSources(true)
                  rerenderShellFromState()
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Unknown audio source refresh error'
                  addActivity(`Audio source refresh failed: ${message}`, 'error')
                  addToast(`Audio source refresh failed: ${message}`, 'error')
                }
              }}
              onSelectRecordingMethod={(method: Settings['recording']['method']) => {
                patchRecordingMethodDraft(method)
              }}
              onSelectRecordingSampleRate={(sampleRateHz: Settings['recording']['sampleRateHz']) => {
                patchRecordingSampleRateDraft(sampleRateHz)
              }}
              onSelectRecordingDevice={(deviceId: string) => {
                patchRecordingDeviceDraft(deviceId)
              }}
              onSelectTranscriptionProvider={(provider: Settings['transcription']['provider']) => {
                const models = STT_MODEL_ALLOWLIST[provider]
                const selectedModel = models[0]
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  transcription: {
                    ...current.transcription,
                    provider,
                    model: selectedModel
                  }
                }))
              }}
              onSelectTranscriptionModel={(model: Settings['transcription']['model']) => {
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  transcription: {
                    ...current.transcription,
                    model
                  }
                }))
              }}
            />
            <section className="settings-group">
              <SettingsTransformationReact
                settings={uiState.settings}
                presetNameError={uiState.settingsValidationErrors.presetName ?? ''}
                onToggleTransformEnabled={(checked: boolean) => {
                  applyNonSecretAutosavePatch((current) => ({
                    ...current,
                    transformation: {
                      ...current.transformation,
                      enabled: checked
                    }
                  }))
                }}
                onToggleAutoRun={(checked: boolean) => {
                  applyNonSecretAutosavePatch((current) => ({
                    ...current,
                    transformation: {
                      ...current.transformation,
                      autoRunDefaultTransform: checked
                    }
                  }))
                }}
                onSelectActivePreset={(presetId: string) => {
                  setActiveTransformationPreset(presetId)
                }}
                onSelectDefaultPreset={(presetId: string) => {
                  setDefaultTransformationPreset(presetId)
                }}
                onChangeActivePresetDraft={(
                  patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
                ) => {
                  patchActiveTransformationPresetDraft(patch)
                }}
                onRunSelectedPreset={() => {
                  void runCompositeTransformAction()
                }}
                onAddPreset={() => {
                  addTransformationPreset()
                }}
                onRemovePreset={(activePresetId: string) => {
                  removeTransformationPreset(activePresetId)
                }}
              />
              <SettingsEndpointOverridesReact
                settings={uiState.settings}
                transcriptionBaseUrlError={uiState.settingsValidationErrors.transcriptionBaseUrl ?? ''}
                transformationBaseUrlError={uiState.settingsValidationErrors.transformationBaseUrl ?? ''}
                onChangeTranscriptionBaseUrlDraft={(value: string) => {
                  patchTranscriptionBaseUrlDraft(value)
                }}
                onChangeTransformationBaseUrlDraft={(value: string) => {
                  patchTransformationBaseUrlDraft(value)
                }}
                onResetTranscriptionBaseUrlDraft={() => {
                  patchTranscriptionBaseUrlDraft('')
                  setSettingsValidationErrors({
                    ...uiState.settingsValidationErrors,
                    transcriptionBaseUrl: ''
                  })
                }}
                onResetTransformationBaseUrlDraft={() => {
                  patchTransformationBaseUrlDraft('')
                  setSettingsValidationErrors({
                    ...uiState.settingsValidationErrors,
                    transformationBaseUrl: ''
                  })
                }}
              />
              <SettingsShortcutEditorReact
                settings={uiState.settings}
                validationErrors={{
                  startRecording: uiState.settingsValidationErrors.startRecording,
                  stopRecording: uiState.settingsValidationErrors.stopRecording,
                  toggleRecording: uiState.settingsValidationErrors.toggleRecording,
                  cancelRecording: uiState.settingsValidationErrors.cancelRecording,
                  runTransform: uiState.settingsValidationErrors.runTransform,
                  runTransformOnSelection: uiState.settingsValidationErrors.runTransformOnSelection,
                  pickTransformation: uiState.settingsValidationErrors.pickTransformation,
                  changeTransformationDefault: uiState.settingsValidationErrors.changeTransformationDefault
                }}
                onChangeShortcutDraft={(
                  key:
                    | 'startRecording'
                    | 'stopRecording'
                    | 'toggleRecording'
                    | 'cancelRecording'
                    | 'runTransform'
                    | 'runTransformOnSelection'
                    | 'pickTransformation'
                    | 'changeTransformationDefault',
                  value: string
                ) => {
                  patchShortcutDraft(key, value)
                }}
              />
            </section>
            <SettingsOutputReact
              settings={uiState.settings}
              onToggleTranscriptCopy={(checked: boolean) => {
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  output: {
                    ...current.output,
                    transcript: {
                      ...current.output.transcript,
                      copyToClipboard: checked
                    }
                  }
                }))
              }}
              onToggleTranscriptPaste={(checked: boolean) => {
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  output: {
                    ...current.output,
                    transcript: {
                      ...current.output.transcript,
                      pasteAtCursor: checked
                    }
                  }
                }))
              }}
              onToggleTransformedCopy={(checked: boolean) => {
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  output: {
                    ...current.output,
                    transformed: {
                      ...current.output.transformed,
                      copyToClipboard: checked
                    }
                  }
                }))
              }}
              onToggleTransformedPaste={(checked: boolean) => {
                applyNonSecretAutosavePatch((current) => ({
                  ...current,
                  output: {
                    ...current.output,
                    transformed: {
                      ...current.output.transformed,
                      pasteAtCursor: checked
                    }
                  }
                }))
              }}
              onRestoreDefaults={async () => {
                await restoreOutputAndShortcutsDefaults()
              }}
            />
            <SettingsSaveReact
              saveMessage={uiState.settingsSaveMessage}
              onSave={async () => {
                await saveSettingsFromState()
              }}
            />
          </section>
        </article>
        <SettingsShortcutsReact shortcuts={buildShortcutContract(uiState.settings)} />
      </section>
      <ul
        id="toast-layer"
        className="toast-layer"
        aria-live="polite"
        aria-atomic="false"
      >
        {uiState.toasts.map((toast) => (
          <li
            key={toast.id}
            className={`toast-item toast-${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <p className="toast-message">{toast.message}</p>
            <button
              type="button"
              className="toast-dismiss"
              data-toast-dismiss={String(toast.id)}
              aria-label="Dismiss notification"
              onClick={() => {
                onDismissToast(toast.id)
              }}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}

const rerenderShellFromState = (): void => {
  if (!appRoot || !state.settings) {
    return
  }

  appRoot.render(
    <AppShell
      state={state}
      onDismissToast={(toastId: number) => {
        dismissToast(toastId)
        rerenderShellFromState()
      }}
    />
  )
}

const renderInitializationFailure = (message: string): void => {
  if (!appRoot) {
    return
  }

  appRoot.render(
    <main className="shell shell-failure">
      <section className="card">
        <p className="eyebrow">Renderer Initialization Error</p>
        <h1>UI failed to initialize</h1>
        <p className="muted">{message}</p>
      </section>
    </main>
  )
}

const render = async (): Promise<void> => {
  if (!appRoot) {
    return
  }

  addActivity('Renderer booted and waiting for commands.')
  try {
    const [pong, settings, apiKeyStatus] = await Promise.all([
      window.speechToTextApi.ping(),
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getApiKeyStatus()
    ])
    state.ping = pong
    state.settings = settings
    state.persistedSettings = structuredClone(settings)
    state.apiKeyStatus = apiKeyStatus
    await refreshAudioInputSources()

    rerenderShellFromState()
    addActivity('Settings loaded from main process.', 'success')
    wireActions()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown initialization error'
    logRendererError('renderer.initialization_failed', error)
    renderInitializationFailure(message)
    addActivity(`Renderer initialization failed: ${message}`, 'error')
  }
}

export const startRendererApp = (target?: HTMLDivElement): void => {
  app = target ?? document.querySelector<HTMLDivElement>('#app')
  if (!app) {
    return
  }

  if (!appRoot) {
    appRoot = createRoot(app)
  }

  void render()
}

export const stopRendererAppForTests = (): void => {
  clearAutosaveTimer()
  for (const timer of state.toastTimers.values()) {
    clearTimeout(timer)
  }
  state.toastTimers.clear()

  unlistenCompositeTransformStatus?.()
  unlistenCompositeTransformStatus = null
  unlistenRecordingCommand?.()
  unlistenRecordingCommand = null
  unlistenHotkeyError?.()
  unlistenHotkeyError = null
  appRoot?.unmount()
  appRoot = null
  app = null

  state.currentPage = 'home'
  state.ping = 'pong'
  state.settings = null
  state.apiKeyStatus = { groq: false, elevenlabs: false, google: false }
  state.apiKeySaveStatus = { groq: '', elevenlabs: '', google: '' }
  state.apiKeyTestStatus = { groq: '', elevenlabs: '', google: '' }
  state.apiKeysSaveMessage = ''
  state.activity = []
  state.pendingActionId = null
  state.activityCounter = 0
  state.toasts = []
  state.toastCounter = 0
  state.lastTransformSummary = 'No transformation run yet.'
  state.settingsSaveMessage = ''
  state.audioInputSources = []
  state.audioSourceHint = ''
  state.hasCommandError = false
  state.settingsValidationErrors = {}
  state.persistedSettings = null
  state.autosaveGeneration = 0

  recorderState.mediaRecorder = null
  recorderState.mediaStream = null
  recorderState.chunks = []
  recorderState.shouldPersistOnStop = true
  recorderState.startedAt = ''
}
