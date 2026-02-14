import './styles.css'
import type { Settings, TerminalJobStatus } from '../shared/domain'
import type { HistoryRecordSnapshot, RecordingCommand } from '../shared/ipc'
import { appendActivityItem, clearActivityItems, type ActivityItem } from './activity-feed'
import { toHistoryPreview } from './history-preview'

const app = document.querySelector<HTMLDivElement>('#app')

type ActivityFilter = 'all' | ActivityItem['tone']
type HistoryFilter = 'all' | TerminalJobStatus
interface ShortcutBinding {
  action: string
  combo: string
}

const recordingControls: Array<{ command: RecordingCommand; label: string; busyLabel: string }> = [
  { command: 'startRecording', label: 'Start', busyLabel: 'Starting...' },
  { command: 'stopRecording', label: 'Stop', busyLabel: 'Stopping...' },
  { command: 'toggleRecording', label: 'Toggle', busyLabel: 'Toggling...' },
  { command: 'cancelRecording', label: 'Cancel', busyLabel: 'Cancelling...' }
]

const shortcutContract: ShortcutBinding[] = [
  { action: 'Start recording', combo: 'Cmd+Opt+R' },
  { action: 'Stop recording', combo: 'Cmd+Opt+S' },
  { action: 'Toggle recording', combo: 'Cmd+Opt+T' },
  { action: 'Cancel recording', combo: 'Cmd+Opt+C' },
  { action: 'Run transform', combo: 'Cmd+Opt+L' },
  { action: 'Pick transformation', combo: 'Cmd+Opt+P' },
  { action: 'Change transformation', combo: 'Cmd+Opt+M' },
  { action: 'Composite pick+run transform', combo: 'Configurable' }
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
  activity: [] as ActivityItem[],
  activityFilter: 'all' as ActivityFilter,
  historyRecords: [] as HistoryRecordSnapshot[],
  historyFilter: 'all' as HistoryFilter,
  historyQuery: '',
  historyLoading: false,
  historyHasLoaded: false,
  pendingActionId: null as string | null,
  activityCounter: 0
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

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatToggle = (value: boolean): string => (value ? 'On' : 'Off')

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

const renderRecordingPanel = (): string => `
  <article class="card controls" data-stagger style="--delay:100ms">
    <div class="panel-head">
      <h2>Recording Controls</h2>
      <span class="status-dot" id="command-status-dot" role="status" aria-live="polite" aria-atomic="true">Idle</span>
    </div>
    <p class="muted">Manual mode commands from v1 contract.</p>
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

const renderTransformPanel = (): string => `
  <article class="card controls" data-stagger style="--delay:160ms">
    <h2>Transform Shortcut</h2>
    <p class="muted">Flow 5: pick-and-run transform on clipboard text in one action.</p>
    <div class="button-grid single">
      <button
        id="run-composite-transform"
        class="command-button"
        data-action-id="transform:composite"
        data-label="Run Composite Transform"
        data-busy-label="Transforming..."
      >
        Run Composite Transform
      </button>
    </div>
  </article>
`

const renderSettingsPanel = (settings: Settings): string => `
  <article class="card settings" data-stagger style="--delay:220ms">
    <div class="panel-head">
      <h2>Settings Contract Snapshot</h2>
      <input id="settings-filter" class="settings-filter" type="search" placeholder="Filter rows..." />
    </div>
    <dl class="spec-grid" id="settings-grid">
      <div data-settings-row="recording mode ${settings.recording.mode} method ${settings.recording.method}">
        <dt>Recording</dt>
        <dd>${escapeHtml(settings.recording.mode)} via ${escapeHtml(settings.recording.method)}</dd>
      </div>
      <div data-settings-row="transcription provider ${settings.transcription.provider} model ${settings.transcription.model}">
        <dt>Transcription</dt>
        <dd>${escapeHtml(settings.transcription.provider)} / ${escapeHtml(settings.transcription.model)}</dd>
      </div>
      <div data-settings-row="transformation provider ${settings.transformation.provider} model ${settings.transformation.model}">
        <dt>Transformation</dt>
        <dd>${escapeHtml(settings.transformation.provider)} / ${escapeHtml(settings.transformation.model)}</dd>
      </div>
      <div data-settings-row="language ${settings.transcription.outputLanguage} retries ${settings.transcription.networkRetries}">
        <dt>Language / Retries</dt>
        <dd>${escapeHtml(settings.transcription.outputLanguage)} / ${settings.transcription.networkRetries}</dd>
      </div>
    </dl>
  </article>
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

const renderShortcutsPanel = (): string => `
  <article class="card shortcuts" data-stagger style="--delay:400ms">
    <h2>Shortcut Contract</h2>
    <p class="muted">Reference from v1 spec for default operator bindings.</p>
    <ul class="shortcut-list">
      ${shortcutContract
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

const renderShell = (pong: string, settings: Settings): string => `
  <main class="shell">
    ${renderStatusHero(pong, settings)}
    <section class="grid">
      ${renderRecordingPanel()}
      ${renderTransformPanel()}
      ${renderSettingsPanel(settings)}
      ${renderOutputMatrixPanel(settings)}
      ${renderHistoryPanel()}
      ${renderActivityPanel()}
      ${renderShortcutsPanel()}
    </section>
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
      refreshTimeline()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown history retrieval error'
    addActivity(`History refresh failed: ${message}`, 'error')
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
      }
      state.pendingActionId = null
      refreshCommandButtons()
      refreshStatus()
      refreshTimeline()
    })
  }

  const compositeButton = app?.querySelector<HTMLButtonElement>('#run-composite-transform')
  compositeButton?.addEventListener('click', async () => {
    if (state.pendingActionId !== null) {
      return
    }
    state.pendingActionId = 'transform:composite'
    refreshCommandButtons()
    refreshStatus()
    addActivity('Running clipboard transform...')
    refreshTimeline()
    try {
      const result = await window.speechToTextApi.runCompositeTransformFromClipboard()
      if (result.status === 'ok') {
        addActivity(`Transform complete: ${result.message}`, 'success')
      } else {
        addActivity(`Transform error: ${result.message}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transform error'
      addActivity(`Transform failed: ${message}`, 'error')
    }
    state.pendingActionId = null
    refreshCommandButtons()
    refreshStatus()
    refreshTimeline()
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

  const clearButton = app?.querySelector<HTMLButtonElement>('#clear-activity')
  clearButton?.addEventListener('click', () => {
    state.activity = clearActivityItems()
    refreshTimeline()
  })

  const noteForm = app?.querySelector<HTMLFormElement>('#operator-note-form')
  const noteInput = app?.querySelector<HTMLInputElement>('#operator-note-input')
  const noteError = app?.querySelector<HTMLElement>('#operator-note-error')
  noteForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    const note = noteInput?.value.trim() ?? ''
    if (!note) {
      if (noteError) {
        noteError.textContent = 'Note cannot be empty.'
      }
      return
    }
    if (noteError) {
      noteError.textContent = ''
    }
    addActivity(`Operator note: ${note}`, 'info')
    if (noteInput) {
      noteInput.value = ''
    }
    refreshTimeline()
  })

  const settingsFilterInput = app?.querySelector<HTMLInputElement>('#settings-filter')
  settingsFilterInput?.addEventListener('input', () => {
    const query = (settingsFilterInput.value || '').trim().toLowerCase()
    const rows = app?.querySelectorAll<HTMLElement>('[data-settings-row]') ?? []
    for (const row of rows) {
      const searchable = (row.dataset.settingsRow || '').toLowerCase()
      row.hidden = query.length > 0 && !searchable.includes(query)
    }
  })

  const historyRefresh = app?.querySelector<HTMLButtonElement>('#history-refresh')
  historyRefresh?.addEventListener('click', () => {
    void loadHistory(true)
  })

  const historyStatusFilter = app?.querySelector<HTMLSelectElement>('#history-status-filter')
  historyStatusFilter?.addEventListener('change', () => {
    state.historyFilter = (historyStatusFilter.value as HistoryFilter) || 'all'
    refreshHistoryControls()
    refreshHistoryList()
  })

  const historySearch = app?.querySelector<HTMLInputElement>('#history-search')
  historySearch?.addEventListener('input', () => {
    state.historyQuery = (historySearch.value || '').trim()
    refreshHistoryList()
  })
}

const refreshTimeline = (): void => {
  const timeline = app?.querySelector<HTMLUListElement>('#activity-timeline')
  if (!timeline) {
    return
  }
  const content = renderActivity()
  timeline.innerHTML = content || '<li class="timeline-empty">No activity for this filter.</li>'
}

const render = async (): Promise<void> => {
  if (!app) {
    return
  }

  addActivity('Renderer booted and waiting for commands.')
  try {
    const [pong, settings] = await Promise.all([window.speechToTextApi.ping(), window.speechToTextApi.getSettings()])

    app.innerHTML = renderShell(pong, settings)
    addActivity('Settings loaded from main process.', 'success')
    refreshTimeline()
    refreshFilterChips()
    refreshHistoryControls()
    refreshHistoryList()
    refreshStatus()
    refreshCommandButtons()
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
