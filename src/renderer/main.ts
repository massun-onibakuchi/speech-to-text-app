import './styles.css'
import { DEFAULT_SETTINGS, type Settings, type TerminalJobStatus } from '../shared/domain'
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
import { applyHotkeyErrorNotification } from './hotkey-error'
import { resolveHomeCommandStatus } from './home-status'
import { resolveDetectedAudioSource, resolveRecordingDeviceId } from './recording-device'

const app = document.querySelector<HTMLDivElement>('#app')

type AppPage = 'home' | 'settings'
interface ShortcutBinding {
  action: string
  combo: string
}
interface ToastItem {
  id: number
  message: string
  tone: ActivityItem['tone']
}

const recordingControls: Array<{ command: RecordingCommand; label: string; busyLabel: string }> = [
  { command: 'startRecording', label: 'Start', busyLabel: 'Starting...' },
  { command: 'stopRecording', label: 'Stop', busyLabel: 'Stopping...' },
  { command: 'toggleRecording', label: 'Toggle', busyLabel: 'Toggling...' },
  { command: 'cancelRecording', label: 'Cancel', busyLabel: 'Cancelling...' }
]

const recordingMethodOptions: Array<{ value: Settings['recording']['method']; label: string }> = [
  { value: 'cpal', label: 'CPAL' }
]

const recordingSampleRateOptions: Array<{ value: Settings['recording']['sampleRateHz']; label: string }> = [
  { value: 16000, label: '16 kHz (optimized for speech)' },
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' }
]

const state = {
  currentPage: 'home' as AppPage,
  ping: 'pong',
  settings: null as Settings | null,
  apiKeyStatus: {
    groq: false,
    elevenlabs: false,
    google: false
  } as ApiKeyStatusSnapshot,
  apiKeyVisibility: {
    groq: false,
    elevenlabs: false,
    google: false
  } as Record<ApiKeyProvider, boolean>,
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
  hasCommandError: false
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
          const detail =
            match.failureDetail?.trim().length
              ? match.failureDetail.trim()
              : `Recording finished with status: ${formatTerminalStatus(match.terminalStatus)}`
          addActivity(detail, 'error')
          addToast(detail, 'error')
        }
        refreshTimeline()
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown history retrieval error'
      addActivity(`History refresh failed: ${message}`, 'error')
      addToast(`History refresh failed: ${message}`, 'error')
      refreshTimeline()
      return
    }

    await sleep(600)
  }

  addActivity('Recording submitted. Terminal result has not appeared yet.', 'info')
  addToast('Recording submitted. Terminal result has not appeared yet.', 'info')
  refreshTimeline()
}

const formatTerminalStatus = (status: TerminalJobStatus): string => status.replaceAll('_', ' ')

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

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const checkedAttr = (value: boolean): string => (value ? 'checked' : '')
const formatApiKeyStatus = (exists: boolean): string => (exists ? 'Saved' : 'Not set')
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

const getTransformBlockedReason = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string | null => {
  if (!settings.transformation.enabled) {
    return 'Transformation is disabled. Enable it in Settings > Transformation.'
  }
  if (!apiKeyStatus.google) {
    return 'Google API key is missing. Add it in Settings > Provider API Keys.'
  }
  return null
}

const getRecordingBlockedReason = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string | null => {
  const provider = settings.transcription.provider
  if (apiKeyStatus[provider]) {
    return null
  }
  return provider === 'groq'
    ? 'Missing Groq API key. Add it in Settings > Provider API Keys.'
    : 'Missing ElevenLabs API key. Add it in Settings > Provider API Keys.'
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
      refreshStatus()
      refreshTimeline()
      return
    }

    if (command === 'stopRecording') {
      await stopNativeRecording()
      state.hasCommandError = false
      addActivity('Recording captured and queued for transcription.', 'success')
      refreshStatus()
      refreshTimeline()
      return
    }

    if (command === 'toggleRecording') {
      if (isNativeRecording()) {
        await stopNativeRecording()
        addActivity('Recording captured and queued for transcription.', 'success')
      } else {
        await startNativeRecording(dispatch.preferredDeviceId)
        addActivity('Recording started.', 'success')
      }
      state.hasCommandError = false
      refreshStatus()
      refreshTimeline()
      return
    }

    if (command === 'cancelRecording') {
      await cancelNativeRecording()
      state.hasCommandError = false
      addActivity('Recording cancelled.', 'info')
      refreshStatus()
      refreshTimeline()
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    state.hasCommandError = true
    addActivity(`${command} failed: ${message}`, 'error')
    addToast(`${command} failed: ${message}`, 'error')
    refreshStatus()
    refreshTimeline()
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
    refreshTimeline()
  }
}

const renderStatusHero = (pong: string, settings: Settings): string => `
  <section class="hero card" data-stagger style="--delay:40ms">
    <p class="eyebrow">Speech-to-Text Control Room</p>
    <h1>Speech-to-Text v1</h1>
    <div class="hero-meta">
      <span class="chip chip-good">IPC ${escapeHtml(pong)}</span>
      <span class="chip">STT ${escapeHtml(settings.transcription.provider)} / ${escapeHtml(settings.transcription.model)}</span>
      <span class="chip">Transform ${settings.transformation.enabled ? 'Enabled' : 'Disabled'}</span>
    </div>
  </section>
`

const renderTopNav = (): string => `
  <nav class="top-nav card" aria-label="Primary">
    <button type="button" class="nav-tab is-active" data-route-tab="home">Home</button>
    <button type="button" class="nav-tab" data-route-tab="settings">Settings</button>
  </nav>
`

const renderRecordingPanel = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string => {
  const blockedReason = getRecordingBlockedReason(settings, apiKeyStatus)
  return `
  <article class="card controls" data-stagger style="--delay:100ms">
    <div class="panel-head">
      <h2>Recording Controls</h2>
      <span class="status-dot" id="command-status-dot" role="status" aria-live="polite" aria-atomic="true">Idle</span>
    </div>
    <p class="muted">Manual mode commands from v1 contract.</p>
    ${blockedReason ? `<p class="inline-error">${escapeHtml(blockedReason)}</p>` : ''}
    <button type="button" class="inline-link" data-route-target="settings">Open Settings</button>
    <div class="button-grid">
      ${recordingControls
        .map(
          (control) => `
            <button
              class="command-button"
              data-recording-command="${control.command}"
              data-action-id="recording:${control.command}"
              data-label="${control.label}"
              data-busy-label="${control.busyLabel}"
            >
              ${control.label}
            </button>
          `
        )
        .join('')}
    </div>
  </article>
`
}

const renderTransformPanel = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot,
  lastTransformSummary: string
): string => {
  const blockedReason = getTransformBlockedReason(settings, apiKeyStatus)

  return `
  <article class="card controls" data-stagger style="--delay:160ms">
    <h2>Transform Shortcut</h2>
    <p class="muted">Flow 5: pick-and-run transform on clipboard text in one action.</p>
    <p class="muted" id="transform-last-summary">${escapeHtml(lastTransformSummary)}</p>
    ${blockedReason ? `<p class="inline-error">${escapeHtml(blockedReason)}</p><button type="button" class="inline-link" data-route-target="settings">Open Settings</button>` : ''}
    <div class="button-grid single">
      <button
        id="run-composite-transform"
        class="command-button"
        data-requires-transform-enabled="true"
        data-requires-google-key="true"
        data-action-id="transform:composite"
        data-label="Run Composite Transform"
        data-busy-label="Transforming..."
      >
        Run Composite Transform
      </button>
    </div>
  </article>
`
}

const renderSettingsPanel = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string => `
  ${(() => {
    const activePreset = resolveTransformationPreset(settings, settings.transformation.activePresetId)
    const sources = state.audioInputSources.length > 0 ? state.audioInputSources : [SYSTEM_DEFAULT_AUDIO_SOURCE]
    return `
  <article class="card settings" data-stagger style="--delay:220ms">
    <div class="panel-head">
      <h2>Settings</h2>
    </div>
    <form id="api-keys-form" class="settings-form">
      <section class="settings-group">
        <h3>Provider API Keys</h3>
        ${(['groq', 'elevenlabs', 'google'] as const)
          .map((provider) => {
            const label =
              provider === 'groq' ? 'Groq API key' : provider === 'elevenlabs' ? 'ElevenLabs API key' : 'Google Gemini API key'
            const inputId = `settings-api-key-${provider}`
            const isVisible = state.apiKeyVisibility[provider]
            return `
              <div class="settings-key-row">
                <label class="text-row">
                  <span>${label} <em class="field-hint">${formatApiKeyStatus(apiKeyStatus[provider])}</em></span>
                  <input id="${inputId}" type="${isVisible ? 'text' : 'password'}" autocomplete="off" placeholder="Enter ${label}" />
                </label>
                <div class="settings-actions settings-actions-inline">
                  <button type="button" data-api-key-visibility-toggle="${provider}">${isVisible ? 'Hide' : 'Show'}</button>
                  <button type="button" data-api-key-test="${provider}">Test Connection</button>
                </div>
                <p class="muted provider-status" id="api-key-save-status-${provider}" aria-live="polite">${escapeHtml(
                  state.apiKeySaveStatus[provider]
                )}</p>
                <p class="muted provider-status" id="api-key-test-status-${provider}" aria-live="polite">${escapeHtml(
                  state.apiKeyTestStatus[provider]
                )}</p>
              </div>
            `
          })
          .join('')}
      </section>
      <div class="settings-actions">
        <button type="submit">Save API Keys</button>
      </div>
      <p id="api-keys-save-message" class="muted" aria-live="polite"></p>
    </form>
    <form id="settings-form" class="settings-form">
      <section class="settings-group">
        <h3>Recording</h3>
        <p class="muted">Recording is enabled in v1. If capture fails, verify microphone permission and audio device availability.</p>
        <label class="text-row">
          <span>Recording method</span>
          <select id="settings-recording-method">
            ${recordingMethodOptions
              .map(
                (option) =>
                  `<option value="${escapeHtml(option.value)}" ${option.value === settings.recording.method ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="text-row">
          <span>Sample rate</span>
          <select id="settings-recording-sample-rate">
            ${recordingSampleRateOptions
              .map(
                (option) =>
                  `<option value="${option.value}" ${option.value === settings.recording.sampleRateHz ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="text-row">
          <span>Audio source</span>
          <select id="settings-recording-device">
            ${sources
              .map(
                (source) =>
                  `<option value="${escapeHtml(source.id)}" ${source.id === settings.recording.device ? 'selected' : ''}>${escapeHtml(source.label)}</option>`
              )
              .join('')}
          </select>
        </label>
        <div class="settings-actions">
          <button type="button" id="settings-refresh-audio-sources">Refresh audio sources</button>
        </div>
        <p class="muted" id="settings-audio-sources-message">${escapeHtml(state.audioSourceHint)}</p>
        <a
          class="inline-link"
          href="https://github.com/massun-onibakuchi/speech-to-text-app/issues/8"
          target="_blank"
          rel="noreferrer"
        >
          View roadmap item
        </a>
      </section>
      <section class="settings-group">
        <h3>Transformation</h3>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transform-enabled" ${checkedAttr(settings.transformation.enabled)} />
          <span>Enable transformation</span>
        </label>
        <label class="text-row">
          <span>Active configuration</span>
          <select id="settings-transform-active-preset">
            ${settings.transformation.presets
              .map(
                (preset) =>
                  `<option value="${escapeHtml(preset.id)}" ${preset.id === settings.transformation.activePresetId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="text-row">
          <span>Default configuration</span>
          <select id="settings-transform-default-preset">
            ${settings.transformation.presets
              .map(
                (preset) =>
                  `<option value="${escapeHtml(preset.id)}" ${preset.id === settings.transformation.defaultPresetId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
              )
              .join('')}
          </select>
        </label>
        <div class="settings-actions">
          <button type="button" id="settings-preset-add">Add Configuration</button>
          <button type="button" id="settings-preset-remove">Remove Active Configuration</button>
          <button type="button" id="settings-run-selected-preset">Run Selected Configuration</button>
        </div>
        <label class="text-row">
          <span>Configuration name</span>
          <input id="settings-transform-preset-name" type="text" value="${escapeHtml(activePreset?.name ?? 'Default')}" />
        </label>
        <label class="text-row">
          <span>Configuration model</span>
          <select id="settings-transform-preset-model">
            <option value="gemini-2.5-flash" ${(activePreset?.model ?? 'gemini-2.5-flash') === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
          </select>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transform-auto-run" ${checkedAttr(settings.transformation.autoRunDefaultTransform)} />
          <span>Auto-run default transform</span>
        </label>
        <label class="text-row">
          <span>System prompt</span>
          <textarea id="settings-system-prompt" rows="3">${escapeHtml(activePreset?.systemPrompt ?? '')}</textarea>
        </label>
        <label class="text-row">
          <span>User prompt</span>
          <textarea id="settings-user-prompt" rows="3">${escapeHtml(activePreset?.userPrompt ?? '')}</textarea>
        </label>
        <label class="text-row">
          <span>Start recording shortcut</span>
          <input id="settings-shortcut-start-recording" type="text" value="${escapeHtml(settings.shortcuts.startRecording ?? DEFAULT_SETTINGS.shortcuts.startRecording)}" />
        </label>
        <label class="text-row">
          <span>Stop recording shortcut</span>
          <input id="settings-shortcut-stop-recording" type="text" value="${escapeHtml(settings.shortcuts.stopRecording ?? DEFAULT_SETTINGS.shortcuts.stopRecording)}" />
        </label>
        <label class="text-row">
          <span>Toggle recording shortcut</span>
          <input id="settings-shortcut-toggle-recording" type="text" value="${escapeHtml(settings.shortcuts.toggleRecording ?? DEFAULT_SETTINGS.shortcuts.toggleRecording)}" />
        </label>
        <label class="text-row">
          <span>Cancel recording shortcut</span>
          <input id="settings-shortcut-cancel-recording" type="text" value="${escapeHtml(settings.shortcuts.cancelRecording ?? DEFAULT_SETTINGS.shortcuts.cancelRecording)}" />
        </label>
        <label class="text-row">
          <span>Run transform shortcut</span>
          <input id="settings-shortcut-run-transform" type="text" value="${escapeHtml(settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform)}" />
        </label>
        <label class="text-row">
          <span>Run transform on selection shortcut</span>
          <input id="settings-shortcut-run-transform-selection" type="text" value="${escapeHtml(settings.shortcuts.runTransformOnSelection ?? DEFAULT_SETTINGS.shortcuts.runTransformOnSelection)}" />
        </label>
        <label class="text-row">
          <span>Pick transformation shortcut</span>
          <input id="settings-shortcut-pick-transform" type="text" value="${escapeHtml(settings.shortcuts.pickTransformation ?? DEFAULT_SETTINGS.shortcuts.pickTransformation)}" />
        </label>
        <label class="text-row">
          <span>Change default transformation shortcut</span>
          <input id="settings-shortcut-change-default-transform" type="text" value="${escapeHtml(settings.shortcuts.changeTransformationDefault ?? DEFAULT_SETTINGS.shortcuts.changeTransformationDefault)}" />
        </label>
      </section>
      <section class="settings-group">
        <h3>Output</h3>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transcript-copy" ${checkedAttr(settings.output.transcript.copyToClipboard)} />
          <span>Transcript: Copy to clipboard</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transcript-paste" ${checkedAttr(settings.output.transcript.pasteAtCursor)} />
          <span>Transcript: Paste at cursor</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transformed-copy" ${checkedAttr(settings.output.transformed.copyToClipboard)} />
          <span>Transformed: Copy to clipboard</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="settings-transformed-paste" ${checkedAttr(settings.output.transformed.pasteAtCursor)} />
          <span>Transformed: Paste at cursor</span>
        </label>
        <div class="settings-actions">
          <button type="button" id="settings-restore-defaults">Restore Defaults</button>
        </div>
      </section>
      <div class="settings-actions">
        <button type="submit">Save Settings</button>
      </div>
      <p id="settings-save-message" class="muted" aria-live="polite"></p>
    </form>
  </article>
`
  })()}
`

const renderShortcutsPanel = (settings: Settings): string => `
  <article class="card shortcuts" data-stagger style="--delay:400ms">
    <h2>Shortcut Contract</h2>
    <p class="muted">Reference from v1 spec for default operator bindings.</p>
    <ul class="shortcut-list">
      ${buildShortcutContract(settings)
        .map(
          (shortcut) => `
            <li class="shortcut-item">
              <span class="shortcut-action">${escapeHtml(shortcut.action)}</span>
              <kbd class="shortcut-combo">${escapeHtml(shortcut.combo)}</kbd>
            </li>
          `
        )
        .join('')}
    </ul>
  </article>
`

const renderShell = (pong: string, settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string => `
  <main class="shell">
    ${renderStatusHero(pong, settings)}
    ${renderTopNav()}
    <section class="grid page-home" data-page="home">
      ${renderRecordingPanel(settings, apiKeyStatus)}
      ${renderTransformPanel(settings, apiKeyStatus, state.lastTransformSummary)}
      ${renderShortcutsPanel(settings)}
    </section>
    <section class="grid page-settings is-hidden" data-page="settings">
      ${renderSettingsPanel(settings, apiKeyStatus)}
      ${renderShortcutsPanel(settings)}
    </section>
    <ul id="toast-layer" class="toast-layer" aria-live="polite" aria-atomic="false">${renderToasts()}</ul>
  </main>
`

const refreshStatus = (): void => {
  const node = app?.querySelector<HTMLElement>('#command-status-dot')
  if (!node) {
    return
  }
  const status = resolveHomeCommandStatus({
    pendingActionId: state.pendingActionId,
    hasCommandError: state.hasCommandError,
    isRecording: isNativeRecording()
  })
  node.textContent = status.label
  node.classList.remove('is-idle', 'is-recording', 'is-busy', 'is-error')
  node.classList.add(status.cssClass)
}

const refreshCommandButtons = (): void => {
  const buttons = app?.querySelectorAll<HTMLButtonElement>('.command-button') ?? []
  for (const button of buttons) {
    const actionId = button.dataset.actionId
    const isBusy = state.pendingActionId !== null && actionId === state.pendingActionId
    const isDisabled = state.pendingActionId !== null && !isBusy
    const label = isBusy ? button.dataset.busyLabel : button.dataset.label

    button.disabled = isDisabled
    button.classList.toggle('is-busy', isBusy)
    if (label) {
      button.textContent = label
    }
  }
}

const refreshRouteTabs = (): void => {
  const tabs = app?.querySelectorAll<HTMLButtonElement>('[data-route-tab]') ?? []
  for (const tab of tabs) {
    const route = tab.dataset.routeTab as AppPage | undefined
    const active = route === state.currentPage
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-pressed', active ? 'true' : 'false')
  }

  const pages = app?.querySelectorAll<HTMLElement>('[data-page]') ?? []
  for (const page of pages) {
    const route = page.dataset.page as AppPage | undefined
    page.classList.toggle('is-hidden', route !== state.currentPage)
  }
}

const wireActions = (): void => {
  const recordingButtons = app?.querySelectorAll<HTMLButtonElement>('[data-recording-command]') ?? []
  for (const button of recordingButtons) {
    button.addEventListener('click', async () => {
      const command = button.dataset.recordingCommand as RecordingCommand | undefined
      if (!command) {
        return
      }
      if (state.pendingActionId !== null) {
        return
      }

      state.pendingActionId = `recording:${command}`
      state.hasCommandError = false
      refreshCommandButtons()
      refreshStatus()
      addActivity(`Running ${command}...`)
      refreshTimeline()
      try {
        await window.speechToTextApi.runRecordingCommand(command)
        addActivity(`${command} dispatched`, 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown recording error'
        state.hasCommandError = true
        addActivity(`${command} failed: ${message}`, 'error')
        addToast(`${command} failed: ${message}`, 'error')
      }
      state.pendingActionId = null
      refreshCommandButtons()
      refreshStatus()
      refreshTimeline()
    })
  }

  const compositeButton = app?.querySelector<HTMLButtonElement>('#run-composite-transform')
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
    if (state.settings && state.currentPage === 'home') {
      const summary = app?.querySelector<HTMLElement>('#transform-last-summary')
      if (summary) {
        summary.textContent = state.lastTransformSummary
      } else {
        rerenderShellFromState()
      }
    }
    refreshTimeline()
  }

  const runCompositeTransformAction = async () => {
    if (state.pendingActionId !== null) {
      return
    }
    if (!state.settings) {
      return
    }
    const blockedReason = getTransformBlockedReason(state.settings, state.apiKeyStatus)
    if (blockedReason) {
      addActivity(blockedReason, 'error')
      addToast(blockedReason, 'error')
      refreshTimeline()
      return
    }
    state.pendingActionId = 'transform:composite'
    state.hasCommandError = false
    refreshCommandButtons()
    refreshStatus()
    addActivity('Running clipboard transform...')
    refreshTimeline()
    try {
      const result = await window.speechToTextApi.runCompositeTransformFromClipboard()
      applyCompositeResult(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transform error'
      state.hasCommandError = true
      addActivity(`Transform failed: ${message}`, 'error')
      addToast(`Transform failed: ${message}`, 'error')
    }
    state.pendingActionId = null
    refreshCommandButtons()
    refreshStatus()
    refreshTimeline()
  }

  compositeButton?.addEventListener('click', () => {
    void runCompositeTransformAction()
  })

  const runSelectedPresetButton = app?.querySelector<HTMLButtonElement>('#settings-run-selected-preset')
  runSelectedPresetButton?.addEventListener('click', () => {
    void runCompositeTransformAction()
  })

  const settingsForm = app?.querySelector<HTMLFormElement>('#settings-form')
  const settingsSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
  const refreshAudioSourcesButton = app?.querySelector<HTMLButtonElement>('#settings-refresh-audio-sources')
  refreshAudioSourcesButton?.addEventListener('click', async () => {
    try {
      await refreshAudioInputSources(true)
      rerenderShellFromState()
      state.currentPage = 'settings'
      refreshRouteTabs()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown audio source refresh error'
      addActivity(`Audio source refresh failed: ${message}`, 'error')
      addToast(`Audio source refresh failed: ${message}`, 'error')
      refreshTimeline()
    }
  })

  const restoreDefaultsButton = app?.querySelector<HTMLButtonElement>('#settings-restore-defaults')
  restoreDefaultsButton?.addEventListener('click', async () => {
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
      const saved = await window.speechToTextApi.setSettings(restored)
      state.settings = saved
      rerenderShellFromState()
      const refreshedSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
      if (refreshedSaveMessage) {
        refreshedSaveMessage.textContent = 'Defaults restored.'
      }
      addActivity('Output and shortcut defaults restored.', 'success')
      addToast('Defaults restored.', 'success')
      refreshTimeline()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown defaults restore error'
      if (settingsSaveMessage) {
        settingsSaveMessage.textContent = `Failed to restore defaults: ${message}`
      }
      addActivity(`Defaults restore failed: ${message}`, 'error')
      addToast(`Defaults restore failed: ${message}`, 'error')
      refreshTimeline()
    }
  })
  const activePresetSelect = app?.querySelector<HTMLSelectElement>('#settings-transform-active-preset')
  activePresetSelect?.addEventListener('change', () => {
    if (!state.settings) {
      return
    }
    state.settings = {
      ...state.settings,
      transformation: {
        ...state.settings.transformation,
        activePresetId: activePresetSelect.value
      }
    }
    rerenderShellFromState()
  })

  const addPresetButton = app?.querySelector<HTMLButtonElement>('#settings-preset-add')
  addPresetButton?.addEventListener('click', () => {
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
  })

  const removePresetButton = app?.querySelector<HTMLButtonElement>('#settings-preset-remove')
  removePresetButton?.addEventListener('click', () => {
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
    const activePresetId = app?.querySelector<HTMLSelectElement>('#settings-transform-active-preset')?.value
    const remaining = presets.filter((preset) => preset.id !== activePresetId)
    const fallbackId = remaining[0].id
    const defaultPresetId =
      state.settings.transformation.defaultPresetId === activePresetId
        ? fallbackId
        : state.settings.transformation.defaultPresetId
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
  })

  settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!state.settings) {
      return
    }

    const activePresetId = app?.querySelector<HTMLSelectElement>('#settings-transform-active-preset')?.value ?? ''
    const defaultPresetId = app?.querySelector<HTMLSelectElement>('#settings-transform-default-preset')?.value ?? ''
    const activePreset = resolveTransformationPreset(state.settings, activePresetId || state.settings.transformation.activePresetId)
    const updatedActivePreset = {
      ...activePreset,
      name: app?.querySelector<HTMLInputElement>('#settings-transform-preset-name')?.value.trim() || activePreset.name,
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
        presets: updatedPresets
      },
      shortcuts: {
        ...state.settings.shortcuts,
        startRecording:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-start-recording')?.value.trim() || 'Cmd+Opt+R',
        stopRecording: app?.querySelector<HTMLInputElement>('#settings-shortcut-stop-recording')?.value.trim() || 'Cmd+Opt+S',
        toggleRecording:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-toggle-recording')?.value.trim() || 'Cmd+Opt+T',
        cancelRecording:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-cancel-recording')?.value.trim() || 'Cmd+Opt+C',
        runTransform: app?.querySelector<HTMLInputElement>('#settings-shortcut-run-transform')?.value.trim() || 'Cmd+Opt+L',
        runTransformOnSelection:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-run-transform-selection')?.value.trim() || 'Cmd+Opt+K',
        pickTransformation:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-pick-transform')?.value.trim() || 'Cmd+Opt+P',
        changeTransformationDefault:
          app?.querySelector<HTMLInputElement>('#settings-shortcut-change-default-transform')?.value.trim() || 'Cmd+Opt+M'
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
      const saved = await window.speechToTextApi.setSettings(nextSettings)
      state.settings = saved
      rerenderShellFromState()
      const refreshedSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
      if (refreshedSaveMessage) {
        refreshedSaveMessage.textContent = 'Settings saved.'
      }
      addActivity('Settings updated.', 'success')
      addToast('Settings saved.', 'success')
      refreshTimeline()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown settings save error'
      if (settingsSaveMessage) {
        settingsSaveMessage.textContent = `Failed to save settings: ${message}`
      }
      addActivity(`Settings save failed: ${message}`, 'error')
      addToast(`Settings save failed: ${message}`, 'error')
      refreshTimeline()
    }
  })

  const apiKeysForm = app?.querySelector<HTMLFormElement>('#api-keys-form')
  const apiKeysSaveMessage = app?.querySelector<HTMLElement>('#api-keys-save-message')
  const visibilityToggles = app?.querySelectorAll<HTMLButtonElement>('[data-api-key-visibility-toggle]') ?? []
  for (const toggle of visibilityToggles) {
    toggle.addEventListener('click', () => {
      const provider = toggle.dataset.apiKeyVisibilityToggle as ApiKeyProvider | undefined
      if (!provider) {
        return
      }
      state.apiKeyVisibility[provider] = !state.apiKeyVisibility[provider]
      const input = app?.querySelector<HTMLInputElement>(`#settings-api-key-${provider}`)
      const nextVisible = state.apiKeyVisibility[provider]
      if (input) {
        input.type = nextVisible ? 'text' : 'password'
      }
      toggle.textContent = nextVisible ? 'Hide' : 'Show'
    })
  }

  const testButtons = app?.querySelectorAll<HTMLButtonElement>('[data-api-key-test]') ?? []
  for (const button of testButtons) {
    button.addEventListener('click', async () => {
      const provider = button.dataset.apiKeyTest as ApiKeyProvider | undefined
      if (!provider) {
        return
      }
      const input = app?.querySelector<HTMLInputElement>(`#settings-api-key-${provider}`)
      const candidateValue = input?.value.trim() ?? ''
      const statusNode = app?.querySelector<HTMLElement>(`#api-key-test-status-${provider}`)
      button.disabled = true
      if (statusNode) {
        statusNode.textContent = 'Testing connection...'
      }
      try {
        const result = await window.speechToTextApi.testApiKeyConnection(provider, candidateValue)
        state.apiKeyTestStatus[provider] = `${result.status === 'success' ? 'Success' : 'Failed'}: ${result.message}`
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown API key test error'
        state.apiKeyTestStatus[provider] = `Failed: ${message}`
      } finally {
        button.disabled = false
        if (statusNode) {
          statusNode.textContent = state.apiKeyTestStatus[provider]
        }
      }
    })
  }

  apiKeysForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const entries: Array<{ provider: ApiKeyProvider; value: string }> = [
      { provider: 'groq', value: app?.querySelector<HTMLInputElement>('#settings-api-key-groq')?.value.trim() ?? '' },
      {
        provider: 'elevenlabs',
        value: app?.querySelector<HTMLInputElement>('#settings-api-key-elevenlabs')?.value.trim() ?? ''
      },
      { provider: 'google', value: app?.querySelector<HTMLInputElement>('#settings-api-key-google')?.value.trim() ?? '' }
    ]

    const toSave = entries.filter((entry) => entry.value.length > 0)
    if (toSave.length === 0) {
      if (apiKeysSaveMessage) {
        apiKeysSaveMessage.textContent = 'Enter at least one API key to save.'
      }
      for (const entry of entries) {
        state.apiKeySaveStatus[entry.provider] = ''
      }
      addToast('Enter at least one API key to save.', 'error')
      return
    }

    try {
      await Promise.all(toSave.map((entry) => window.speechToTextApi.setApiKey(entry.provider, entry.value)))
      state.apiKeyStatus = await window.speechToTextApi.getApiKeyStatus()
      for (const entry of entries) {
        state.apiKeySaveStatus[entry.provider] = toSave.some((saved) => saved.provider === entry.provider) ? 'Saved.' : ''
      }
      rerenderShellFromState()
      const refreshedMessage = app?.querySelector<HTMLElement>('#api-keys-save-message')
      if (refreshedMessage) {
        refreshedMessage.textContent = 'API keys saved.'
      }
      addActivity(`Saved ${toSave.length} API key value(s).`, 'success')
      addToast('API keys saved.', 'success')
      refreshTimeline()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown API key save error'
      for (const entry of entries) {
        if (toSave.some((saved) => saved.provider === entry.provider)) {
          state.apiKeySaveStatus[entry.provider] = `Failed: ${message}`
          const providerStatus = app?.querySelector<HTMLElement>(`#api-key-save-status-${entry.provider}`)
          if (providerStatus) {
            providerStatus.textContent = state.apiKeySaveStatus[entry.provider]
          }
        }
      }
      if (apiKeysSaveMessage) {
        apiKeysSaveMessage.textContent = `Failed to save API keys: ${message}`
      }
      addActivity(`API key save failed: ${message}`, 'error')
      addToast(`API key save failed: ${message}`, 'error')
      refreshTimeline()
    }
  })

  const routeTabs = app?.querySelectorAll<HTMLButtonElement>('[data-route-tab]') ?? []
  for (const tab of routeTabs) {
    tab.addEventListener('click', () => {
      const route = tab.dataset.routeTab as AppPage | undefined
      if (!route) {
        return
      }
      state.currentPage = route
      refreshRouteTabs()
    })
  }

  const routeLinks = app?.querySelectorAll<HTMLButtonElement>('[data-route-target]') ?? []
  for (const link of routeLinks) {
    link.addEventListener('click', () => {
      const route = link.dataset.routeTarget as AppPage | undefined
      if (!route) {
        return
      }
      state.currentPage = route
      refreshRouteTabs()
    })
  }

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
      refreshTimeline()
    })
    state.hotkeyErrorListenerAttached = true
  }
}

const refreshTimeline = (): void => {
}

const rerenderShellFromState = (): void => {
  if (!app || !state.settings) {
    return
  }

  app.innerHTML = renderShell(state.ping, state.settings, state.apiKeyStatus)
  refreshTimeline()
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
    state.apiKeyStatus = apiKeyStatus
    await refreshAudioInputSources()

    app.innerHTML = renderShell(state.ping, settings, state.apiKeyStatus)
    addActivity('Settings loaded from main process.', 'success')
    refreshTimeline()
    refreshStatus()
    refreshCommandButtons()
    refreshToasts()
    refreshRouteTabs()
    wireActions()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown initialization error'
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

void render()
