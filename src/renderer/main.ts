import './styles.css'
import { DEFAULT_SETTINGS, type Settings, type TerminalJobStatus } from '../shared/domain'
import type {
  ApiKeyProvider,
  ApiKeyStatusSnapshot,
  AudioInputSource,
  CompositeTransformResult,
  HistoryRecordSnapshot,
  RecordingCommand
} from '../shared/ipc'
import { appendActivityItem, type ActivityItem } from './activity-feed'
import { toHistoryPreview } from './history-preview'

const app = document.querySelector<HTMLDivElement>('#app')

type ActivityFilter = 'all' | ActivityItem['tone']
type HistoryFilter = 'all' | TerminalJobStatus
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

const historyFilters: HistoryFilter[] = [
  'all',
  'succeeded',
  'capture_failed',
  'transcription_failed',
  'transformation_failed',
  'output_failed_partial'
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
  activityFilter: 'all' as ActivityFilter,
  historyRecords: [] as HistoryRecordSnapshot[],
  historyFilter: 'all' as HistoryFilter,
  historyQuery: '',
  historyLoading: false,
  historyHasLoaded: false,
  pendingActionId: null as string | null,
  activityCounter: 0,
  toasts: [] as ToastItem[],
  toastCounter: 0,
  toastTimers: new Map<number, ReturnType<typeof setTimeout>>(),
  lastTransformSummary: 'No transformation run yet.',
  transformStatusListenerAttached: false,
  audioInputSources: [] as AudioInputSource[]
}

const formatTone = (tone: ActivityItem['tone']): string => tone[0].toUpperCase() + tone.slice(1)
const formatTerminalStatus = (status: TerminalJobStatus): string => status.replaceAll('_', ' ')
const formatHistoryFilter = (status: HistoryFilter): string =>
  status === 'all' ? 'all' : formatTerminalStatus(status)
const formatIsoTime = (iso: string): string => new Date(iso).toLocaleString()

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

const formatToggle = (value: boolean): string => (value ? 'On' : 'Off')
const checkedAttr = (value: boolean): string => (value ? 'checked' : '')
const formatApiKeyStatus = (exists: boolean): string => (exists ? 'Saved' : 'Not set')
const resolveTransformationPreset = (settings: Settings, presetId: string) =>
  settings.transformation.presets.find((preset) => preset.id === presetId) ?? settings.transformation.presets[0]
const buildShortcutContract = (settings: Settings): ShortcutBinding[] => [
  { action: 'Start recording', combo: settings.shortcuts.startRecording },
  { action: 'Stop recording', combo: settings.shortcuts.stopRecording },
  { action: 'Toggle recording', combo: settings.shortcuts.toggleRecording },
  { action: 'Cancel recording', combo: settings.shortcuts.cancelRecording },
  { action: 'Run transform', combo: settings.shortcuts.runTransform },
  { action: 'Pick transformation', combo: settings.shortcuts.pickTransformation },
  { action: 'Change transformation default', combo: settings.shortcuts.changeTransformationDefault }
]

const getTransformBlockedReason = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string | null => {
  if (!settings.transformation.enabled) {
    return 'Transformation is disabled. Enable it in Settings > Transformation.'
  }
  if (!apiKeyStatus.google) {
    return 'Google API key is missing. Add it in Settings > Provider API Keys.'
  }
  return null
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

const renderRecordingPanel = (settings: Settings): string => `
  <article class="card controls" data-stagger style="--delay:100ms">
    <div class="panel-head">
      <h2>Recording Controls</h2>
      <span class="status-dot" id="command-status-dot" role="status" aria-live="polite" aria-atomic="true">Idle</span>
    </div>
    <p class="muted">Manual mode commands from v1 contract.</p>
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

const renderTransformPanel = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot,
  lastTransformSummary: string
): string => `
  ${(() => {
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
  })()}
`

const renderSettingsPanel = (settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string => `
  ${(() => {
    const activePreset = resolveTransformationPreset(settings, settings.transformation.activePresetId)
    const sources = state.audioInputSources.length > 0 ? state.audioInputSources : [{ id: 'system_default', label: 'System Default Microphone' }]
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
          <span>Active preset</span>
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
          <span>Default preset</span>
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
          <button type="button" id="settings-preset-add">Add Preset</button>
          <button type="button" id="settings-preset-remove">Remove Active Preset</button>
          <button type="button" id="settings-run-selected-preset">Run Selected Preset</button>
        </div>
        <label class="text-row">
          <span>Preset name</span>
          <input id="settings-transform-preset-name" type="text" value="${escapeHtml(activePreset?.name ?? 'Default')}" />
        </label>
        <label class="text-row">
          <span>Preset model</span>
          <select id="settings-transform-preset-model">
            <option value="gemini-1.5-flash-8b" ${(activePreset?.model ?? 'gemini-1.5-flash-8b') === 'gemini-1.5-flash-8b' ? 'selected' : ''}>gemini-1.5-flash-8b</option>
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
          <input id="settings-shortcut-start-recording" type="text" value="${escapeHtml(settings.shortcuts.startRecording)}" />
        </label>
        <label class="text-row">
          <span>Stop recording shortcut</span>
          <input id="settings-shortcut-stop-recording" type="text" value="${escapeHtml(settings.shortcuts.stopRecording)}" />
        </label>
        <label class="text-row">
          <span>Toggle recording shortcut</span>
          <input id="settings-shortcut-toggle-recording" type="text" value="${escapeHtml(settings.shortcuts.toggleRecording)}" />
        </label>
        <label class="text-row">
          <span>Cancel recording shortcut</span>
          <input id="settings-shortcut-cancel-recording" type="text" value="${escapeHtml(settings.shortcuts.cancelRecording)}" />
        </label>
        <label class="text-row">
          <span>Run transform shortcut</span>
          <input id="settings-shortcut-run-transform" type="text" value="${escapeHtml(settings.shortcuts.runTransform)}" />
        </label>
        <label class="text-row">
          <span>Pick transformation shortcut</span>
          <input id="settings-shortcut-pick-transform" type="text" value="${escapeHtml(settings.shortcuts.pickTransformation)}" />
        </label>
        <label class="text-row">
          <span>Change default transformation shortcut</span>
          <input id="settings-shortcut-change-default-transform" type="text" value="${escapeHtml(settings.shortcuts.changeTransformationDefault)}" />
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

const renderOutputMatrixPanel = (settings: Settings): string => `
  <article class="card matrix" data-stagger style="--delay:280ms">
    <h2>Output Matrix</h2>
    <table>
      <thead><tr><th>Output</th><th>Copy</th><th>Paste</th></tr></thead>
      <tbody>
        <tr>
          <td>Transcript</td>
          <td>${formatToggle(settings.output.transcript.copyToClipboard)}</td>
          <td>${formatToggle(settings.output.transcript.pasteAtCursor)}</td>
        </tr>
        <tr>
          <td>Transformed</td>
          <td>${formatToggle(settings.output.transformed.copyToClipboard)}</td>
          <td>${formatToggle(settings.output.transformed.pasteAtCursor)}</td>
        </tr>
      </tbody>
    </table>
  </article>
`

const renderActivity = (): string =>
  state.activity
    .filter((item) => (state.activityFilter === 'all' ? true : item.tone === state.activityFilter))
    .map(
      (item) => `
      <li class="timeline-item timeline-${item.tone}" data-id="${item.id}">
        <span class="timeline-time">${escapeHtml(item.createdAt)}</span>
        <span class="timeline-pill">${formatTone(item.tone)}</span>
        <span class="timeline-message">${escapeHtml(item.message)}</span>
      </li>`
    )
    .join('')

const renderActivityPanel = (): string => `
  <article class="card timeline" data-stagger style="--delay:340ms">
    <div class="panel-head">
      <h2 id="activity-title">Session Activity</h2>
      <div class="filter-group" role="group" aria-label="Activity filter">
        <button type="button" class="filter-chip is-active" data-activity-filter="all">All</button>
        <button type="button" class="filter-chip" data-activity-filter="info">Info</button>
        <button type="button" class="filter-chip" data-activity-filter="success">Success</button>
        <button type="button" class="filter-chip" data-activity-filter="error">Error</button>
      </div>
    </div>
    <form id="operator-note-form" class="note-form" novalidate>
      <input
        id="operator-note-input"
        type="text"
        maxlength="120"
        placeholder="Add operator note to timeline..."
        aria-describedby="operator-note-error"
      />
      <button type="submit">Add Note</button>
      <button type="button" id="clear-activity">Clear</button>
    </form>
    <p id="operator-note-error" class="inline-error" aria-live="polite"></p>
    <ul id="activity-timeline" class="timeline-list" aria-labelledby="activity-title">${renderActivity()}</ul>
  </article>
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

const renderHistoryRecords = (): string => {
  if (state.historyLoading) {
    return '<li class="history-empty">Loading history...</li>'
  }

  if (!state.historyHasLoaded) {
    return '<li class="history-empty">Press Refresh to load persisted history.</li>'
  }

  const query = state.historyQuery.trim().toLowerCase()
  const visible = state.historyRecords.filter((record) => {
    const matchesStatus = state.historyFilter === 'all' || state.historyFilter === record.terminalStatus
    if (!matchesStatus) {
      return false
    }

    if (!query) {
      return true
    }

    const blob = `${record.jobId} ${record.terminalStatus} ${record.transcriptText ?? ''} ${record.transformedText ?? ''}`.toLowerCase()
    return blob.includes(query)
  })

  if (visible.length === 0) {
    return '<li class="history-empty">No persisted jobs match this filter.</li>'
  }

  return visible
    .map(
      (record) => `
        <li class="history-item status-${record.terminalStatus}">
          <div class="history-head">
            <span class="history-id">${escapeHtml(record.jobId)}</span>
            <span class="history-status">${escapeHtml(formatTerminalStatus(record.terminalStatus))}</span>
          </div>
          <p class="history-text"><strong>Transcript:</strong> ${escapeHtml(toHistoryPreview(record.transcriptText))}</p>
          <p class="history-text muted-text"><strong>Transformed:</strong> ${escapeHtml(toHistoryPreview(record.transformedText))}</p>
          ${
            record.failureDetail
              ? `<p class="history-text inline-error"><strong>Failure:</strong> ${escapeHtml(record.failureDetail)}</p>`
              : ''
          }
          <p class="history-meta">Captured ${escapeHtml(formatIsoTime(record.capturedAt))}</p>
        </li>
      `
    )
    .join('')
}

const renderHistoryPanel = (): string => `
  <article class="card history" data-stagger style="--delay:460ms">
    <div class="panel-head">
      <h2 id="history-title">Processing History</h2>
      <button type="button" id="history-refresh">Refresh</button>
    </div>
    <p class="muted">Persisted completed jobs from the main process history store.</p>
    <div class="history-controls">
      <select id="history-status-filter" aria-label="History status filter">
        ${historyFilters
          .map(
            (status) =>
              `<option value="${status}" ${status === state.historyFilter ? 'selected' : ''}>${escapeHtml(formatHistoryFilter(status))}</option>`
          )
          .join('')}
      </select>
      <input id="history-search" type="search" placeholder="Search job id or text..." />
    </div>
    <ul id="history-list" class="history-list" aria-labelledby="history-title">${renderHistoryRecords()}</ul>
  </article>
`

const renderShell = (pong: string, settings: Settings, apiKeyStatus: ApiKeyStatusSnapshot): string => `
  <main class="shell">
    ${renderStatusHero(pong, settings)}
    ${renderTopNav()}
    <section class="grid page-home" data-page="home">
      ${renderRecordingPanel(settings)}
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
  if (state.pendingActionId === null) {
    node.textContent = 'Idle'
    node.classList.remove('is-busy')
    return
  }
  node.textContent = 'Busy'
  node.classList.add('is-busy')
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

const refreshFilterChips = (): void => {
  const chips = app?.querySelectorAll<HTMLButtonElement>('[data-activity-filter]') ?? []
  for (const chip of chips) {
    const filter = chip.dataset.activityFilter as ActivityFilter | undefined
    const active = filter === state.activityFilter
    chip.classList.toggle('is-active', active)
    chip.setAttribute('aria-pressed', active ? 'true' : 'false')
  }
}

const refreshHistoryControls = (): void => {
  const statusFilter = app?.querySelector<HTMLSelectElement>('#history-status-filter')
  if (statusFilter) {
    statusFilter.value = state.historyFilter
  }

  const search = app?.querySelector<HTMLInputElement>('#history-search')
  if (search && search.value !== state.historyQuery) {
    search.value = state.historyQuery
  }

  const refreshButton = app?.querySelector<HTMLButtonElement>('#history-refresh')
  if (refreshButton) {
    refreshButton.disabled = state.historyLoading
    refreshButton.textContent = state.historyLoading ? 'Refreshing...' : 'Refresh'
  }
}

const refreshHistoryList = (): void => {
  const historyList = app?.querySelector<HTMLUListElement>('#history-list')
  if (!historyList) {
    return
  }
  historyList.innerHTML = renderHistoryRecords()
}

const loadHistory = async (announce = false): Promise<void> => {
  state.historyLoading = true
  refreshHistoryControls()
  refreshHistoryList()

  try {
    const records = await window.speechToTextApi.getHistory()
    state.historyHasLoaded = true
    state.historyRecords = records.slice(0, 10)
    if (announce) {
      addActivity(`Loaded ${state.historyRecords.length} persisted history records.`, 'success')
      const latestDiagnostic = state.historyRecords.find((record) => record.terminalStatus === 'transcription_failed' && record.failureDetail)
      if (latestDiagnostic?.failureDetail) {
        addToast(latestDiagnostic.failureDetail, 'error')
      }
      refreshTimeline()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown history retrieval error'
    addActivity(`History refresh failed: ${message}`, 'error')
    addToast(`History refresh failed: ${message}`, 'error')
    refreshTimeline()
  } finally {
    state.historyLoading = false
    refreshHistoryControls()
    refreshHistoryList()
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
      refreshCommandButtons()
      refreshStatus()
      addActivity(`Running ${command}...`)
      refreshTimeline()
      try {
        await window.speechToTextApi.runRecordingCommand(command)
        addActivity(`${command} dispatched`, 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown recording error'
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
      state.lastTransformSummary = `Last transform: success (${new Date().toLocaleTimeString()})`
      addActivity(`Transform complete: ${result.message}`, 'success')
      addToast(`Transform complete: ${result.message}`, 'success')
    } else {
      state.lastTransformSummary = `Last transform: failed (${new Date().toLocaleTimeString()}) - ${result.message}`
      addActivity(`Transform error: ${result.message}`, 'error')
      addToast(`Transform error: ${result.message}`, 'error')
    }
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
    refreshCommandButtons()
    refreshStatus()
    addActivity('Running clipboard transform...')
    refreshTimeline()
    try {
      await window.speechToTextApi.runCompositeTransformFromClipboard()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transform error'
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

  const filterButtons = app?.querySelectorAll<HTMLButtonElement>('[data-activity-filter]') ?? []
  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      const filter = button.dataset.activityFilter as ActivityFilter | undefined
      if (!filter) {
        return
      }
      state.activityFilter = filter
      refreshFilterChips()
      refreshTimeline()
    })
  }

  const settingsForm = app?.querySelector<HTMLFormElement>('#settings-form')
  const settingsSaveMessage = app?.querySelector<HTMLElement>('#settings-save-message')
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
      model: 'gemini-1.5-flash-8b' as const,
      systemPrompt: '',
      userPrompt: '',
      shortcut: state.settings.shortcuts.runTransform
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
      msg.textContent = 'Preset added. Save settings to persist.'
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
        msg.textContent = 'At least one preset is required.'
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
      msg.textContent = 'Preset removed. Save settings to persist.'
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

    const nextSettings: Settings = {
      ...state.settings,
      recording: {
        ...state.settings.recording,
        ffmpegEnabled: state.settings.recording.ffmpegEnabled,
        device: app?.querySelector<HTMLSelectElement>('#settings-recording-device')?.value ?? 'system_default',
        autoDetectAudioSource: (app?.querySelector<HTMLSelectElement>('#settings-recording-device')?.value ?? 'system_default') === 'system_default',
        detectedAudioSource: app?.querySelector<HTMLSelectElement>('#settings-recording-device')?.value ?? 'system_default'
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
}

const refreshTimeline = (): void => {
  const timeline = app?.querySelector<HTMLUListElement>('#activity-timeline')
  if (!timeline) {
    return
  }
  const content = renderActivity()
  timeline.innerHTML = content || '<li class="timeline-empty">No activity for this filter.</li>'
}

const rerenderShellFromState = (): void => {
  if (!app || !state.settings) {
    return
  }

  app.innerHTML = renderShell(state.ping, state.settings, state.apiKeyStatus)
  refreshTimeline()
  refreshFilterChips()
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
    const [pong, settings, apiKeyStatus, audioInputSources] = await Promise.all([
      window.speechToTextApi.ping(),
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getApiKeyStatus(),
      window.speechToTextApi.getAudioInputSources()
    ])
    state.ping = pong
    state.settings = settings
    state.apiKeyStatus = apiKeyStatus
    state.audioInputSources = audioInputSources

    app.innerHTML = renderShell(state.ping, settings, state.apiKeyStatus)
    addActivity('Settings loaded from main process.', 'success')
    refreshTimeline()
    refreshFilterChips()
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
