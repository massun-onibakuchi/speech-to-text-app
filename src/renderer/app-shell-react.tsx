/*
 * Where: src/renderer/app-shell-react.tsx
 * What: AppShell — top-level React UI tree using the new fixed desktop shell architecture.
 * Why: STY-02 re-architecture replaces the home/settings two-page model with a
 *      fixed left panel (recording) + tabbed right workspace (activity/profiles/shortcuts/settings).
 *
 * Layout:
 *   flex h-screen flex-col
 *     <header>  — ShellChromeReact (logo + state dot)
 *     <main>    — left panel (recording) + right workspace (tab rail + content)
 *     <footer>  — StatusBarReact
 *   Toast layer (fixed overlay)
 *
 * UX rationale (spec sections 5, 7, 8):
 *   • Fixed left panel preserves motor memory for the recording gesture across all tabs.
 *   • Flat underline tab rail has no background/pill — reduces visual clutter.
 *   • No page-level scroll; each tab content area owns its own scroll independently.
 *   • Tab state is UI-local only — business state/IPC contracts are unchanged.
 */

import type { ComponentType } from 'react'
import { Activity, CheckCircle2, CircleAlert, Cpu, Info, Keyboard, Mic, Settings as SettingsIcon, Zap } from 'lucide-react'
import { DEFAULT_SETTINGS, type OutputTextSource, type Settings } from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot, AudioInputSource, RecordingCommand } from '../shared/ipc'
import type { ActivityItem } from './activity-feed'
import { ActivityFeedReact } from './activity-feed-react'
import { HomeReact } from './home-react'
import { ProfilesPanelReact } from './profiles-panel-react'
import { SettingsApiKeysReact } from './settings-api-keys-react'
import { SettingsOutputReact } from './settings-output-react'
import { SettingsRecordingReact } from './settings-recording-react'
import { SettingsShortcutEditorReact } from './settings-shortcut-editor-react'
import { SettingsShortcutsReact, type ShortcutBinding } from './settings-shortcuts-react'
import { SettingsSttProviderFormReact } from './settings-stt-provider-form-react'
import type { SettingsValidationErrors } from './settings-validation'
import { ShellChromeReact } from './shell-chrome-react'
import { StatusBarReact } from './status-bar-react'
import { cn } from './lib/utils'

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

// UI-local tab model — does not affect business state or IPC contracts.
export type AppTab = 'activity' | 'profiles' | 'shortcuts' | 'audio-input' | 'settings'

// Shortcut key union used in onChangeShortcutDraft; mirrors the shortcuts object keys.
type ShortcutKey =
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

// The subset of app state that AppShell reads. Typed explicitly so renderer-app.tsx can
// satisfy it structurally without coupling the two modules via a shared `typeof state`.
export interface AppShellState {
  activeTab: AppTab
  ping: string
  settings: Settings | null
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  pendingActionId: string | null
  hasCommandError: boolean
  audioInputSources: AudioInputSource[]
  audioSourceHint: string
  settingsValidationErrors: SettingsValidationErrors
  settingsSaveMessage: string
  toasts: ToastItem[]
  activity: ActivityItem[]
}

// All event callbacks AppShell needs.
export interface AppShellCallbacks {
  onNavigate: (tab: AppTab) => void
  onRunRecordingCommand: (command: RecordingCommand) => void
  onShortcutCaptureActiveChange: (isActive: boolean) => void
  onOpenSettings: () => void
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onRefreshAudioSources: () => Promise<void>
  onSelectRecordingMethod: (method: Settings['recording']['method']) => void
  onSelectRecordingSampleRate: (sampleRateHz: Settings['recording']['sampleRateHz']) => void
  onSelectRecordingDevice: (deviceId: string) => void
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
  onSelectDefaultPresetAndSave: (presetId: string) => Promise<boolean>
  onSavePresetDraft: (
    presetId: string,
    draft: Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>
  ) => Promise<boolean>
  onAddPresetAndSave: () => Promise<boolean>
  onRemovePresetAndSave: (presetId: string) => Promise<boolean>
  onChangeShortcutDraft: (key: ShortcutKey, value: string) => void
  onChangeOutputSelection: (
    selection: OutputTextSource,
    destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }
  ) => void
  onDismissToast: (toastId: number) => void
  isNativeRecording: () => boolean
}

interface AppShellProps {
  state: AppShellState
  callbacks: AppShellCallbacks
}

// Resolves shortcut bindings, filling in DEFAULT_SETTINGS values for any keys not set.
const resolveShortcutBindings = (settings: Settings): Settings['shortcuts'] => ({
  ...DEFAULT_SETTINGS.shortcuts,
  ...settings.shortcuts
})

// Builds the ShortcutBinding array displayed in SettingsShortcutsReact.
const buildShortcutContract = (settings: Settings | null): ShortcutBinding[] => {
  if (!settings) return []
  const shortcuts = resolveShortcutBindings(settings)
  return [
    { action: 'Toggle recording', combo: shortcuts.toggleRecording },
    { action: 'Cancel recording', combo: shortcuts.cancelRecording },
    { action: 'Run transform', combo: shortcuts.runTransform },
    { action: 'Run transform on selection', combo: shortcuts.runTransformOnSelection },
    { action: 'Pick transformation', combo: shortcuts.pickTransformation },
    { action: 'Change transformation default', combo: shortcuts.changeTransformationDefault }
  ]
}

const SettingsSectionHeader = ({
  icon: Icon,
  title
}: {
  icon: ComponentType<{ className?: string }>
  title: string
}) => (
  <div className="flex items-center gap-2 mb-4">
    <Icon className="size-4 text-primary" />
    <h3 className="text-sm font-semibold text-foreground m-0">{title}</h3>
  </div>
)

const ToastTone = ({
  tone
}: {
  tone: ActivityItem['tone']
}) => {
  if (tone === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
        <CircleAlert className="size-3" aria-hidden="true" />
        Error
      </span>
    )
  }
  if (tone === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-success">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Success
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Info className="size-3" aria-hidden="true" />
      Info
    </span>
  )
}

// Flat underline tab button — no pill, no background fill per spec section 5.4.
const TabButton = ({
  tab,
  activeTab,
  icon: Icon,
  label,
  onNavigate
}: {
  tab: AppTab
  activeTab: AppTab
  icon: React.ComponentType<{ className?: string }>
  label: string
  onNavigate: (tab: AppTab) => void
}) => {
  const isActive = tab === activeTab
  return (
    <button
      type="button"
      data-route-tab={tab}
      aria-pressed={isActive ? 'true' : 'false'}
      onClick={() => { onNavigate(tab) }}
      className={cn(
        'flex items-center rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs transition-colors',
        'text-muted-foreground hover:text-foreground',
        isActive && 'border-primary text-foreground'
      )}
    >
      <Icon className="size-3.5 mr-1.5" aria-hidden="true" />
      {label}
    </button>
  )
}

export const AppShell = ({ state: uiState, callbacks }: AppShellProps) => {
  if (!uiState.settings) {
    return (
      <div className="flex h-screen flex-col bg-background items-center justify-center">
        <div className="rounded-lg border bg-card p-6 max-w-sm">
          <p className="text-xs text-muted-foreground mb-1">Renderer Initialization Error</p>
          <p className="text-sm font-semibold">UI failed to initialize</p>
          <p className="text-xs text-muted-foreground mt-2">Settings are unavailable.</p>
        </div>
      </div>
    )
  }

  const isRecording = callbacks.isNativeRecording()

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ── Header ──────────────────────────────────────────── */}
      <ShellChromeReact isRecording={isRecording} />

      {/* ── Main: left recording panel + right tabbed workspace ─ */}
      <main className="flex flex-1 overflow-hidden">

        {/* Left panel: fixed 320px — HomeReact owns recording button + waveform (STY-03) */}
        <aside className="w-[320px] border-r flex flex-col">
          <HomeReact
            settings={uiState.settings}
            apiKeyStatus={uiState.apiKeyStatus}
            pendingActionId={uiState.pendingActionId}
            hasCommandError={uiState.hasCommandError}
            isRecording={isRecording}
            onRunRecordingCommand={(command: RecordingCommand) => {
              callbacks.onRunRecordingCommand(command)
            }}
            onOpenSettings={() => {
              callbacks.onOpenSettings()
            }}
          />
        </aside>

        {/* Right workspace: tab rail + tab content panels */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Tab rail — flat underline, no pill/background per spec section 5.4 */}
          <nav
            className="flex w-full justify-start border-b bg-transparent"
            aria-label="Workspace tabs"
          >
            <TabButton
              tab="activity"
              activeTab={uiState.activeTab}
              icon={Activity}
              label="Activity"
              onNavigate={callbacks.onNavigate}
            />
            <TabButton
              tab="profiles"
              activeTab={uiState.activeTab}
              icon={Zap}
              label="Profiles"
              onNavigate={callbacks.onNavigate}
            />
            <TabButton
              tab="shortcuts"
              activeTab={uiState.activeTab}
              icon={Keyboard}
              label="Shortcuts"
              onNavigate={callbacks.onNavigate}
            />
            <TabButton
              tab="audio-input"
              activeTab={uiState.activeTab}
              icon={Mic}
              label="Audio Input"
              onNavigate={callbacks.onNavigate}
            />
            <TabButton
              tab="settings"
              activeTab={uiState.activeTab}
              icon={SettingsIcon}
              label="Settings"
              onNavigate={callbacks.onNavigate}
            />
          </nav>
          {(uiState.activeTab === 'shortcuts' || uiState.activeTab === 'settings') && uiState.settingsSaveMessage.length > 0 && (
            <p data-settings-save-message className="px-4 pt-2 text-xs text-muted-foreground" aria-live="polite">
              {uiState.settingsSaveMessage}
            </p>
          )}

          {/* Tab panels — all rendered in DOM; active shown, others hidden.
              Keeping all panels in the DOM preserves text content for test assertions
              and avoids remount cost on tab switches. */}

          {/* Activity tab */}
          <div
            data-tab-panel="activity"
            className={cn(
              'flex flex-1 flex-col overflow-hidden',
              uiState.activeTab !== 'activity' && 'hidden'
            )}
          >
            <ActivityFeedReact activity={uiState.activity} />
          </div>

          {/* Profiles tab */}
          <div
            data-tab-panel="profiles"
            className={cn(
              'flex flex-1 flex-col overflow-hidden',
              uiState.activeTab !== 'profiles' && 'hidden'
            )}
          >
            <ProfilesPanelReact
              settings={uiState.settings}
              settingsValidationErrors={uiState.settingsValidationErrors}
              onSelectDefaultPreset={async (presetId: string) => {
                await callbacks.onSelectDefaultPresetAndSave(presetId)
              }}
              onSavePresetDraft={async (
                presetId: string,
                draft: Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>
              ) => {
                return callbacks.onSavePresetDraft(presetId, draft)
              }}
              onAddPreset={async () => {
                await callbacks.onAddPresetAndSave()
              }}
              onRemovePreset={async (presetId: string) => {
                await callbacks.onRemovePresetAndSave(presetId)
              }}
            />
          </div>

          {/* Shortcuts tab — shortcut editor + contract display */}
          <div
            data-tab-panel="shortcuts"
            className={cn(
              'flex flex-1 flex-col overflow-y-auto',
              uiState.activeTab !== 'shortcuts' && 'hidden'
            )}
          >
            <div className="p-4">
              <section className="mt-4 space-y-4" data-settings-form>
                <SettingsShortcutEditorReact
                  settings={uiState.settings}
                  validationErrors={{
                    toggleRecording: uiState.settingsValidationErrors.toggleRecording,
                    cancelRecording: uiState.settingsValidationErrors.cancelRecording,
                    runTransform: uiState.settingsValidationErrors.runTransform,
                    runTransformOnSelection: uiState.settingsValidationErrors.runTransformOnSelection,
                    pickTransformation: uiState.settingsValidationErrors.pickTransformation,
                    changeTransformationDefault: uiState.settingsValidationErrors.changeTransformationDefault
                  }}
                  onChangeShortcutDraft={(
                    key:
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
                  onCaptureStateChange={callbacks.onShortcutCaptureActiveChange}
                />
                <SettingsShortcutsReact shortcuts={buildShortcutContract(uiState.settings)} />
              </section>
            </div>
          </div>

          {/* Audio Input tab */}
          <div
            data-tab-panel="audio-input"
            className={cn(
              'flex flex-1 flex-col overflow-y-auto',
              uiState.activeTab !== 'audio-input' && 'hidden'
            )}
          >
            <div className="p-4">
              <section className="mt-4 space-y-4" data-settings-form>
                <section data-settings-section="audio-input">
                  <SettingsSectionHeader icon={Mic} title="Audio Input" />
                  <SettingsRecordingReact
                    section="audio-input"
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
                </section>
              </section>
            </div>
          </div>

          {/* Settings tab */}
          <div
            data-tab-panel="settings"
            className={cn(
              'flex flex-1 flex-col overflow-y-auto',
              uiState.activeTab !== 'settings' && 'hidden'
            )}
          >
            <div className="p-4">
              <section className="mt-4 space-y-4" data-settings-form>
                <section data-settings-section="output">
                  <SettingsSectionHeader icon={Zap} title="Output" />
                  <SettingsOutputReact
                    settings={uiState.settings}
                    onChangeOutputSelection={(selection, destinations) => {
                      callbacks.onChangeOutputSelection(selection, destinations)
                    }}
                  />
                </section>

                <hr className="my-4 border-border" />

                <section data-settings-section="speech-to-text">
                  <SettingsSectionHeader icon={Activity} title="Speech-to-Text" />
                  {/* Single provider form: provider → model → API key → base URL */}
                  <SettingsSttProviderFormReact
                    settings={uiState.settings}
                    apiKeyStatus={uiState.apiKeyStatus}
                    apiKeySaveStatus={uiState.apiKeySaveStatus}
                    onSelectTranscriptionProvider={(provider: Settings['transcription']['provider']) => {
                      callbacks.onSelectTranscriptionProvider(provider)
                    }}
                    onSelectTranscriptionModel={(model: Settings['transcription']['model']) => {
                      callbacks.onSelectTranscriptionModel(model)
                    }}
                    onSaveApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
                      await callbacks.onSaveApiKey(provider, candidateValue)
                    }}
                  />
                </section>

                <hr className="my-4 border-border" />

                <section data-settings-section="llm-transformation">
                  <SettingsSectionHeader icon={Cpu} title="LLM Transformation" />
                  <section className="space-y-3">
                    {/* Google API key — single LLM provider form */}
                    <SettingsApiKeysReact
                      apiKeyStatus={uiState.apiKeyStatus}
                      apiKeySaveStatus={uiState.apiKeySaveStatus}
                      onSaveApiKey={async (provider: ApiKeyProvider, candidateValue: string) => {
                        await callbacks.onSaveApiKey(provider, candidateValue)
                      }}
                    />
                  </section>
                </section>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer: status bar ───────────────────────────────── */}
      <StatusBarReact settings={uiState.settings} ping={uiState.ping} />

      {/* ── Toast overlay (fixed, pointer-events managed per item) ── */}
      <ul
        id="toast-layer"
        className="fixed top-4 right-4 z-40 grid gap-[0.55rem] w-[min(360px,calc(100vw-2rem))] m-0 p-0 list-none pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {uiState.toasts.map((toast) => (
          <li
            key={toast.id}
            className={cn(
              'pointer-events-auto grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border bg-card/95 p-3',
              toast.tone === 'error' && 'border-destructive/30',
              toast.tone === 'success' && 'border-success/20'
            )}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            data-toast-tone={toast.tone}
          >
            <div>
              <ToastTone tone={toast.tone} />
              <p className="mt-1 text-xs leading-snug m-0">{toast.message}</p>
            </div>
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors"
              data-toast-dismiss={String(toast.id)}
              aria-label="Dismiss notification"
              onClick={() => { callbacks.onDismissToast(toast.id) }}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
