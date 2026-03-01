/*
 * Where: src/renderer/home-react.test.tsx
 * What: Component tests for the redesigned recording controls panel.
 * Why: Guard STY-03 recording button state/ARIA/class transitions and waveform strip.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot } from '../shared/ipc'
import { HomeReact } from './home-react'

const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const readyStatus: ApiKeyStatusSnapshot = {
  groq: true,
  elevenlabs: true,
  google: true
}

const readySettings: Settings = { ...DEFAULT_SETTINGS }

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

describe('HomeReact recording button (STY-03)', () => {
  it('renders idle state with Mic icon and without helper text label', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    // Button exists and is enabled in idle state
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')
    expect(btn).not.toBeNull()
    expect(btn?.disabled).toBe(false)
    // No idle helper text label per issue #294
    expect(host.textContent).not.toContain('Click to record')
    expect(host.querySelector('[aria-label="Open settings panel"]')).toBeNull()
    // No timer in idle state
    expect(host.querySelector('[role="timer"]')).toBeNull()
    // No cancel affordance
    expect(host.querySelector('[aria-label="Cancel recording"]')).toBeNull()
    // Waveform strip has 32 bars
    const waveform = host.querySelector('[role="presentation"]')
    expect(waveform?.children.length).toBe(32)
  })

  it('renders recording state with Stop button, timer, and cancel affordance', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={true}
        onRunRecordingCommand={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    // Button labeled Stop recording when active
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Stop recording"]')
    expect(btn).not.toBeNull()
    expect(btn?.disabled).toBe(false)
    // Timer visible
    expect(host.querySelector('[role="timer"]')).not.toBeNull()
    // Cancel affordance present
    expect(host.querySelector('[aria-label="Cancel recording"]')).not.toBeNull()
    // Idle helper text remains removed while recording state is active
    expect(host.textContent).not.toContain('Click to record')
  })

  it('renders processing state with disabled button and Processing label', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        pendingActionId="recording:toggleRecording"
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Processing, please wait"]')
    expect(btn).not.toBeNull()
    expect(btn?.disabled).toBe(true)
    expect(host.textContent).toContain('Processing...')
    expect(host.querySelector('[role="timer"]')).toBeNull()
  })

  it('dispatches toggleRecording when the recording button is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRunRecordingCommand = vi.fn()
    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={onRunRecordingCommand}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    host.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click()
    expect(onRunRecordingCommand).toHaveBeenCalledWith('toggleRecording')
  })

  it('dispatches cancelRecording from the Cancel affordance', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRunRecordingCommand = vi.fn()
    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={true}
        onRunRecordingCommand={onRunRecordingCommand}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    host.querySelector<HTMLButtonElement>('[aria-label="Cancel recording"]')?.click()
    expect(onRunRecordingCommand).toHaveBeenCalledWith('cancelRecording')
  })

  it('disables recording button and shows blocked reason when prereqs are missing', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onOpenSettings = vi.fn()
    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={{ groq: false, elevenlabs: false, google: false }}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    )
    await flush()

    // Recording button should be disabled when blocked
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')
    expect(btn?.disabled).toBe(true)

    // Blocked reason shown via role="alert"
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('Recording is blocked because the Groq API key is missing')

    // Open Settings deep-link works
    const openSettingsButton = host.querySelector<HTMLButtonElement>('button')
    const blockedOpenSettingsButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Open Settings'
    )
    expect(openSettingsButton).not.toBeNull()
    expect(blockedOpenSettingsButton).not.toBeUndefined()
    blockedOpenSettingsButton?.click()
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
