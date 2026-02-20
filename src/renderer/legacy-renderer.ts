/*
Where: src/renderer/legacy-renderer.ts
What: Legacy-owned renderer orchestration plus remaining string-rendered Settings surfaces.
Why: Keep command/event side effects centralized while migrating UI slices to React incrementally.
*/

import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST, type Settings } from '../shared/domain'
import { logStructured } from '../shared/error-logging'
import { createElement } from 'react'
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
import { formatFailureFeedback } from './failure-feedback'
import { resolveTransformBlockedMessage } from './blocked-control'
import { applyHotkeyErrorNotification } from './hotkey-error'
import { HomeReact } from './home-react'
import { resolveDetectedAudioSource, resolveRecordingDeviceFallbackWarning, resolveRecordingDeviceId } from './recording-device'
import { SettingsApiKeysReact } from './settings-api-keys-react'
import { SettingsEndpointOverridesReact } from './settings-endpoint-overrides-react'
import { SettingsOutputReact } from './settings-output-react'
import { SettingsRecordingReact } from './settings-recording-react'
import { SettingsTransformationReact } from './settings-transformation-react'
import { ShellChromeReact } from './shell-chrome-react'
import { SettingsShortcutsReact, type ShortcutBinding } from './settings-shortcuts-react'
import {
  type SettingsValidationErrors,
  validateSettingsFormInput
} from './settings-validation'

let app: HTMLDivElement | null = null
let homeReactRoot: Root | null = null
let settingsApiKeysReactRoot: Root | null = null
let settingsEndpointOverridesReactRoot: Root | null = null
let settingsOutputReactRoot: Root | null = null
let settingsRecordingReactRoot: Root | null = null
let settingsTransformationReactRoot: Root | null = null
let shellChromeReactRoot: Root | null = null
let settingsShortcutsReactRoot: Root | null = null

type AppPage = 'home' | 'settings'
interface ToastItem {
  id: number
  message: string
  tone: ActivityItem['tone']
}

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
  transformStatusListenerAttached: false,
  recordingCommandListenerAttached: false,
  hotkeyErrorListenerAttached: false,
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

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const NON_SECRET_AUTOSAVE_DEBOUNCE_MS = 450

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

const addActivity = (message: string, tone: ActivityItem['tone'] = 'info'): void => {
  state.activity = appendActivityItem(state.activity, {
    id: ++state.activityCounter,
    message,
    tone,
    createdAt: new Date().toLocaleTimeString()
  })
}

const logRendererError = (event: string, error: unknown, context?: Record<string, unknown>): void => {
  logStructured({
    level: 'error',
    scope: 'renderer',
    event,
    error,
    context
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

const renderToasts = (): string =>
  state.toasts
    .map(
      (toast) => `
      <li class="toast-item toast-${toast.tone}" role="${toast.tone === 'error' ? 'alert' : 'status'}">
        <p class="toast-message">${escapeHtml(toast.message)}</p>
        <button type="button" class="toast-dismiss" data-toast-dismiss="${toast.id}" aria-label="Dismiss notification">Dismiss</button>
      </li>
      `
    )
    .join('')

const refreshToasts = (): void => {
  const toastLayer = app?.querySelector<HTMLUListElement>('#toast-layer')
  if (!toastLayer) {
    return
  }
  toastLayer.innerHTML = renderToasts()
  const dismissButtons = toastLayer.querySelectorAll<HTMLButtonElement>('[data-toast-dismiss]')
  for (const button of dismissButtons) {
    button.addEventListener('click', () => {
      const toastId = Number(button.dataset.toastDismiss)
      if (!Number.isFinite(toastId)) {
        return
      }
      dismissToast(toastId)
      refreshToasts()
    })
  }
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
    refreshToasts()
  }, 6000)
  state.toastTimers.set(toast.id, timer)
  refreshToasts()
}

const playSoundIfFocused = (event: Parameters<typeof window.speechToTextApi.playSound>[0]): void => {
  if (!document.hasFocus()) {
    return
  }
  void window.speechToTextApi.playSound(event)
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const checkedAttr = (value: boolean): string => (value ? 'checked' : '')
const renderSettingsFieldError = (field: keyof SettingsValidationErrors): string =>
  escapeHtml(state.settingsValidationErrors[field] ?? '')

const setSettingsValidationErrors = (errors: SettingsValidationErrors): void => {
  state.settingsValidationErrors = errors
  refreshSettingsValidationMessages()
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
    const saveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
    if (saveMessage) {
      saveMessage.textContent = 'Settings autosaved.'
    }
  } catch (error) {
    if (generation !== state.autosaveGeneration) {
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown autosave error'
    logRendererError('renderer.settings_autosave_failed', error)
    const rollback = state.persistedSettings ? structuredClone(state.persistedSettings) : null
    if (rollback) {
      state.settings = rollback
      rerenderShellFromState()
      state.currentPage = 'settings'
      refreshRouteTabs()
    }
    const saveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
    if (saveMessage) {
      saveMessage.textContent = `Autosave failed: ${message}. Reverted unsaved changes.`
    }
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
  // Non-secret autosave boundary is enforced by callers.
  // Do not use this helper for API key/secret-bearing controls.
  state.settings = updater(state.settings)
  scheduleNonSecretAutosave()
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

const renderSettingsPanel = (settings: Settings): string => `
  <article class="card settings" data-stagger style="--delay:220ms">
    <div class="panel-head">
      <h2>Settings</h2>
    </div>
    <div id="settings-api-keys-react-root"></div>
    <form id="settings-form" class="settings-form">
      <div id="settings-recording-react-root"></div>
      <section class="settings-group">
        <div id="settings-transformation-react-root"></div>
        <div id="settings-endpoint-overrides-react-root"></div>
        <label class="text-row">
          <span>Start recording shortcut</span>
          <input id="settings-shortcut-start-recording" type="text" value="${escapeHtml(settings.shortcuts.startRecording ?? DEFAULT_SETTINGS.shortcuts.startRecording)}" />
        </label>
        <p class="field-error" id="settings-error-start-recording">${renderSettingsFieldError('startRecording')}</p>
        <label class="text-row">
          <span>Stop recording shortcut</span>
          <input id="settings-shortcut-stop-recording" type="text" value="${escapeHtml(settings.shortcuts.stopRecording ?? DEFAULT_SETTINGS.shortcuts.stopRecording)}" />
        </label>
        <p class="field-error" id="settings-error-stop-recording">${renderSettingsFieldError('stopRecording')}</p>
        <label class="text-row">
          <span>Toggle recording shortcut</span>
          <input id="settings-shortcut-toggle-recording" type="text" value="${escapeHtml(settings.shortcuts.toggleRecording ?? DEFAULT_SETTINGS.shortcuts.toggleRecording)}" />
        </label>
        <p class="field-error" id="settings-error-toggle-recording">${renderSettingsFieldError('toggleRecording')}</p>
        <label class="text-row">
          <span>Cancel recording shortcut</span>
          <input id="settings-shortcut-cancel-recording" type="text" value="${escapeHtml(settings.shortcuts.cancelRecording ?? DEFAULT_SETTINGS.shortcuts.cancelRecording)}" />
        </label>
        <p class="field-error" id="settings-error-cancel-recording">${renderSettingsFieldError('cancelRecording')}</p>
        <label class="text-row">
          <span>Run transform shortcut</span>
          <input id="settings-shortcut-run-transform" type="text" value="${escapeHtml(settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform)}" />
        </label>
        <p class="field-error" id="settings-error-run-transform">${renderSettingsFieldError('runTransform')}</p>
        <label class="text-row">
          <span>Run transform on selection shortcut</span>
          <input id="settings-shortcut-run-transform-selection" type="text" value="${escapeHtml(settings.shortcuts.runTransformOnSelection ?? DEFAULT_SETTINGS.shortcuts.runTransformOnSelection)}" />
        </label>
        <p class="field-error" id="settings-error-run-transform-selection">${renderSettingsFieldError('runTransformOnSelection')}</p>
        <label class="text-row">
          <span>Pick transformation shortcut</span>
          <input id="settings-shortcut-pick-transform" type="text" value="${escapeHtml(settings.shortcuts.pickTransformation ?? DEFAULT_SETTINGS.shortcuts.pickTransformation)}" />
        </label>
        <p class="field-error" id="settings-error-pick-transform">${renderSettingsFieldError('pickTransformation')}</p>
        <label class="text-row">
          <span>Change default transformation shortcut</span>
          <input id="settings-shortcut-change-default-transform" type="text" value="${escapeHtml(settings.shortcuts.changeTransformationDefault ?? DEFAULT_SETTINGS.shortcuts.changeTransformationDefault)}" />
        </label>
        <p class="field-error" id="settings-error-change-default-transform">${renderSettingsFieldError('changeTransformationDefault')}</p>
      </section>
      <div id="settings-output-react-root"></div>
      <div class="settings-actions">
        <button type="submit">Save Settings</button>
      </div>
      <p id="settings-save-message" class="muted" aria-live="polite"></p>
    </form>
  </article>
`

const renderShell = (settings: Settings): string => `
  <main class="shell">
    <div id="shell-chrome-react-root"></div>
    <section class="grid page-home" data-page="home">
      <div id="home-react-root"></div>
    </section>
    <section class="grid page-settings is-hidden" data-page="settings">
      ${renderSettingsPanel(settings)}
      <div id="settings-shortcuts-react-root"></div>
    </section>
    <ul id="toast-layer" class="toast-layer" aria-live="polite" aria-atomic="false">${renderToasts()}</ul>
  </main>
`

const disposeHomeReactRoot = (): void => {
  if (homeReactRoot) {
    homeReactRoot.unmount()
    homeReactRoot = null
  }
}

const disposeSettingsApiKeysReactRoot = (): void => {
  if (settingsApiKeysReactRoot) {
    settingsApiKeysReactRoot.unmount()
    settingsApiKeysReactRoot = null
  }
}

const disposeSettingsEndpointOverridesReactRoot = (): void => {
  if (settingsEndpointOverridesReactRoot) {
    settingsEndpointOverridesReactRoot.unmount()
    settingsEndpointOverridesReactRoot = null
  }
}

const disposeSettingsOutputReactRoot = (): void => {
  if (settingsOutputReactRoot) {
    settingsOutputReactRoot.unmount()
    settingsOutputReactRoot = null
  }
}

const disposeSettingsRecordingReactRoot = (): void => {
  if (settingsRecordingReactRoot) {
    settingsRecordingReactRoot.unmount()
    settingsRecordingReactRoot = null
  }
}

const disposeSettingsTransformationReactRoot = (): void => {
  if (settingsTransformationReactRoot) {
    settingsTransformationReactRoot.unmount()
    settingsTransformationReactRoot = null
  }
}

const disposeShellChromeReactRoot = (): void => {
  if (shellChromeReactRoot) {
    shellChromeReactRoot.unmount()
    shellChromeReactRoot = null
  }
}

const disposeSettingsShortcutsReactRoot = (): void => {
  if (settingsShortcutsReactRoot) {
    settingsShortcutsReactRoot.unmount()
    settingsShortcutsReactRoot = null
  }
}

const openSettingsRoute = (): void => {
  state.currentPage = 'settings'
  refreshRouteTabs()
}

const navigateToPage = (page: AppPage): void => {
  state.currentPage = page
  refreshRouteTabs()
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
  renderSettingsApiKeysReact()
  try {
    const result = await window.speechToTextApi.testApiKeyConnection(provider, candidateValue)
    state.apiKeyTestStatus[provider] = `${result.status === 'success' ? 'Success' : 'Failed'}: ${result.message}`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API key test error'
    state.apiKeyTestStatus[provider] = `Failed: ${message}`
  }
  renderSettingsApiKeysReact()
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
    renderSettingsApiKeysReact()
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
    renderSettingsApiKeysReact()
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
    renderSettingsApiKeysReact()
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
    const refreshedSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
    if (refreshedSaveMessage) {
      refreshedSaveMessage.textContent = 'Defaults restored.'
    }
    addActivity('Output and shortcut defaults restored.', 'success')
    addToast('Defaults restored.', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown defaults restore error'
    const settingsSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
    if (settingsSaveMessage) {
      settingsSaveMessage.textContent = `Failed to restore defaults: ${message}`
    }
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
  const msg = app?.querySelector<HTMLElement>('#settings-save-message')
  if (msg) {
    msg.textContent = 'Configuration added. Save settings to persist.'
  }
}

const removeTransformationPreset = (activePresetId: string): void => {
  if (!state.settings) {
    return
  }
  const presets = state.settings.transformation.presets
  if (presets.length <= 1) {
    const msg = app?.querySelector<HTMLElement>('#settings-save-message')
    if (msg) {
      msg.textContent = 'At least one configuration is required.'
    }
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
  const msg = app?.querySelector<HTMLElement>('#settings-save-message')
  if (msg) {
    msg.textContent = 'Configuration removed. Save settings to persist.'
  }
}

const renderHomeReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const homeRootNode = app.querySelector<HTMLDivElement>('#home-react-root')
  if (!homeRootNode) {
    disposeHomeReactRoot()
    return
  }
  if (!homeReactRoot) {
    homeReactRoot = createRoot(homeRootNode)
  }
  homeReactRoot.render(
    createElement(HomeReact, {
      settings: state.settings,
      apiKeyStatus: state.apiKeyStatus,
      lastTransformSummary: state.lastTransformSummary,
      pendingActionId: state.pendingActionId,
      hasCommandError: state.hasCommandError,
      isRecording: isNativeRecording(),
      onRunRecordingCommand: (command: RecordingCommand) => {
        void runRecordingCommandAction(command)
      },
      onRunCompositeTransform: () => {
        void runCompositeTransformAction()
      },
      onOpenSettings: () => {
        openSettingsRoute()
      }
    })
  )
}

const renderSettingsApiKeysReact = (): void => {
  if (!app) {
    return
  }
  const apiKeysRootNode = app.querySelector<HTMLDivElement>('#settings-api-keys-react-root')
  if (!apiKeysRootNode) {
    disposeSettingsApiKeysReactRoot()
    return
  }
  if (!settingsApiKeysReactRoot) {
    settingsApiKeysReactRoot = createRoot(apiKeysRootNode)
  }
  settingsApiKeysReactRoot.render(
    createElement(SettingsApiKeysReact, {
      apiKeyStatus: state.apiKeyStatus,
      apiKeySaveStatus: state.apiKeySaveStatus,
      apiKeyTestStatus: state.apiKeyTestStatus,
      saveMessage: state.apiKeysSaveMessage,
      onTestApiKey: async (provider: ApiKeyProvider, candidateValue: string) => {
        await runApiKeyConnectionTest(provider, candidateValue)
      },
      onSaveApiKeys: async (values: Record<ApiKeyProvider, string>) => {
        await saveApiKeys(values)
      }
    })
  )
}

const renderSettingsRecordingReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const recordingRootNode = app.querySelector<HTMLDivElement>('#settings-recording-react-root')
  if (!recordingRootNode) {
    disposeSettingsRecordingReactRoot()
    return
  }
  if (!settingsRecordingReactRoot) {
    settingsRecordingReactRoot = createRoot(recordingRootNode)
  }
  settingsRecordingReactRoot.render(
    createElement(SettingsRecordingReact, {
      settings: state.settings,
      audioInputSources: state.audioInputSources.length > 0 ? state.audioInputSources : [SYSTEM_DEFAULT_AUDIO_SOURCE],
      audioSourceHint: state.audioSourceHint,
      onRefreshAudioSources: async () => {
        try {
          await refreshAudioInputSources(true)
          renderSettingsRecordingReact()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown audio source refresh error'
          addActivity(`Audio source refresh failed: ${message}`, 'error')
          addToast(`Audio source refresh failed: ${message}`, 'error')
        }
      },
      onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => {
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
      },
      onSelectTranscriptionModel: (model: Settings['transcription']['model']) => {
        applyNonSecretAutosavePatch((current) => ({
          ...current,
          transcription: {
            ...current.transcription,
            model
          }
        }))
      }
    })
  )
}

const renderSettingsEndpointOverridesReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const endpointOverridesRootNode = app.querySelector<HTMLDivElement>('#settings-endpoint-overrides-react-root')
  if (!endpointOverridesRootNode) {
    disposeSettingsEndpointOverridesReactRoot()
    return
  }
  if (!settingsEndpointOverridesReactRoot) {
    settingsEndpointOverridesReactRoot = createRoot(endpointOverridesRootNode)
  }
  settingsEndpointOverridesReactRoot.render(
    createElement(SettingsEndpointOverridesReact, {
      settings: state.settings,
      transcriptionBaseUrlError: state.settingsValidationErrors.transcriptionBaseUrl ?? '',
      transformationBaseUrlError: state.settingsValidationErrors.transformationBaseUrl ?? '',
      onChangeTranscriptionBaseUrlDraft: (value: string) => {
        patchTranscriptionBaseUrlDraft(value)
      },
      onChangeTransformationBaseUrlDraft: (value: string) => {
        patchTransformationBaseUrlDraft(value)
      },
      onResetTranscriptionBaseUrlDraft: () => {
        patchTranscriptionBaseUrlDraft('')
        setSettingsValidationErrors({
          ...state.settingsValidationErrors,
          transcriptionBaseUrl: ''
        })
      },
      onResetTransformationBaseUrlDraft: () => {
        patchTransformationBaseUrlDraft('')
        setSettingsValidationErrors({
          ...state.settingsValidationErrors,
          transformationBaseUrl: ''
        })
      }
    })
  )
}

const renderSettingsTransformationReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const transformationRootNode = app.querySelector<HTMLDivElement>('#settings-transformation-react-root')
  if (!transformationRootNode) {
    disposeSettingsTransformationReactRoot()
    return
  }
  if (!settingsTransformationReactRoot) {
    settingsTransformationReactRoot = createRoot(transformationRootNode)
  }
  settingsTransformationReactRoot.render(
    createElement(SettingsTransformationReact, {
      settings: state.settings,
      presetNameError: state.settingsValidationErrors.presetName ?? '',
      onToggleTransformEnabled: (checked: boolean) => {
        applyNonSecretAutosavePatch((current) => ({
          ...current,
          transformation: {
            ...current.transformation,
            enabled: checked
          }
        }))
      },
      onToggleAutoRun: (checked: boolean) => {
        applyNonSecretAutosavePatch((current) => ({
          ...current,
          transformation: {
            ...current.transformation,
            autoRunDefaultTransform: checked
          }
        }))
      },
      onSelectActivePreset: (presetId: string) => {
        setActiveTransformationPreset(presetId)
      },
      onSelectDefaultPreset: (presetId: string) => {
        setDefaultTransformationPreset(presetId)
      },
      onChangeActivePresetDraft: (
        patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
      ) => {
        patchActiveTransformationPresetDraft(patch)
      },
      onRunSelectedPreset: () => {
        void runCompositeTransformAction()
      },
      onAddPreset: () => {
        addTransformationPreset()
      },
      onRemovePreset: (activePresetId: string) => {
        removeTransformationPreset(activePresetId)
      }
    })
  )
}

const renderSettingsOutputReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const outputRootNode = app.querySelector<HTMLDivElement>('#settings-output-react-root')
  if (!outputRootNode) {
    disposeSettingsOutputReactRoot()
    return
  }
  if (!settingsOutputReactRoot) {
    settingsOutputReactRoot = createRoot(outputRootNode)
  }
  settingsOutputReactRoot.render(
    createElement(SettingsOutputReact, {
      settings: state.settings,
      onToggleTranscriptCopy: (checked: boolean) => {
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
      },
      onToggleTranscriptPaste: (checked: boolean) => {
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
      },
      onToggleTransformedCopy: (checked: boolean) => {
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
      },
      onToggleTransformedPaste: (checked: boolean) => {
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
      },
      onRestoreDefaults: async () => {
        // Preserve historical Settings behavior: this action resets
        // both output matrix and shortcut defaults.
        await restoreOutputAndShortcutsDefaults()
      }
    })
  )
}

const renderShellChromeReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const chromeRootNode = app.querySelector<HTMLDivElement>('#shell-chrome-react-root')
  if (!chromeRootNode) {
    disposeShellChromeReactRoot()
    return
  }
  if (!shellChromeReactRoot) {
    shellChromeReactRoot = createRoot(chromeRootNode)
  }
  shellChromeReactRoot.render(
    createElement(ShellChromeReact, {
      ping: state.ping,
      settings: state.settings,
      currentPage: state.currentPage,
      onNavigate: navigateToPage
    })
  )
}

const renderSettingsShortcutsReact = (): void => {
  if (!app || !state.settings) {
    return
  }
  const shortcutsRootNode = app.querySelector<HTMLDivElement>('#settings-shortcuts-react-root')
  if (!shortcutsRootNode) {
    disposeSettingsShortcutsReactRoot()
    return
  }
  if (!settingsShortcutsReactRoot) {
    settingsShortcutsReactRoot = createRoot(shortcutsRootNode)
  }
  settingsShortcutsReactRoot.render(
    createElement(SettingsShortcutsReact, {
      shortcuts: buildShortcutContract(state.settings)
    })
  )
}

const refreshStatus = (): void => {
  renderHomeReact()
}

const refreshCommandButtons = (): void => {
  renderHomeReact()
}

const refreshRouteTabs = (): void => {
  renderShellChromeReact()

  const pages = app?.querySelectorAll<HTMLElement>('[data-page]') ?? []
  for (const page of pages) {
    const route = page.dataset.page as AppPage | undefined
    page.classList.toggle('is-hidden', route !== state.currentPage)
  }
}

const refreshSettingsValidationMessages = (): void => {
  const fieldMap: Array<{ id: string; field: keyof SettingsValidationErrors }> = [
    { id: 'settings-error-transcription-base-url', field: 'transcriptionBaseUrl' },
    { id: 'settings-error-transformation-base-url', field: 'transformationBaseUrl' },
    { id: 'settings-error-preset-name', field: 'presetName' },
    { id: 'settings-error-start-recording', field: 'startRecording' },
    { id: 'settings-error-stop-recording', field: 'stopRecording' },
    { id: 'settings-error-toggle-recording', field: 'toggleRecording' },
    { id: 'settings-error-cancel-recording', field: 'cancelRecording' },
    { id: 'settings-error-run-transform', field: 'runTransform' },
    { id: 'settings-error-run-transform-selection', field: 'runTransformOnSelection' },
    { id: 'settings-error-pick-transform', field: 'pickTransformation' },
    { id: 'settings-error-change-default-transform', field: 'changeTransformationDefault' }
  ]
  for (const item of fieldMap) {
    const node = app?.querySelector<HTMLElement>(`#${item.id}`)
    if (!node) {
      continue
    }
    node.textContent = state.settingsValidationErrors[item.field] ?? ''
  }
}

const wireActions = (): void => {
  const settingsForm = app?.querySelector<HTMLFormElement>('#settings-form')
  const settingsSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')

  settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!state.settings) {
      return
    }

    const formValidation = validateSettingsFormInput({
      transcriptionBaseUrlRaw: app?.querySelector<HTMLInputElement>('#settings-transcription-base-url')?.value ?? '',
      transformationBaseUrlRaw: app?.querySelector<HTMLInputElement>('#settings-transformation-base-url')?.value ?? '',
      presetNameRaw: app?.querySelector<HTMLInputElement>('#settings-transform-preset-name')?.value ?? '',
      shortcuts: {
        startRecording: app?.querySelector<HTMLInputElement>('#settings-shortcut-start-recording')?.value ?? '',
        stopRecording: app?.querySelector<HTMLInputElement>('#settings-shortcut-stop-recording')?.value ?? '',
        toggleRecording: app?.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.value ?? '',
        cancelRecording: app?.querySelector<HTMLInputElement>('#settings-shortcut-cancel-recording')?.value ?? '',
        runTransform: app?.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')?.value ?? '',
        runTransformOnSelection: app?.querySelector<HTMLInputElement>('#settings-shortcut-run-transform-selection')?.value ?? '',
        pickTransformation: app?.querySelector<HTMLInputElement>('#settings-shortcut-pick-transform')?.value ?? '',
        changeTransformationDefault:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-change-default-transform')?.value ?? ''
      }
    })
    setSettingsValidationErrors(formValidation.errors)
    if (Object.keys(formValidation.errors).length > 0) {
      if (settingsSaveMessage) {
        settingsSaveMessage.textContent = 'Fix the highlighted validation errors before saving.'
      }
      addToast('Settings validation failed. Fix highlighted fields.', 'error')
      return
    }

    const activePresetId = app?.querySelector<HTMLSelectElement>('#settings-transform-active-preset')?.value ?? ''
    const defaultPresetId = app?.querySelector<HTMLSelectElement>('#settings-transform-default-preset')?.value ?? ''
    const activePreset = resolveTransformationPreset(state.settings, activePresetId || state.settings.transformation.activePresetId)
    const updatedActivePreset = {
      ...activePreset,
      name: formValidation.normalized.presetName,
      model:
        (app?.querySelector<HTMLSelectElement>('#settings-transform-preset-model')?.value as Settings['transformation']['presets'][number]['model']) ||
        activePreset.model,
      systemPrompt: app?.querySelector<HTMLTextAreaElement>('#settings-system-prompt')?.value ?? '',
      userPrompt: app?.querySelector<HTMLTextAreaElement>('#settings-user-prompt')?.value ?? ''
    }
    const updatedPresets = state.settings.transformation.presets.map((preset) =>
      preset.id === updatedActivePreset.id ? updatedActivePreset : preset
    )

    const selectedRecordingDevice = app?.querySelector<HTMLSelectElement>('#settings-recording-device')?.value ?? 'system_default'
    const selectedRecordingMethod =
      (app?.querySelector<HTMLSelectElement>('#settings-recording-method')?.value as Settings['recording']['method']) ??
      state.settings.recording.method
    const selectedTranscriptionProvider =
      (app?.querySelector<HTMLSelectElement>('#settings-transcription-provider')?.value as Settings['transcription']['provider']) ??
      state.settings.transcription.provider
    const selectedTranscriptionModel =
      (app?.querySelector<HTMLSelectElement>('#settings-transcription-model')?.value as Settings['transcription']['model']) ??
      state.settings.transcription.model
    const selectedSampleRate = Number(
      app?.querySelector<HTMLSelectElement>('#settings-recording-sample-rate')?.value ?? state.settings.recording.sampleRateHz
    ) as Settings['recording']['sampleRateHz']

    const nextSettings: Settings = {
      ...state.settings,
      recording: {
        ...state.settings.recording,
        method: selectedRecordingMethod,
        device: selectedRecordingDevice,
        autoDetectAudioSource: selectedRecordingDevice === 'system_default',
        detectedAudioSource: resolveDetectedAudioSource(selectedRecordingDevice, state.audioInputSources),
        sampleRateHz: selectedSampleRate
      },
      transformation: {
        ...state.settings.transformation,
        enabled: app?.querySelector<HTMLInputElement>('#settings-transform-enabled')?.checked ?? false,
        autoRunDefaultTransform: app?.querySelector<HTMLInputElement>('#settings-transform-auto-run')?.checked ?? false,
        activePresetId: activePresetId || state.settings.transformation.activePresetId,
        defaultPresetId: defaultPresetId || state.settings.transformation.defaultPresetId,
        baseUrlOverrides: {
          ...state.settings.transformation.baseUrlOverrides,
          [updatedActivePreset.provider]: formValidation.normalized.transformationBaseUrlOverride
        },
        presets: updatedPresets
      },
      transcription: {
        ...state.settings.transcription,
        provider: selectedTranscriptionProvider,
        model: selectedTranscriptionModel,
        baseUrlOverrides: {
          ...state.settings.transcription.baseUrlOverrides,
          [selectedTranscriptionProvider]: formValidation.normalized.transcriptionBaseUrlOverride
        }
      },
      shortcuts: {
        ...state.settings.shortcuts,
        ...formValidation.normalized.shortcuts
      },
      output: {
        transcript: {
          copyToClipboard: app?.querySelector<HTMLInputElement>('#settings-transcript-copy')?.checked ?? false,
          pasteAtCursor: app?.querySelector<HTMLInputElement>('#settings-transcript-paste')?.checked ?? false
        },
        transformed: {
          copyToClipboard: app?.querySelector<HTMLInputElement>('#settings-transformed-copy')?.checked ?? false,
          pasteAtCursor: app?.querySelector<HTMLInputElement>('#settings-transformed-paste')?.checked ?? false
        }
      }
    }

    try {
      invalidatePendingAutosave()
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      state.persistedSettings = structuredClone(saved)
      rerenderShellFromState()
      const refreshedSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
      if (refreshedSaveMessage) {
        refreshedSaveMessage.textContent = 'Settings saved.'
      }
      addActivity('Settings updated.', 'success')
      addToast('Settings saved.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown settings save error'
      logRendererError('renderer.settings_save_failed', error)
      if (settingsSaveMessage) {
        settingsSaveMessage.textContent = `Failed to save settings: ${message}`
      }
      addActivity(`Settings save failed: ${message}`, 'error')
      addToast(`Settings save failed: ${message}`, 'error')
    }
  })

  if (!state.transformStatusListenerAttached) {
    window.speechToTextApi.onCompositeTransformStatus((result) => {
      applyCompositeResult(result)
    })
    state.transformStatusListenerAttached = true
  }

  if (!state.recordingCommandListenerAttached) {
    window.speechToTextApi.onRecordingCommand((dispatch) => {
      void handleRecordingCommandDispatch(dispatch)
    })
    state.recordingCommandListenerAttached = true
  }

  if (!state.hotkeyErrorListenerAttached) {
    window.speechToTextApi.onHotkeyError((notification: HotkeyErrorNotification) => {
      applyHotkeyErrorNotification(notification, addActivity, addToast)
    })
    state.hotkeyErrorListenerAttached = true
  }
}


const rerenderShellFromState = (): void => {
  if (!app || !state.settings) {
    return
  }

  disposeHomeReactRoot()
  disposeSettingsApiKeysReactRoot()
  disposeSettingsEndpointOverridesReactRoot()
  disposeSettingsOutputReactRoot()
  disposeSettingsRecordingReactRoot()
  disposeSettingsTransformationReactRoot()
  disposeShellChromeReactRoot()
  disposeSettingsShortcutsReactRoot()
  app.innerHTML = renderShell(state.settings)
  renderShellChromeReact()
  renderHomeReact()
  renderSettingsApiKeysReact()
  renderSettingsEndpointOverridesReact()
  renderSettingsOutputReact()
  renderSettingsRecordingReact()
  renderSettingsTransformationReact()
  renderSettingsShortcutsReact()
  refreshStatus()
  refreshCommandButtons()
  refreshToasts()
  refreshRouteTabs()
  wireActions()
}

const render = async (): Promise<void> => {
  if (!app) {
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

    disposeHomeReactRoot()
    disposeSettingsApiKeysReactRoot()
    disposeSettingsEndpointOverridesReactRoot()
    disposeSettingsOutputReactRoot()
    disposeSettingsRecordingReactRoot()
    disposeSettingsTransformationReactRoot()
    disposeShellChromeReactRoot()
    disposeSettingsShortcutsReactRoot()
    app.innerHTML = renderShell(settings)
    renderShellChromeReact()
    renderHomeReact()
    renderSettingsApiKeysReact()
    renderSettingsEndpointOverridesReact()
    renderSettingsOutputReact()
    renderSettingsRecordingReact()
    renderSettingsTransformationReact()
    renderSettingsShortcutsReact()
    addActivity('Settings loaded from main process.', 'success')
    refreshStatus()
    refreshCommandButtons()
    refreshToasts()
    refreshRouteTabs()
    wireActions()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown initialization error'
    logRendererError('renderer.initialization_failed', error)
    app.innerHTML = `
      <main class="shell shell-failure">
        <section class="card">
          <p class="eyebrow">Renderer Initialization Error</p>
          <h1>UI failed to initialize</h1>
          <p class="muted">${escapeHtml(message)}</p>
        </section>
      </main>
    `
    addActivity(`Renderer initialization failed: ${message}`, 'error')
  }
}

export const startLegacyRenderer = (target?: HTMLDivElement): void => {
  disposeHomeReactRoot()
  disposeSettingsApiKeysReactRoot()
  disposeSettingsEndpointOverridesReactRoot()
  disposeSettingsOutputReactRoot()
  disposeSettingsRecordingReactRoot()
  disposeSettingsTransformationReactRoot()
  disposeShellChromeReactRoot()
  disposeSettingsShortcutsReactRoot()
  app = target ?? document.querySelector<HTMLDivElement>('#app')
  void render()
}
