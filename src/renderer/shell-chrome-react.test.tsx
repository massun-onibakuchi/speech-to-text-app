/*
Where: src/renderer/shell-chrome-react.test.tsx
What: Component tests for React-rendered shell chrome.
Why: Guard hero metadata and top navigation ownership during React migration.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { ShellChromeReact } from './shell-chrome-react'

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

describe('ShellChromeReact', () => {
  it('renders shell metadata and navigates through React click handlers', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onNavigate = vi.fn()

    root.render(
      <ShellChromeReact
        ping="pong"
        settings={DEFAULT_SETTINGS}
        currentPage="home"
        onNavigate={onNavigate}
      />
    )
    await flush()

    expect(host.querySelector('h1')?.textContent).toBe('Speech-to-Text v1')
    expect(host.textContent).toContain(`STT ${DEFAULT_SETTINGS.transcription.provider} / ${DEFAULT_SETTINGS.transcription.model}`)
    expect(host.querySelectorAll<HTMLButtonElement>('[data-route-tab]').length).toBe(2)

    host.querySelector<HTMLButtonElement>('[data-route-tab="settings"]')?.click()
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('settings')
  })
})
