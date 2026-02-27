/*
Where: src/renderer/home-react.test.tsx
What: Component tests for React Home rendering/actions.
Why: Guard Home command/status behavior through user-visible contracts.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
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

const readySettings: Settings = {
  ...DEFAULT_SETTINGS
}

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

describe('HomeReact', () => {
  it('renders Home with only toggle control when not recording', async () => {
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

    const status = host.querySelector<HTMLElement>('[role="status"]')
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button.command-button')]
    const toggleButton = buttons.find((button) => button.textContent === 'Toggling...')
    const cancelButton = buttons.find((button) => button.textContent === 'Cancel')
    const startButton = buttons.find((button) => button.textContent === 'Start')
    const stopButton = buttons.find((button) => button.textContent === 'Stop')

    expect(status?.textContent).toBe('Busy')
    expect(status?.classList.contains('is-busy')).toBe(true)
    expect(toggleButton?.textContent).toBe('Toggling...')
    expect(toggleButton?.disabled).toBe(false)
    expect(cancelButton).toBeUndefined()
    expect(startButton).toBeUndefined()
    expect(stopButton).toBeUndefined()
    expect(host.textContent).not.toContain('Transform Shortcut')
  })

  it('shows cancel only during recording and dispatches both recording actions', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRunRecordingCommand = vi.fn()
    root.render(
      <HomeReact
        settings={{
          ...readySettings
        }}
        apiKeyStatus={readyStatus}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={true}
        onRunRecordingCommand={onRunRecordingCommand}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    const commandButtons = [...host.querySelectorAll<HTMLButtonElement>('button.command-button')]
    const toggleButton = commandButtons.find((button) => button.textContent === 'Toggle')
    const cancelButton = commandButtons.find((button) => button.textContent === 'Cancel')
    toggleButton?.click()
    cancelButton?.click()

    expect(toggleButton?.disabled).toBe(false)
    expect(cancelButton?.disabled).toBe(false)
    expect(onRunRecordingCommand).toHaveBeenNthCalledWith(1, 'toggleRecording')
    expect(onRunRecordingCommand).toHaveBeenNthCalledWith(2, 'cancelRecording')
  })

  it('disables toggle when recording is blocked and keeps deep-link + cancel behavior', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRunRecordingCommand = vi.fn()
    const onOpenSettings = vi.fn()
    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={{ groq: false, elevenlabs: false, google: false }}
        pendingActionId={null}
        hasCommandError={false}
        isRecording={true}
        onRunRecordingCommand={onRunRecordingCommand}
        onOpenSettings={onOpenSettings}
      />
    )
    await flush()

    const commandButtons = [...host.querySelectorAll<HTMLButtonElement>('button.command-button')]
    const toggleButton = commandButtons.find((button) => button.textContent === 'Toggle')
    const cancelButton = commandButtons.find((button) => button.textContent === 'Cancel')
    toggleButton?.click()
    cancelButton?.click()

    const inlineLinks = host.querySelectorAll<HTMLButtonElement>('.inline-link')
    expect(inlineLinks.length).toBeGreaterThan(0)
    inlineLinks[0]?.click()

    expect(toggleButton?.disabled).toBe(true)
    expect(cancelButton?.disabled).toBe(false)
    expect(onRunRecordingCommand).toHaveBeenCalledTimes(1)
    expect(onRunRecordingCommand).toHaveBeenCalledWith('cancelRecording')
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
