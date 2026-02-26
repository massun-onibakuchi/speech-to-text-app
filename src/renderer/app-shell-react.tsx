/*
Where: src/renderer/app-shell-react.tsx
What: AppShell presentational React component — the top-level UI tree for Home + Settings.
Why: Extracted from renderer-app.tsx (Phase 6) to separate the render tree from orchestration
     logic. AppShell receives all event callbacks as explicit props, removing closure coupling
     to the renderer module scope and making the component independently testable.
*/

import { useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { DEFAULT_SETTINGS, type OutputTextSource, type Settings } from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot, AudioInputSource, RecordingCommand } from '../shared/ipc'
import type { ActivityItem } from './activity-feed'
import { HomeReact } from './home-react'
import { SettingsApiKeysReact } from './settings-api-keys-react'
import { SettingsEndpointOverridesReact } from './settings-endpoint-overrides-react'
import { SettingsOutputReact } from './settings-output-react'
import { SettingsRecordingReact } from './settings-recording-react'
import { SettingsSaveReact } from './settings-save-react'
import { SettingsShortcutEditorReact } from './settings-shortcut-editor-react'
import { SettingsShortcutsReact, type ShortcutBinding } from './settings-shortcuts-react'
import { SettingsTransformationReact } from './settings-transformation-react'
import type { SettingsValidationErrors } from './settings-validation'
import { ShellChromeReact } from './shell-chrome-react'

// Exported so renderer-app.tsx can use the same constant when initialising state.audioInputSources.
export const SYSTEM_DEFAULT_AUDIO_SOURCE: AudioInputSource = {
  id: 'system_default',
  label: 'System Default Microphone'
}

export interface ToastItem {
  id: number
  message: string
  tone: ActivityItem['tone']
}

// Shortcut key union used in onChangeShortcutDraft; mirrors the shortcuts object keys.
type ShortcutKey =
  | 'startRecording'
  | 'stopRecording'
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

// Internal type alias — only used inside AppShell JSX to type a CSS custom-property style.
type StaggerStyle = CSSProperties & { '--delay': string }

// The subset of app state that AppShell reads. Typed explicitly so renderer-app.tsx can
// satisfy it structurally without coupling the two modules via a shared `typeof state`.
export interface AppShellState {
  currentPage: 'home' | 'settings'
  ping: string
  settings: Settings | null
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  apiKeyTestStatus: Record<ApiKeyProvider, string>
  apiKeysSaveMessage: string
  lastTransformSummary: string
  pendingActionId: string | null
  hasCommandError: boolean
  audioInputSources: AudioInputSource[]
  audioSourceHint: string
  settingsValidationErrors: SettingsValidationErrors
  settingsSaveMessage: string
  toasts: ToastItem[]
}

// All event callbacks AppShell needs. Defined here so renderer-app.tsx can construct and
// type-check the callbacks object before passing it in.
export interface AppShellCallbacks {
  onNavigate: (page: 'home' | 'settings') => void
  onRunRecordingCommand: (command: RecordingCommand) => void
  onRunCompositeTransform: () => void
  onOpenSettings: () => void
  onTestApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onSaveApiKeys: (values: Record<ApiKeyProvider, string>) => Promise<void>
  onRefreshAudioSources: () => Promise<void>
  onSelectRecordingMethod: (method: Settings['recording']['method']) => void
  onSelectRecordingSampleRate: (sampleRateHz: Settings['recording']['sampleRateHz']) => void
  onSelectRecordingDevice: (deviceId: string) => void
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
  onToggleAutoRun: (checked: boolean) => void
  // onSelectActivePreset removed: active profile is no longer user-facing (#127)
  onSelectDefaultPreset: (presetId: string) => void
  onChangeActivePresetDraft: (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ) => void
  onRunSelectedPreset: () => void
  onAddPreset: () => void
  onRemovePreset: (presetId: string) => void
  onChangeTranscriptionBaseUrlDraft: (value: string) => void
  onChangeTransformationBaseUrlDraft: (value: string) => void
  onResetTranscriptionBaseUrlDraft: () => void
  onResetTransformationBaseUrlDraft: () => void
  onChangeShortcutDraft: (key: ShortcutKey, value: string) => void
  onChangeOutputSelection: (
    selection: OutputTextSource,
    destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }
  ) => void
  onRestoreDefaults: () => Promise<void>
  onSave: () => Promise<void>
  onDismissToast: (toastId: number) => void
  isNativeRecording: () => boolean
  handleSettingsEnterSaveKeydown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

interface AppShellProps {
  state: AppShellState
  callbacks: AppShellCallbacks
}

// Pure function: resolves shortcut bindings, filling in DEFAULT_SETTINGS values for any
// keys not set by the user.
const resolveShortcutBindings = (settings: Settings): Settings['shortcuts'] => ({
  ...DEFAULT_SETTINGS.shortcuts,
  ...settings.shortcuts
})

// Pure function: builds the ShortcutBinding array displayed in SettingsShortcutsReact.
const buildShortcutContract = (settings: Settings | null): ShortcutBinding[] => {
  if (!settings) {
    return []
  }
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

// Section IDs for the settings accordion
type SettingsSectionId = 'api-keys' | 'recording' | 'transformation' | 'shortcuts' | 'output'

// Helper: renders a collapsible settings accordion section.
// Completion dot turns green when `isDone` is true (Zeigarnik effect / goal-gradient).
const SettingsSection = ({
  id,
  title,
  isDone,
  isOpen,
  onToggle,
  children
}: {
  id: string
  title: string
  isDone: boolean
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) => (
  <div className="settings-section">
    <button
      type="button"
      className="settings-section-header"
      aria-expanded={isOpen}
      aria-controls={`section-body-${id}`}
      onClick={onToggle}
    >
      <span
        className={`section-indicator${isDone ? ' section-indicator--done' : ''}`}
        aria-hidden="true"
      />
      <span className="section-title-text">{title}</span>
      <span className={`section-chevron${isOpen ? ' section-chevron--open' : ''}`} aria-hidden="true">
        ▾
      </span>
    </button>
    {isOpen && (
      <div className="settings-section-body" id={`section-body-${id}`}>
        {children}
      </div>
    )}
  </div>
)

export const AppShell = ({ state: uiState, callbacks }: AppShellProps) => {
  // Accordion open state — 'recording' open by default as the most-used section
  const [openSections, setOpenSections] = useState<Set<SettingsSectionId>>(
    new Set(['recording'])
  )

  const toggleSection = (id: SettingsSectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

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

  // Compute section completion for indicator dots
  const apiKeysDone = Object.values(uiState.apiKeyStatus).some(Boolean)
  const recordingDone = true // always has defaults
  const transformationDone = uiState.settings.transformation.presets.length > 0
  const shortcutsDone = Object.keys(uiState.settings.shortcuts ?? {}).length > 0
  const outputDone = true // always has defaults

  return (
    <main className="shell">
      <ShellChromeReact
        ping={uiState.ping}
        settings={uiState.settings}
        currentPage={uiState.currentPage}
        onNavigate={callbacks.onNavigate}
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
          isRecording={callbacks.isNativeRecording()}
          onRunRecordingCommand={(command: RecordingCommand) => {
            callbacks.onRunRecordingCommand(command)
          }}
          onRunCompositeTransform={() => {
            callbacks.onRunCompositeTransform()
          }}
          onOpenSettings={() => {
            callbacks.onOpenSettings()
          }}
        />
      </section>
      <section
        className={`grid page-settings${uiState.currentPage === 'settings' ? '' : ' is-hidden'}`}
        data-page="settings"
        onKeyDown={callbacks.handleSettingsEnterSaveKeydown}
      >
        <article
          className="card settings"
          data-stagger=""
          style={{ '--delay': '220ms' } as StaggerStyle}
        >
          <div className="panel-head">
            <h2>Settings</h2>
          </div>

          {/* Accordion sections — each collapses independently */}
          <div className="settings-accordion">

            {/* API Keys */}
            <SettingsSection
              id="api-keys"
              title="API Keys"
              isDone={apiKeysDone}
              isOpen={openSections.has('api-keys')}
              onToggle={() => { toggleSection('api-keys') }}
            >
              <SettingsApiKeysReact
                apiKeyStatus={uiState.apiKeyStatus}
                apiKeySaveStatus={uiState.apiKeySaveStatus}
                apiKeyTestStatus={uiState.apiKeyTestStatus}
                saveMessage={uiState.apiKeysSaveMessage}
                onTestApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
                  await callbacks.onTestApiKey(provider, candidateValue)
                }}
                onSaveApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
                  await callbacks.onSaveApiKey(provider, candidateValue)
                }}
                onSaveApiKeys={async (values: Record<ApiKeyProvider, string>) => {
                  await callbacks.onSaveApiKeys(values)
                }}
              />
            </SettingsSection>

            {/* Recording & Transcription */}
            <SettingsSection
              id="recording"
              title="Recording & Transcription"
              isDone={recordingDone}
              isOpen={openSections.has('recording')}
              onToggle={() => { toggleSection('recording') }}
            >
              <SettingsRecordingReact
                settings={uiState.settings}
                audioInputSources={uiState.audioInputSources.length > 0 ? uiState.audioInputSources : [SYSTEM_DEFAULT_AUDIO_SOURCE]}
                audioSourceHint={uiState.audioSourceHint}
                onRefreshAudioSources={callbacks.onRefreshAudioSources}
                onSelectRecordingMethod={(method: Settings['recording']['method']) => {
                  callbacks.onSelectRecordingMethod(method)
                }}
                onSelectRecordingSampleRate={(sampleRateHz: Settings['recording']['sampleRateHz']) => {
                  callbacks.onSelectRecordingSampleRate(sampleRateHz)
                }}
                onSelectRecordingDevice={(deviceId: string) => {
                  callbacks.onSelectRecordingDevice(deviceId)
                }}
                onSelectTranscriptionProvider={(provider: Settings['transcription']['provider']) => {
                  callbacks.onSelectTranscriptionProvider(provider)
                }}
                onSelectTranscriptionModel={(model: Settings['transcription']['model']) => {
                  callbacks.onSelectTranscriptionModel(model)
                }}
              />
            </SettingsSection>

            {/* Transformation — presets, prompts, endpoint overrides */}
            <SettingsSection
              id="transformation"
              title="Transformation"
              isDone={transformationDone}
              isOpen={openSections.has('transformation')}
              onToggle={() => { toggleSection('transformation') }}
            >
              <section className="settings-group">
                <SettingsTransformationReact
                  settings={uiState.settings}
                  presetNameError={uiState.settingsValidationErrors.presetName ?? ''}
                  systemPromptError={uiState.settingsValidationErrors.systemPrompt ?? ''}
                  userPromptError={uiState.settingsValidationErrors.userPrompt ?? ''}
                  onToggleAutoRun={(checked: boolean) => {
                    callbacks.onToggleAutoRun(checked)
                  }}
                  onSelectDefaultPreset={(presetId: string) => {
                    callbacks.onSelectDefaultPreset(presetId)
                  }}
                  onChangeActivePresetDraft={(
                    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
                  ) => {
                    callbacks.onChangeActivePresetDraft(patch)
                  }}
                  onRunSelectedPreset={() => {
                    callbacks.onRunSelectedPreset()
                  }}
                  onAddPreset={() => {
                    callbacks.onAddPreset()
                  }}
                  onRemovePreset={(presetId: string) => {
                    callbacks.onRemovePreset(presetId)
                  }}
                />
                <SettingsEndpointOverridesReact
                  settings={uiState.settings}
                  transcriptionBaseUrlError={uiState.settingsValidationErrors.transcriptionBaseUrl ?? ''}
                  transformationBaseUrlError={uiState.settingsValidationErrors.transformationBaseUrl ?? ''}
                  onChangeTranscriptionBaseUrlDraft={(value: string) => {
                    callbacks.onChangeTranscriptionBaseUrlDraft(value)
                  }}
                  onChangeTransformationBaseUrlDraft={(value: string) => {
                    callbacks.onChangeTransformationBaseUrlDraft(value)
                  }}
                  onResetTranscriptionBaseUrlDraft={() => {
                    callbacks.onResetTranscriptionBaseUrlDraft()
                  }}
                  onResetTransformationBaseUrlDraft={() => {
                    callbacks.onResetTransformationBaseUrlDraft()
                  }}
                />
              </section>
            </SettingsSection>

            {/* Keyboard Shortcuts */}
            <SettingsSection
              id="shortcuts"
              title="Keyboard Shortcuts"
              isDone={shortcutsDone}
              isOpen={openSections.has('shortcuts')}
              onToggle={() => { toggleSection('shortcuts') }}
            >
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
                  callbacks.onChangeShortcutDraft(key, value)
                }}
              />
            </SettingsSection>

            {/* Output & Save */}
            <SettingsSection
              id="output"
              title="Output & Save"
              isDone={outputDone}
              isOpen={openSections.has('output')}
              onToggle={() => { toggleSection('output') }}
            >
              <SettingsOutputReact
                settings={uiState.settings}
                onChangeOutputSelection={(selection, destinations) => {
                  callbacks.onChangeOutputSelection(selection, destinations)
                }}
                onRestoreDefaults={async () => {
                  await callbacks.onRestoreDefaults()
                }}
              />
              <SettingsSaveReact
                saveMessage={uiState.settingsSaveMessage}
                onSave={async () => {
                  await callbacks.onSave()
                }}
              />
            </SettingsSection>

          </div>
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
                callbacks.onDismissToast(toast.id)
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
