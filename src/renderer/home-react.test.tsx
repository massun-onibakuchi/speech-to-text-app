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
  ...DEFAULT_SETTINGS,
  transformation: {
    ...DEFAULT_SETTINGS.transformation,
    enabled: true
  }
}

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.innerHTML = ''
})

describe('HomeReact', () => {
  it('renders busy recording state with status and labels parity', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      <HomeReact
        settings={readySettings}
        apiKeyStatus={readyStatus}
        lastTransformSummary="No transformation run yet."
        pendingActionId="recording:startRecording"
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={vi.fn()}
        onRunCompositeTransform={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
    await flush()

    const status = host.querySelector<HTMLElement>('[role="status"]')
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button.command-button')]
    const startButton = buttons.find((button) => button.textContent === 'Starting...')
    const transformButton = buttons.find((button) => button.textContent === 'Run Composite Transform')

    expect(status?.textContent).toBe('Busy')
    expect(status?.classList.contains('is-busy')).toBe(true)
    expect(startButton?.textContent).toBe('Starting...')
    expect(startButton?.disabled).toBe(false)
    expect(transformButton?.disabled).toBe(true)
  })

  it('fires command callbacks for Home actions and blocked deep-link', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRunRecordingCommand = vi.fn()
    const onRunCompositeTransform = vi.fn()
    const onOpenSettings = vi.fn()
    root.render(
      <HomeReact
        settings={{
          ...readySettings,
          transformation: { ...readySettings.transformation, enabled: false }
        }}
        apiKeyStatus={{
          groq: false,
          elevenlabs: false,
          google: false
        }}
        lastTransformSummary="No transformation run yet."
        pendingActionId={null}
        hasCommandError={false}
        isRecording={false}
        onRunRecordingCommand={onRunRecordingCommand}
        onRunCompositeTransform={onRunCompositeTransform}
        onOpenSettings={onOpenSettings}
      />
    )
    await flush()

    const commandButtons = [...host.querySelectorAll<HTMLButtonElement>('button.command-button')]
    const startButton = commandButtons.find((button) => button.textContent === 'Start')
    const transformButton = commandButtons.find((button) => button.textContent === 'Run Composite Transform')
    startButton?.click()
    transformButton?.click()
    const inlineLinks = host.querySelectorAll<HTMLButtonElement>('.inline-link')
    expect(inlineLinks.length).toBeGreaterThan(0)
    inlineLinks[0]?.click()

    // blocked buttons are disabled, so only deep-link callback fires.
    expect(onRunRecordingCommand).not.toHaveBeenCalled()
    expect(onRunCompositeTransform).not.toHaveBeenCalled()
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
