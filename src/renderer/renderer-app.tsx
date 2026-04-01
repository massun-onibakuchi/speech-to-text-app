/*
Where: src/renderer/renderer-app.tsx
What: React-owned renderer app orchestration for Home + Settings surfaces.
Why: Replace legacy string-template shell rendering with a React-owned JSX tree;
     remove the legacy-renderer shim; centralize non-secret settings autosave in renderer state.

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
import { COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE } from '../shared/ipc'
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
import { type SettingsValidationErrors, type SettingsValidationInput, validateSettingsFormInput } from './settings-validation'
import { resolveDetectedAudioSource } from './recording-device'
import { canMergeExternalSettings, mergeExternalSettingsIntoLocalDraft } from './external-settings-merge'

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
  activity: [] as ActivityItem[],
  pendingActionId: null as string | null,
  activityCounter: 0,
  toasts: [] as ToastItem[],
  toastCounter: 0,
  toastTimers: new Map<number, ReturnType<typeof setTimeout>>(),
  audioInputSources: [] as AudioInputSource[],
  audioSourceHint: '',
  hasCommandError: false,
  isShortcutCaptureActive: false,
  hasUnsavedProfileDraft: false,
  hasAutosaveValidationToast: false,
  settingsValidationErrors: {} as SettingsValidationErrors,
  persistedSettings: null as Settings | null,
  autosaveTimer: null as ReturnType<typeof setTimeout> | null,
  autosaveGeneration: 0,
  dictionarySaveChain: Promise.resolve() as Promise<void>
}

const NON_SECRET_AUTOSAVE_DEBOUNCE_MS = 450
const HOME_API_KEY_STATUS_REFRESH_ATTEMPTS = 3
const HOME_API_KEY_STATUS_REFRESH_DELAY_MS = 250
const TOAST_AUTO_DISMISS_MS = 6000
const TOAST_MAX_VISIBLE = 4
const BEFORE_UNLOAD_WARNING_TEXT = 'You have unsaved profile changes.'

const onBeforeUnload = (event: BeforeUnloadEvent): string => {
  event.preventDefault()
  event.returnValue = BEFORE_UNLOAD_WARNING_TEXT
  return BEFORE_UNLOAD_WARNING_TEXT
}
let isBeforeUnloadBound = false

const syncBeforeUnloadBinding = (): void => {
  if (state.hasUnsavedProfileDraft && !isBeforeUnloadBound) {
    window.addEventListener('beforeunload', onBeforeUnload)
    isBeforeUnloadBound = true
    return
  }
  if (!state.hasUnsavedProfileDraft && isBeforeUnloadBound) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    isBeforeUnloadBound = false
  }
}

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

const buildSettingsValidationInput = (settings: Settings): SettingsValidationInput => {
  const defaultPreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
    settings.transformation.presets[0]

  return {
    presetNameRaw: defaultPreset?.name ?? '',
    systemPromptRaw: defaultPreset?.systemPrompt ?? '',
    userPromptRaw: defaultPreset?.userPrompt ?? '',
    shortcuts: {
      toggleRecording: settings.shortcuts.toggleRecording,
      cancelRecording: settings.shortcuts.cancelRecording,
      runTransform: settings.shortcuts.runTransform,
      runTransformOnSelection: settings.shortcuts.runTransformOnSelection,
      pickTransformation: settings.shortcuts.pickTransformation,
      changeTransformationDefault: settings.shortcuts.changeTransformationDefault,
      openScratchSpace: settings.shortcuts.openScratchSpace
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
    addToast('Settings autosaved.', 'success')
  } catch (error) {
    if (generation !== state.autosaveGeneration) {
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown autosave error'
    logRendererError('renderer.settings_autosave_failed', error)
    const rollback = state.persistedSettings ? structuredClone(state.persistedSettings) : null
    if (rollback) {
      state.settings = rollback
    }
    rerenderShellFromState()
    addToast(`Autosave failed: ${message}. Reverted unsaved changes.`, 'error')
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
  const candidate = updater(state.settings)
  const validation = validateSettingsFormInput(buildSettingsValidationInput(candidate))
  state.settings = candidate
  state.settingsValidationErrors = validation.errors
  if (Object.keys(validation.errors).length > 0) {
    invalidatePendingAutosave()
    if (!state.hasAutosaveValidationToast) {
      addToast('Fix the highlighted validation errors before autosave.', 'error')
      state.hasAutosaveValidationToast = true
    }
    rerenderShellFromState()
    return
  }
  state.hasAutosaveValidationToast = false
  scheduleNonSecretAutosave()
  rerenderShellFromState()
}

const syncDictionaryEntriesIntoCurrentSettings = (entries: Settings['correction']['dictionary']['entries']): void => {
  if (!state.settings) {
    return
  }
  state.settings = {
    ...state.settings,
    correction: {
      ...state.settings.correction,
      dictionary: {
        ...state.settings.correction.dictionary,
        entries
      }
    }
  }
}

const reschedulePendingNonSecretAutosaveIfNeeded = (): void => {
  if (!state.settings || !state.persistedSettings) {
    return
  }
  if (settingsEquals(state.settings, state.persistedSettings)) {
    return
  }
  if (Object.keys(state.settingsValidationErrors).length > 0) {
    return
  }
  scheduleNonSecretAutosave()
}

const saveDictionaryEntries = async (
  nextEntries: Settings['correction']['dictionary']['entries'],
  options?: {
    successToast?: boolean
  }
): Promise<boolean> => {
  const optimisticEntries = structuredClone(nextEntries)

  invalidatePendingAutosave()
  syncDictionaryEntriesIntoCurrentSettings(optimisticEntries)
  rerenderShellFromState()

  return new Promise<boolean>((resolve) => {
    state.dictionarySaveChain = state.dictionarySaveChain
      .catch(() => {})
      .then(async () => {
        const base = state.persistedSettings ?? state.settings
        if (!base) {
          resolve(false)
          return
        }

        const nextSettings: Settings = {
          ...base,
          correction: {
            ...base.correction,
            dictionary: {
              ...base.correction.dictionary,
              entries: optimisticEntries
            }
          }
        }

        try {
          const saved = await window.speechToTextApi.setSettings(nextSettings)
          state.persistedSettings = structuredClone(saved)
          syncDictionaryEntriesIntoCurrentSettings(saved.correction.dictionary.entries)
          rerenderShellFromState()
          if (options?.successToast) {
            addToast('Settings autosaved.', 'success')
          }
          reschedulePendingNonSecretAutosaveIfNeeded()
          resolve(true)
        } catch (error) {
          logRendererError('renderer.dictionary_save_failed', error)
          syncDictionaryEntriesIntoCurrentSettings(base.correction.dictionary.entries)
          rerenderShellFromState()
          reschedulePendingNonSecretAutosaveIfNeeded()
          const message = error instanceof Error ? error.message : 'Unknown dictionary save error'
          addToast(`Failed to save dictionary changes: ${message}`, 'error')
          resolve(false)
        }
      })
  })
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
  const isNonTerminalTransformAck =
    result.status === 'ok' && result.message.trim() === COMPOSITE_TRANSFORM_ENQUEUED_MESSAGE

  if (isNonTerminalTransformAck) {
    // Keep toast behavior unchanged, but do not append non-terminal transform entries to Activity.
    addToast(`Transform complete: ${result.message}`, 'success')
    rerenderShellFromState()
    return
  }

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
  try {
    await window.speechToTextApi.runRecordingCommand(command)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recording error'
    logRendererError('renderer.recording_dispatch_failed', error, { command })
    state.hasCommandError = true
    addToast(`${command} failed: ${message}`, 'error')
  }
  state.pendingActionId = null
  rerenderShellFromState()
}

const openSettingsRoute = (): void => {
  state.activeTab = 'settings'
  rerenderShellFromState()
}

const refreshSettingsFromMainExternalMutation = async (): Promise<void> => {
  try {
    // Prevent stale scheduled autosave snapshots from re-applying old settings
    // after an external main-process mutation is fetched.
    invalidatePendingAutosave()
    const latest = await window.speechToTextApi.getSettings()
    const normalized = normalizeTransformationPresetPointers(latest)
    const hasUnsavedSettingsEdits =
      state.settings !== null &&
      state.persistedSettings !== null &&
      !settingsEquals(state.settings, state.persistedSettings)
    if (
      hasUnsavedSettingsEdits &&
      state.settings !== null &&
      state.persistedSettings !== null &&
      canMergeExternalSettings(state.persistedSettings, normalized)
    ) {
      state.settings = mergeExternalSettingsIntoLocalDraft(state.persistedSettings, state.settings, normalized)
    } else {
      state.settings = normalized
      if (hasUnsavedSettingsEdits) {
        addToast('External settings changed. Unsaved local edits were discarded.', 'error')
      }
    }
    const resolvedSettings = state.settings ?? normalized
    state.persistedSettings = structuredClone(normalized)
    state.settingsValidationErrors = validateSettingsFormInput(buildSettingsValidationInput(resolvedSettings)).errors
    state.hasAutosaveValidationToast = false
    reschedulePendingNonSecretAutosaveIfNeeded()
    rerenderShellFromState()
  } catch (error) {
    logRendererError('renderer.external_settings_refresh_failed', error)
  }
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
    onShortcutCaptureActiveChange: (isActive) => {
      if (state.isShortcutCaptureActive === isActive) {
        return
      }
      state.isShortcutCaptureActive = isActive
      rerenderShellFromState()
    },
    onOpenSettings: openSettingsRoute,
    onSaveApiKey: (provider, candidateValue) => mutations.saveApiKey(provider, candidateValue),
    onDeleteApiKey: (provider) => mutations.deleteApiKey(provider),
    onRefreshAudioSources: async () => {
      try {
        await refreshAudioInputSources(buildRecordingDeps(), true)
        rerenderShellFromState()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown audio source refresh error'
        addToast(`Audio source refresh failed: ${message}`, 'error')
      }
    },
    onSelectRecordingMethod: (method) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        recording: {
          ...current.recording,
          method
        }
      }))
    },
    onSelectRecordingSampleRate: (sampleRateHz) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        recording: {
          ...current.recording,
          sampleRateHz
        }
      }))
    },
    onSelectRecordingDevice: (deviceId) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        recording: {
          ...current.recording,
          device: deviceId,
          autoDetectAudioSource: deviceId === 'system_default',
          detectedAudioSource: resolveDetectedAudioSource(deviceId, state.audioInputSources)
        }
      }))
    },
    onSelectTranscriptionProvider: (provider) => {
      mutations.applyTranscriptionProviderChange(provider, applyNonSecretAutosavePatch)
    },
    onSelectTranscriptionModel: (model) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        transcription: { ...current.transcription, model }
      }))
    },
    onSelectDefaultPresetAndSave: mutations.setDefaultTransformationPresetAndSave,
    onSavePresetDraft: mutations.saveTransformationPresetDraft,
    onCreatePresetFromDraftAndSave: mutations.createTransformationPresetFromDraftAndSave,
    onRemovePresetAndSave: mutations.removeTransformationPresetAndSave,
    onChangeShortcutDraft: (key, value) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        shortcuts: {
          ...current.shortcuts,
          [key]: value
        }
      }))
    },
    onChangeOutputSelection: (selection: OutputTextSource, destinations) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        output: buildOutputSettingsFromSelection(current.output, selection, destinations)
      }))
    },
    onChangeCleanupSettings: (cleanup) => {
      applyNonSecretAutosavePatch((current) => ({
        ...current,
        cleanup
      }))
    },
    onAddDictionaryEntry: (key: string, value: string) => {
      applyNonSecretAutosavePatch((current) => {
        const normalizedKey = key.trim()
        const normalizedValue = value.trim()
        if (normalizedKey.length === 0 || normalizedKey.length > 128 || normalizedValue.length === 0 || normalizedValue.length > 256) {
          return current
        }
        const existing = current.correction.dictionary.entries
        const existingIndex = existing.findIndex(
          (entry) => entry.key.toLowerCase() === normalizedKey.toLowerCase()
        )
        const nextEntries =
          existingIndex >= 0
            ? existing.map((entry, index) =>
                index === existingIndex ? { ...entry, value: normalizedValue } : entry
              )
            : [...existing, { key: normalizedKey, value: normalizedValue }]

        return {
          ...current,
          correction: {
            ...current.correction,
            dictionary: {
              ...current.correction.dictionary,
              entries: nextEntries
            }
          }
        }
      })
    },
    onUpdateDictionaryEntry: async (originalKey: string, nextKey: string, nextValue: string) => {
      const normalizedKey = nextKey.trim()
      const normalizedValue = nextValue.trim()
      if (normalizedKey.length === 0 || normalizedKey.length > 128 || normalizedValue.length === 0 || normalizedValue.length > 256) {
        return false
      }

      const currentEntries = state.settings?.correction.dictionary.entries ?? state.persistedSettings?.correction.dictionary.entries ?? []
      const nextEntries = currentEntries.map((entry) =>
        entry.key === originalKey ? { key: normalizedKey, value: normalizedValue } : entry
      )

      return saveDictionaryEntries(nextEntries, { successToast: false })
    },
    onDeleteDictionaryEntry: (key: string) => {
      const currentEntries = state.settings?.correction.dictionary.entries ?? state.persistedSettings?.correction.dictionary.entries ?? []
      const nextEntries = currentEntries.filter((entry) => entry.key.toLowerCase() !== key.toLowerCase())
      void saveDictionaryEntries(nextEntries, { successToast: false })
    },
    onDismissToast: (toastId) => {
      dismissToast(toastId)
      rerenderShellFromState()
    },
    onProfileDraftDirtyChange: (isDirty) => {
      if (state.hasUnsavedProfileDraft === isDirty) {
        return
      }
      state.hasUnsavedProfileDraft = isDirty
      syncBeforeUnloadBinding()
    },
    isNativeRecording
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

  try {
    // Register IPC listeners before async boot calls complete so main-process
    // events (for example tray "open settings") are not dropped during startup.
    wireIpcListeners({
      onCompositeTransformResult: (result) => applyCompositeResult(result),
      onRecordingCommand: (dispatch: RecordingCommandDispatch) => {
        if (state.isShortcutCaptureActive && state.activeTab === 'shortcuts') {
          return
        }
        void handleRecordingCommandDispatch(buildRecordingDeps(), dispatch)
      },
      onHotkeyError: (notification: HotkeyErrorNotification) => {
        applyHotkeyErrorNotification(notification, addToast)
      },
      onSettingsUpdated: () => {
        void refreshSettingsFromMainExternalMutation()
      },
      onOpenSettings: () => {
        openSettingsRoute()
      }
    })

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown initialization error'
    logRendererError('renderer.initialization_failed', error)
    renderInitializationFailure(message)
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
  state.hasUnsavedProfileDraft = false
  syncBeforeUnloadBinding()
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
  state.activity = []
  state.pendingActionId = null
  state.activityCounter = 0
  state.toasts = []
  state.toastCounter = 0
  state.audioInputSources = []
  state.audioSourceHint = ''
  state.hasCommandError = false
  state.isShortcutCaptureActive = false
  state.hasUnsavedProfileDraft = false
  state.hasAutosaveValidationToast = false
  state.settingsValidationErrors = {}
  state.persistedSettings = null
  state.autosaveGeneration = 0
  state.dictionarySaveChain = Promise.resolve()

  resetRecordingState()
}
