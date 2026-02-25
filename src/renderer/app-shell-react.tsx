/*
Where: src/renderer/app-shell-react.tsx
What: AppShell presentational React component — the top-level UI tree for Home + Settings.
Why: Extracted from renderer-app.tsx (Phase 6) to separate the render tree from orchestration
     logic. AppShell receives all event callbacks as explicit props, removing closure coupling
     to the renderer module scope and making the component independently testable.
*/

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
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
  onSaveApiKeys: (values: Record<ApiKeyProvider, string>) => Promise<void>
  onRefreshAudioSources: () => Promise<void>
  onSelectRecordingMethod: (method: Settings['recording']['method']) => void
  onSelectRecordingSampleRate: (sampleRateHz: Settings['recording']['sampleRateHz']) => void
  onSelectRecordingDevice: (deviceId: string) => void
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
  onToggleTransformEnabled: (checked: boolean) => void
  onToggleAutoRun: (checked: boolean) => void
  onSelectActivePreset: (presetId: string) => void
  onSelectDefaultPreset: (presetId: string) => void
  onChangeActivePresetDraft: (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ) => void
  onRunSelectedPreset: () => void
  onAddPreset: () => void
  onRemovePreset: (activePresetId: string) => void
  onChangeTranscriptionBaseUrlDraft: (value: string) => void
  onChangeTransformationBaseUrlDraft: (value: string) => void
  onResetTranscriptionBaseUrlDraft: () => void
  onResetTransformationBaseUrlDraft: () => void
  onChangeShortcutDraft: (key: ShortcutKey, value: string) => void
  onToggleTranscriptCopy: (checked: boolean) => void
  onToggleTranscriptPaste: (checked: boolean) => void
  onToggleTransformedCopy: (checked: boolean) => void
  onToggleTransformedPaste: (checked: boolean) => void
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

export const AppShell = ({ state: uiState, callbacks }: AppShellProps) => {
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
          <SettingsApiKeysReact
            apiKeyStatus={uiState.apiKeyStatus}
            apiKeySaveStatus={uiState.apiKeySaveStatus}
            apiKeyTestStatus={uiState.apiKeyTestStatus}
            saveMessage={uiState.apiKeysSaveMessage}
            onTestApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
              await callbacks.onTestApiKey(provider, candidateValue)
            }}
            onSaveApiKeys={async (values: Record<ApiKeyProvider, string>) => {
              await callbacks.onSaveApiKeys(values)
            }}
          />
          <section className="settings-form">
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
            <section className="settings-group">
              <SettingsTransformationReact
                settings={uiState.settings}
                presetNameError={uiState.settingsValidationErrors.presetName ?? ''}
                systemPromptError={uiState.settingsValidationErrors.systemPrompt ?? ''}
                userPromptError={uiState.settingsValidationErrors.userPrompt ?? ''}
                onToggleTransformEnabled={(checked: boolean) => {
                  callbacks.onToggleTransformEnabled(checked)
                }}
                onToggleAutoRun={(checked: boolean) => {
                  callbacks.onToggleAutoRun(checked)
                }}
                onSelectActivePreset={(presetId: string) => {
                  callbacks.onSelectActivePreset(presetId)
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
                onRemovePreset={(activePresetId: string) => {
                  callbacks.onRemovePreset(activePresetId)
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
            </section>
            <SettingsOutputReact
              settings={uiState.settings}
              onToggleTranscriptCopy={(checked: boolean) => {
                callbacks.onToggleTranscriptCopy(checked)
              }}
              onToggleTranscriptPaste={(checked: boolean) => {
                callbacks.onToggleTranscriptPaste(checked)
              }}
              onToggleTransformedCopy={(checked: boolean) => {
                callbacks.onToggleTransformedCopy(checked)
              }}
              onToggleTransformedPaste={(checked: boolean) => {
                callbacks.onToggleTransformedPaste(checked)
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
