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
import type { ApiKeyStatusSnapshot } from '../shared/ipc'
import { AppShell, type AppShellCallbacks, type AppShellState, type AppTab } from './app-shell-react'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

const readyStatus: ApiKeyStatusSnapshot = { groq: true, elevenlabs: true, google: true }

// Minimal valid state for AppShell rendering
const buildState = (overrides: Partial<AppShellState> = {}): AppShellState => ({
  activeTab: 'activity',
  ping: 'pong',
  settings: DEFAULT_SETTINGS,
  apiKeyStatus: readyStatus,
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' },
  apiKeyTestStatus: { groq: '', elevenlabs: '', google: '' },
  apiKeysSaveMessage: '',
  pendingActionId: null,
  hasCommandError: false,
  audioInputSources: [],
  audioSourceHint: '',
  settingsValidationErrors: {},
  settingsSaveMessage: '',
  toasts: [],
  activity: [],
  ...overrides
})

// Minimal no-op callbacks
const buildCallbacks = (overrides: Partial<AppShellCallbacks> = {}): AppShellCallbacks => ({
  onNavigate: vi.fn(),
  onRunRecordingCommand: vi.fn(),
  onOpenSettings: vi.fn(),
  onTestApiKey: vi.fn().mockResolvedValue(undefined),
  onSaveApiKey: vi.fn().mockResolvedValue(undefined),
  onSaveApiKeys: vi.fn().mockResolvedValue(undefined),
  onRefreshAudioSources: vi.fn().mockResolvedValue(undefined),
  onSelectRecordingMethod: vi.fn(),
  onSelectRecordingSampleRate: vi.fn(),
  onSelectRecordingDevice: vi.fn(),
  onSelectTranscriptionProvider: vi.fn(),
  onSelectTranscriptionModel: vi.fn(),
  onToggleAutoRun: vi.fn(),
  onSelectDefaultPreset: vi.fn(),
  onSelectDefaultPresetAndSave: vi.fn().mockResolvedValue(true),
  onChangeDefaultPresetDraft: vi.fn(),
  onSavePresetDraft: vi.fn().mockResolvedValue(true),
  onRunSelectedPreset: vi.fn(),
  onAddPreset: vi.fn(),
  onAddPresetAndSave: vi.fn().mockResolvedValue(true),
  onRemovePreset: vi.fn(),
  onRemovePresetAndSave: vi.fn().mockResolvedValue(true),
  onChangeTranscriptionBaseUrlDraft: vi.fn(),
  onChangeTransformationBaseUrlDraft: vi.fn(),
  onResetTranscriptionBaseUrlDraft: vi.fn(),
  onResetTransformationBaseUrlDraft: vi.fn(),
  onChangeShortcutDraft: vi.fn(),
  onChangeOutputSelection: vi.fn(),
  onRestoreDefaults: vi.fn().mockResolvedValue(undefined),
  onSave: vi.fn().mockResolvedValue(undefined),
  onDismissToast: vi.fn(),
  isNativeRecording: vi.fn().mockReturnValue(false),
  handleSettingsEnterSaveKeydown: vi.fn(),
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

  it('renders three tab buttons — activity, profiles, settings', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState()} callbacks={buildCallbacks()} />)
    await flush()

    const tabs = ['activity', 'profiles', 'settings'] satisfies AppTab[]
    for (const tab of tabs) {
      expect(host.querySelector(`[data-route-tab="${tab}"]`)).not.toBeNull()
    }
  })

  it('renders Settings IA sections in STY-06a order', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<AppShell state={buildState({ activeTab: 'settings' })} callbacks={buildCallbacks()} />)
    await flush()

    const sectionOrder = Array.from(host.querySelectorAll('[data-settings-section]')).map((node) =>
      node.getAttribute('data-settings-section')
    )
    expect(sectionOrder).toEqual([
      'output',
      'speech-to-text',
      'llm-transformation',
      'audio-input',
      'global-shortcuts'
    ])
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
})
