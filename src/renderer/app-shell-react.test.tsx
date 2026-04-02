/*
 * Where: src/renderer/app-shell-react.test.tsx
 * What: Layout and tab-routing tests for the new STY-02 shell architecture.
 * Why: Assert h-screen structure, w-[320px] left panel, persistent header/footer,
 *      and tab state model without relying on geometry (deferred to e2e in STY-09).
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import type { ApiKeyStatusSnapshot, LlmProviderStatusSnapshot } from '../shared/ipc'
import { AppShell, type AppShellCallbacks, type AppShellState, type AppTab } from './app-shell-react'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const findDialogContentByTitle = (title: string): HTMLElement | null =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]')).find((element) =>
    element.textContent?.includes(title)
  ) ?? null

const findButtonByText = (scope: ParentNode, label: string): HTMLButtonElement | null =>
  Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === label) ?? null

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

const readyStatus: ApiKeyStatusSnapshot = { groq: true, elevenlabs: true, google: true }
const readyLlmStatus: LlmProviderStatusSnapshot = {
  google: {
    provider: 'google',
    credential: { kind: 'api_key', configured: true },
    status: { kind: 'ready', message: 'Google API key is configured.' },
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: true }]
  },
  ollama: {
    provider: 'ollama',
    credential: { kind: 'local' },
    status: { kind: 'runtime_unavailable', message: 'Ollama is not installed.' },
    models: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', available: false }]
  },
  'openai-subscription': {
    provider: 'openai-subscription',
    credential: { kind: 'oauth', configured: false },
    status: { kind: 'oauth_required', message: 'Browser sign-in is required before ChatGPT subscription models can be used.' },
    models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
  }
}

// Minimal valid state for AppShell rendering
const buildState = (overrides: Partial<AppShellState> = {}): AppShellState => ({
  activeTab: 'activity',
  ping: 'pong',
  settings: DEFAULT_SETTINGS,
  apiKeyStatus: readyStatus,
  llmProviderStatus: readyLlmStatus,
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' },
  pendingActionId: null,
  hasCommandError: false,
  audioInputSources: [],
  audioSourceHint: '',
  settingsValidationErrors: {},
  toasts: [],
  activity: [],
  ...overrides
})

// Minimal no-op callbacks
const buildCallbacks = (overrides: Partial<AppShellCallbacks> = {}): AppShellCallbacks => ({
  onNavigate: vi.fn(),
  onRunRecordingCommand: vi.fn(),
  onShortcutCaptureActiveChange: vi.fn(),
  onOpenSettings: vi.fn(),
  onSaveApiKey: vi.fn().mockResolvedValue(undefined),
  onDeleteApiKey: vi.fn().mockResolvedValue(true),
  onConnectLlmProvider: vi.fn().mockResolvedValue(true),
  onDisconnectLlmProvider: vi.fn().mockResolvedValue(true),
  onRefreshAudioSources: vi.fn().mockResolvedValue(undefined),
  onSelectRecordingMethod: vi.fn(),
  onSelectRecordingSampleRate: vi.fn(),
  onSelectRecordingDevice: vi.fn(),
  onSelectTranscriptionProvider: vi.fn(),
  onSelectTranscriptionModel: vi.fn(),
  onSelectDefaultPresetAndSave: vi.fn().mockResolvedValue(true),
  onSavePresetDraft: vi.fn().mockResolvedValue(true),
  onCreatePresetFromDraftAndSave: vi.fn().mockResolvedValue(true),
  onRemovePresetAndSave: vi.fn().mockResolvedValue(true),
  onChangeShortcutDraft: vi.fn(),
  onChangeOutputSelection: vi.fn(),
  onAddDictionaryEntry: vi.fn(),
  onUpdateDictionaryEntry: vi.fn().mockResolvedValue(true),
  onDeleteDictionaryEntry: vi.fn(),
  onDismissToast: vi.fn(),
  onProfileDraftDirtyChange: vi.fn(),
  isNativeRecording: vi.fn().mockReturnValue(false),
  ...overrides
})

describe('AppShell layout (STY-02)', () => {
  it('renders root shell with h-screen class — fixed height layout', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    // Root shell must use h-screen for fixed viewport height per spec section 5.1
    const shell = host.firstElementChild
    expect(shell?.classList.contains('h-screen')).toBe(true)
  })

  it('renders left panel with w-[320px] class — fixed recording panel width', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    // Left panel must be fixed width per spec section 5.2
    const leftPanel = host.querySelector('aside')
    expect(leftPanel).not.toBeNull()
    expect(leftPanel?.className).toContain('w-[320px]')
  })

  it('renders persistent header and footer — always visible per spec section 5.5', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    expect(host.querySelector('header')).not.toBeNull()
    expect(host.querySelector('footer')).not.toBeNull()
  })

  it('renders tab buttons for activity, profiles, shortcuts, dictionary, audio input, and settings', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    const tabs = ['activity', 'profiles', 'shortcuts', 'dictionary', 'audio-input', 'settings'] satisfies AppTab[]
    for (const tab of tabs) {
      expect(host.querySelector(`[data-route-tab="${tab}"]`)).not.toBeNull()
    }
    expect(host.querySelectorAll('[role="tab"]').length).toBe(6)
    expect(host.querySelector('[data-route-tab="activity"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[data-route-tab="settings"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelector('[data-route-tab="activity"]')?.textContent).toContain('Activity')
    expect(host.querySelector('[data-route-tab="profiles"]')?.textContent).toContain('Profiles')
    expect(host.querySelector('[data-route-tab="shortcuts"]')?.textContent).toContain('Shortcuts')
    expect(host.querySelector('[data-route-tab="dictionary"]')?.textContent).toContain('Dictionary')
    expect(host.querySelector('[data-route-tab="audio-input"]')?.textContent).toContain('Audio')
    expect(host.querySelector('[data-route-tab="audio-input"]')?.textContent).not.toContain('Audio Input')
    expect(host.querySelector('[data-route-tab="settings"]')?.textContent).toContain('Settings')
  })

  it('renders Settings IA sections without audio input section', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()

    const settingsPanel = host.querySelector('[data-tab-panel="settings"]')
    const sectionOrder = Array.from(settingsPanel?.querySelectorAll('[data-settings-section]') ?? []).map((node) =>
      node.getAttribute('data-settings-section')
    )
    // global-shortcuts section moved to dedicated Shortcuts tab (#200)
    expect(sectionOrder).toEqual([
      'output',
      'speech-to-text',
      'llm-transformation'
    ])
  })

  it('uses utility-based settings form container without legacy class hooks', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()

    const settingsForm = host.querySelector('[data-settings-form]')
    expect(settingsForm).not.toBeNull()
    expect(settingsForm?.className).toContain('space-y-4')
  })

  it('calls onNavigate with correct tab when tab button is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onNavigate = vi.fn()
    root.render(<AppShell state={buildState()} callbacks={buildCallbacks({ onNavigate })} />)
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('settings')

    host.querySelector<HTMLButtonElement>('[data-route-tab="profiles"]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('profiles')

    host.querySelector<HTMLButtonElement>('[data-route-tab="shortcuts"]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('shortcuts')
  })

  it('waveform strip has 32 bars in the left panel', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    // Waveform bars use w-[3px] + rounded-full per spec section 6.2
    // They are inside the HomeReact component within the aside panel
    const waveformContainer = host.querySelector('aside [role="presentation"]')
    expect(waveformContainer).not.toBeNull()
    // Children of the waveform container are the 32 bars
    expect(waveformContainer?.children.length).toBe(32)
  })

  it('renders shortcut editor in Shortcuts tab panel (not in Settings)', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'shortcuts' })} callbacks={buildCallbacks()} />)
    await flush()

    // Shortcut editor inputs are in the Shortcuts tab panel, not Settings
    expect(host.querySelector('[data-tab-panel="shortcuts"] #settings-shortcut-toggle-recording')).not.toBeNull()
    expect(host.querySelector('[data-tab-panel="settings"] #settings-shortcut-toggle-recording')).toBeNull()
    // Settings section list does not include global-shortcuts
    const settingsSections = Array.from(
      host.querySelectorAll('[data-tab-panel="settings"] [data-settings-section]')
    ).map((n) => n.getAttribute('data-settings-section'))
    expect(settingsSections).not.toContain('global-shortcuts')
    expect(host.textContent ?? '').not.toContain('Shortcut Contract')
  })

  it('renders Audio Input controls only in the Audio Input tab panel', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'audio-input' })} callbacks={buildCallbacks()} />)
    await flush()

    expect(host.querySelector('[data-tab-panel="audio-input"] [data-settings-section="audio-input"]')).not.toBeNull()
    expect(host.querySelector('[data-tab-panel="settings"] [data-settings-section="audio-input"]')).toBeNull()
  })

  it('shows null settings error state when settings are unavailable', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ settings: null })} callbacks={buildCallbacks()} />)
    await flush()

    expect(host.textContent).toContain('UI failed to initialize')
  })

  it('renders toast items with tone label and semantic data attribute', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <AppShell
        state={buildState({
          toasts: [
            { id: 1, message: 'Settings saved.', tone: 'success' },
            { id: 2, message: 'Network unavailable.', tone: 'error' }
          ]
        })}
        callbacks={buildCallbacks()}
      />
    )
    await flush()

    expect(host.querySelector('[data-toast-tone="success"]')?.textContent).toContain('Success')
    expect(host.querySelector('[data-toast-tone="error"]')?.textContent).toContain('Error')
  })

  it('anchors toast layer to bottom-right', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <AppShell
        state={buildState({
          toasts: [{ id: 1, message: 'Settings saved.', tone: 'success' }]
        })}
        callbacks={buildCallbacks()}
      />
    )
    await flush()

    const toastLayer = host.querySelector('#toast-layer')
    const classTokens = (toastLayer?.className ?? '').split(/\s+/)
    expect(classTokens).toContain('fixed')
    expect(classTokens).toContain('bottom-4')
    expect(classTokens).toContain('right-4')
    expect(classTokens).not.toContain('top-4')
  })

  it('does not render the non-API "Save Settings" button in Shortcuts or Settings tabs', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'shortcuts' })} callbacks={buildCallbacks()} />)
    await flush()
    expect(host.textContent).not.toContain('Save Settings')

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()
    expect(host.textContent).not.toContain('Save Settings')
  })

  it('does not render a top settings save-message surface', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <AppShell
        state={buildState({ activeTab: 'shortcuts' })}
        callbacks={buildCallbacks()}
      />
    )
    await flush()
    expect(host.querySelector('[data-settings-save-message]')).toBeNull()
  })

  it('does not render URL reset controls in Settings tab', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()

    expect(host.querySelector('#settings-reset-transcription-base-url')).toBeNull()
    expect(host.querySelector('#settings-reset-transformation-base-url')).toBeNull()
  })

  it('renders Radix separators in settings sections', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()

    expect(host.querySelectorAll('[data-slot="separator"]').length).toBe(2)
  })

  it('keeps all tab panels mounted and hides inactive panels', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'activity' })} callbacks={buildCallbacks()} />)
    await flush()

    const panels = host.querySelectorAll('[data-tab-panel]')
    expect(panels.length).toBe(6)
    expect(host.querySelector('[data-tab-panel="activity"]')?.classList.contains('hidden')).toBe(false)
    expect(host.querySelector('[data-tab-panel="settings"]')?.classList.contains('hidden')).toBe(true)
    expect(host.querySelector('[data-tab-panel="profiles"]')?.classList.contains('hidden')).toBe(true)
    expect(host.querySelector('[data-tab-panel="dictionary"]')?.classList.contains('hidden')).toBe(true)
  })

  it('blocks leaving Profiles tab with unsaved draft and shows unsaved changes dialog', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onNavigate = vi.fn()
    root.render(<AppShell state={buildState({ activeTab: 'profiles' })} callbacks={buildCallbacks({ onNavigate })} />)
    await flush()

    host.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    expect(nameInput).not.toBeNull()
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} updated`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    expect(onNavigate).not.toHaveBeenCalledWith('settings')
    expect(document.body.textContent).toContain('Unsaved profile changes')
  })

  it('discards draft and continues navigation when Discard is selected in unsaved changes dialog', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onNavigate = vi.fn()
    root.render(<AppShell state={buildState({ activeTab: 'profiles' })} callbacks={buildCallbacks({ onNavigate })} />)
    await flush()

    host.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} updated`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()
    const dialog = findDialogContentByTitle('Unsaved profile changes')
    expect(dialog).not.toBeNull()
    const discardButton = findButtonByText(dialog as ParentNode, 'Discard')
    discardButton?.click()
    await flush()

    expect(onNavigate).toHaveBeenCalledWith('settings')
  })

  it('renders Discard as destructive-red in unsaved changes dialog', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'profiles' })} callbacks={buildCallbacks()} />)
    await flush()

    host.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} updated`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    const dialog = findDialogContentByTitle('Unsaved profile changes')
    expect(dialog).not.toBeNull()
    const discardButton = findButtonByText(dialog as ParentNode, 'Discard')
    expect(discardButton).not.toBeNull()
    expect(discardButton?.className).toContain('bg-destructive')
    expect(discardButton?.className).toContain('text-destructive-foreground')
  })

  it('keeps navigation blocked when Save and continue fails', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onNavigate = vi.fn()
    const onSavePresetDraft = vi.fn().mockResolvedValue(false)
    root.render(
      <AppShell
        state={buildState({ activeTab: 'profiles' })}
        callbacks={buildCallbacks({ onNavigate, onSavePresetDraft })}
      />
    )
    await flush()

    host.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} updated`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()
    const dialog = findDialogContentByTitle('Unsaved profile changes')
    expect(dialog).not.toBeNull()
    const saveAndContinue = findButtonByText(dialog as ParentNode, 'Save and continue')
    saveAndContinue?.click()
    await flush()
    await flush()

    expect(onSavePresetDraft).toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalledWith('settings')
    expect(document.body.textContent).toContain('Unsaved profile changes')
  })

  it('disables Discard while Save and continue is in-flight', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onNavigate = vi.fn()
    let resolveSave!: (value: boolean) => void
    const onSavePresetDraft = vi.fn().mockImplementation(
      async () =>
        await new Promise<boolean>((resolve) => {
          resolveSave = resolve
        })
    )
    root.render(
      <AppShell
        state={buildState({ activeTab: 'profiles' })}
        callbacks={buildCallbacks({ onNavigate, onSavePresetDraft })}
      />
    )
    await flush()

    host.querySelector<HTMLElement>('[data-tab-panel="profiles"] [role="button"]')?.click()
    await flush()
    const nameInput = host.querySelector<HTMLInputElement>('#profile-edit-name')
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, `${nameInput.value} updated`)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flush()

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    await flush()

    const dialog = findDialogContentByTitle('Unsaved profile changes')
    expect(dialog).not.toBeNull()
    const saveAndContinue = findButtonByText(dialog as ParentNode, 'Save and continue')
    expect(saveAndContinue).not.toBeNull()
    saveAndContinue?.click()
    await flush()

    const discardButton = findButtonByText(dialog as ParentNode, 'Discard')
    expect(discardButton).not.toBeNull()
    expect(discardButton?.disabled).toBe(true)

    resolveSave(true)
    await flush()
    await flush()

    expect(onNavigate).toHaveBeenCalledWith('settings')
  })
})
