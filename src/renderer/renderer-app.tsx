/*
Where: src/renderer/renderer-app.tsx
What: React-owned renderer app orchestration for Home + Settings surfaces.
Why: Replace legacy string-template shell rendering with a React-owned JSX tree;
     remove the legacy-renderer shim; move Enter-to-save behavior into React event ownership.

Phase 6 splits (tsx-migration-completion-work-plan.md):
  - AppShell UI tree → app-shell-react.tsx
  - IPC listener wiring → ipc-listeners.ts
  - Settings/preset mutations → settings-mutations.ts
  - Native recording lifecycle → native-recording.ts
This file is now the thin orchestration layer: boot, state, autosave, and render wiring.
*/

import { type OutputTextSource, type Settings } from '../shared/domain'
import { logStructured } from '../shared/error-logging'
import { buildOutputSettingsFromSelection } from '../shared/output-selection'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type {
  ApiKeyProvider,
  ApiKeyStatusSnapshot,
  AudioInputSource,
  CompositeTransformResult,
  HotkeyErrorNotification,
  RecordingCommandDispatch
} from '../shared/ipc'
import { appendTerminalActivityItem, type ActivityItem } from './activity-feed'
import { AppShell, type AppShellCallbacks, type AppTab, type ToastItem } from './app-shell-react'
import { resolveTransformBlockedMessage } from './blocked-control'
import { applyHotkeyErrorNotification } from './hotkey-error'
import { wireIpcListeners, unwireIpcListeners } from './ipc-listeners'
import {
  isNativeRecording,
  refreshAudioInputSources,
  handleRecordingCommandDispatch,
  resetRecordingState,
  type NativeRecordingDeps
} from './native-recording'
import { createSettingsMutations } from './settings-mutations'
import { type SettingsValidationErrors } from './settings-validation'

let app: HTMLDivElement | null = null
let appRoot: Root | null = null

const state = {
  activeTab: 'activity' as AppTab,
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
  activity: [] as ActivityItem[],
  pendingActionId: null as string | null,
  activityCounter: 0,
  toasts: [] as ToastItem[],
  toastCounter: 0,
  toastTimers: new Map<number, ReturnType<typeof setTimeout>>(),
  settingsSaveMessage: '',
  audioInputSources: [] as AudioInputSource[],
  audioSourceHint: '',
  hasCommandError: false,
  settingsValidationErrors: {} as SettingsValidationErrors,
  persistedSettings: null as Settings | null,
  autosaveTimer: null as ReturnType<typeof setTimeout> | null,
  autosaveGeneration: 0
}

const NON_SECRET_AUTOSAVE_DEBOUNCE_MS = 450
const HOME_API_KEY_STATUS_REFRESH_ATTEMPTS = 3
const HOME_API_KEY_STATUS_REFRESH_DELAY_MS = 250
const TOAST_AUTO_DISMISS_MS = 6000
const TOAST_MAX_VISIBLE = 4

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
  void message
  void tone
}

const addTerminalActivity = (message: string, tone: ActivityItem['tone'] = 'info'): void => {
  state.activity = appendTerminalActivityItem(state.activity, {
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
  if (state.toasts.length > TOAST_MAX_VISIBLE) {
    const overflow = state.toasts.splice(0, state.toasts.length - TOAST_MAX_VISIBLE)
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
  }, TOAST_AUTO_DISMISS_MS)
  state.toastTimers.set(toast.id, timer)
  rerenderShellFromState()
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

const normalizeTransformationPresetPointers = (settings: Settings): Settings => {
  const { defaultPresetId, lastPickedPresetId, presets } = settings.transformation
  if (presets.length === 0) {
    return settings
  }
  const resolvedDefaultPresetId = presets.some((preset) => preset.id === defaultPresetId)
    ? defaultPresetId
    : presets[0].id
  const resolvedLastPickedPresetId =
    lastPickedPresetId && presets.some((preset) => preset.id === lastPickedPresetId) ? lastPickedPresetId : null

  if (defaultPresetId === resolvedDefaultPresetId && lastPickedPresetId === resolvedLastPickedPresetId) {
    return settings
  }
  return {
    ...settings,
    transformation: {
      ...settings.transformation,
      defaultPresetId: resolvedDefaultPresetId,
      lastPickedPresetId: resolvedLastPickedPresetId
    }
  }
}

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
      state.activeTab = 'settings'
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

const navigateToPage = (tab: AppTab): void => {
  state.activeTab = tab
  rerenderShellFromState()
  // Refresh API key status when navigating to activity tab — the recording panel
  // (always visible in left panel) shows blocking messages that depend on key status.
  if (tab === 'activity') {
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
    addTerminalActivity(result.message, 'success')
    addToast(`Transform complete: ${result.message}`, 'success')
  } else {
    state.hasCommandError = true
    addTerminalActivity(`Transform error: ${result.message}`, 'error')
    addToast(`Transform error: ${result.message}`, 'error')
  }
  rerenderShellFromState()
}

const runRecordingCommandAction = async (command: Parameters<typeof window.speechToTextApi.runRecordingCommand>[0]): Promise<void> => {
  if (state.pendingActionId !== null) {
    return
  }

  state.pendingActionId = `recording:${command}`
  state.hasCommandError = false
  rerenderShellFromState()
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
  rerenderShellFromState()
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
  rerenderShellFromState()
  addActivity('Running clipboard transform...')
  try {
    const result = await window.speechToTextApi.runCompositeTransformFromClipboard()
    applyCompositeResult(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown transform error'
    logRendererError('renderer.run_transform_failed', error)
    state.hasCommandError = true
    addTerminalActivity(`Transform failed: ${message}`, 'error')
    addToast(`Transform failed: ${message}`, 'error')
  }
  state.pendingActionId = null
  rerenderShellFromState()
}

const openSettingsRoute = (): void => {
  state.activeTab = 'settings'
  rerenderShellFromState()
}

const handleSettingsEnterSaveKeydown = (event: ReactKeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'Enter' || event.defaultPrevented || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  if (state.activeTab !== 'settings') {
    return
  }
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  if (!target.closest('[data-settings-form]')) {
    return
  }
  if (target instanceof HTMLTextAreaElement) {
    return
  }
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return
  }
  event.preventDefault()
  void mutations.saveSettingsFromState()
}

// Build the shared deps object for native-recording functions.
// Defined as a getter-style factory so it captures current state references at call time.
const buildRecordingDeps = (): NativeRecordingDeps => ({
  state,
  addActivity,
  addTerminalActivity,
  addToast,
  logError: logRendererError,
  onStateChange: rerenderShellFromState
})

// Lazy-init mutations (after all dep functions are defined above).
// Using a getter so `rerenderShellFromState` is always the live reference.
const mutations = createSettingsMutations({
  state,
  onStateChange: () => rerenderShellFromState(),
  invalidatePendingAutosave,
  setSettingsSaveMessage,
  setSettingsValidationErrors,
  addActivity,
  addToast,
  logError: logRendererError
})

const rerenderShellFromState = (): void => {
  if (!appRoot || !state.settings) {
    return
  }

  // Build callbacks object on each render. This mirrors how inline JSX lambdas work —
  // the functions always read current state/closures when invoked, not when constructed.
  const callbacks: AppShellCallbacks = {
    onNavigate: navigateToPage,
    onRunRecordingCommand: (command) => {
      void runRecordingCommandAction(command)
    },
    onOpenSettings: openSettingsRoute,
    onTestApiKey: (provider, candidateValue) => mutations.runApiKeyConnectionTest(provider, candidateValue),
    onSaveApiKey: (provider, candidateValue) => mutations.saveApiKey(provider, candidateValue),
    onRefreshAudioSources: async () => {
      try {
        await refreshAudioInputSources(buildRecordingDeps(), true)
        rerenderShellFromState()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown audio source refresh error'
        addActivity(`Audio source refresh failed: ${message}`, 'error')
        addToast(`Audio source refresh failed: ${message}`, 'error')
      }
    },
    onSelectRecordingMethod: mutations.patchRecordingMethodDraft,
    onSelectRecordingSampleRate: mutations.patchRecordingSampleRateDraft,
    onSelectRecordingDevice: mutations.patchRecordingDeviceDraft,
    onSelectTranscriptionProvider: (provider) => {
      mutations.applyTranscriptionProviderChange(provider, applyNonSecretAutosavePatch)
    },
    onSelectTranscriptionModel: (model) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        transcription: { ...current.transcription, model }
      }))
    },
    onSelectDefaultPreset: mutations.setDefaultTransformationPreset,
    onSelectDefaultPresetAndSave: mutations.setDefaultTransformationPresetAndSave,
    onChangeDefaultPresetDraft: mutations.patchDefaultTransformationPresetDraft,
    onSavePresetDraft: mutations.saveTransformationPresetDraft,
    onRunSelectedPreset: () => {
      void runCompositeTransformAction()
    },
    onAddPreset: mutations.addTransformationPreset,
    onAddPresetAndSave: mutations.addTransformationPresetAndSave,
    onRemovePreset: mutations.removeTransformationPreset,
    onRemovePresetAndSave: mutations.removeTransformationPresetAndSave,
    onChangeTranscriptionBaseUrlDraft: mutations.patchTranscriptionBaseUrlDraft,
    onChangeTransformationBaseUrlDraft: mutations.patchTransformationBaseUrlDraft,
    onResetTranscriptionBaseUrlDraft: () => {
      mutations.patchTranscriptionBaseUrlDraft('')
      setSettingsValidationErrors({ ...state.settingsValidationErrors, transcriptionBaseUrl: '' })
    },
    onResetTransformationBaseUrlDraft: () => {
      mutations.patchTransformationBaseUrlDraft('')
      setSettingsValidationErrors({ ...state.settingsValidationErrors, transformationBaseUrl: '' })
    },
    onChangeShortcutDraft: mutations.patchShortcutDraft,
    onChangeOutputSelection: (selection: OutputTextSource, destinations) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        output: buildOutputSettingsFromSelection(current.output, selection, destinations)
      }))
    },
    onRestoreDefaults: mutations.restoreOutputAndShortcutsDefaults,
    onSave: mutations.saveSettingsFromState,
    onDismissToast: (toastId) => {
      dismissToast(toastId)
      rerenderShellFromState()
    },
    isNativeRecording,
    handleSettingsEnterSaveKeydown
  }

  appRoot.render(<AppShell state={state} callbacks={callbacks} />)
}

const renderInitializationFailure = (message: string): void => {
  if (!appRoot) {
    return
  }

  appRoot.render(
    <div className="flex h-screen flex-col bg-background items-center justify-center">
      <div className="rounded-lg border bg-card p-6 max-w-sm">
        <p className="text-xs text-muted-foreground mb-1">Renderer Initialization Error</p>
        <p className="text-sm font-semibold">UI failed to initialize</p>
        <p className="text-xs text-muted-foreground mt-2">{message}</p>
      </div>
    </div>
  )
}

const render = async (): Promise<void> => {
  if (!appRoot) {
    return
  }

  addActivity('Renderer booted and waiting for commands.')
  try {
    const [pong, loadedSettings, apiKeyStatus] = await Promise.all([
      window.speechToTextApi.ping(),
      window.speechToTextApi.getSettings(),
      window.speechToTextApi.getApiKeyStatus()
    ])
    const settings = normalizeTransformationPresetPointers(loadedSettings)
    state.ping = pong
    state.settings = settings
    state.persistedSettings = structuredClone(settings)
    state.apiKeyStatus = apiKeyStatus
    await refreshAudioInputSources(buildRecordingDeps())

    rerenderShellFromState()
    addActivity('Settings loaded from main process.', 'success')

    wireIpcListeners({
      onCompositeTransformResult: (result) => applyCompositeResult(result),
      onRecordingCommand: (dispatch: RecordingCommandDispatch) => {
        void handleRecordingCommandDispatch(buildRecordingDeps(), dispatch)
      },
      onHotkeyError: (notification: HotkeyErrorNotification) => {
        applyHotkeyErrorNotification(notification, addActivity, addToast)
      }
    })
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

  unwireIpcListeners()
  appRoot?.unmount()
  appRoot = null
  app = null

  state.activeTab = 'activity'
  state.ping = 'pong'
  state.settings = null
  state.apiKeyStatus = { groq: false, elevenlabs: false, google: false }
  state.apiKeySaveStatus = { groq: '', elevenlabs: '', google: '' }
  state.apiKeyTestStatus = { groq: '', elevenlabs: '', google: '' }
  state.activity = []
  state.pendingActionId = null
  state.activityCounter = 0
  state.toasts = []
  state.toastCounter = 0
  state.settingsSaveMessage = ''
  state.audioInputSources = []
  state.audioSourceHint = ''
  state.hasCommandError = false
  state.settingsValidationErrors = {}
  state.persistedSettings = null
  state.autosaveGeneration = 0

  resetRecordingState()
}
