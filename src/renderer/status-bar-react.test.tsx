/*
 * Where: src/renderer/status-bar-react.test.tsx
 * What: Component tests for STY-07 status bar metadata and connectivity pairing.
 * Why: Ensure footer keeps icon+text status semantics and compact metadata rendering.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { StatusBarReact } from './status-bar-react'

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

describe('StatusBarReact', () => {
  it('renders metadata cluster and ready connectivity when ping is pong', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<StatusBarReact settings={DEFAULT_SETTINGS} ping="pong" />)
    await flush()

    expect(host.textContent).toContain('groq/whisper-large-v3-turbo')
    expect(host.textContent).toContain('google')
    expect(host.textContent).toContain('system_default')
    expect(host.querySelector('[data-status-active-profile]')?.textContent).toContain('Default')
    expect(host.querySelector('[data-status-connectivity]')?.textContent).toContain('Ready')
  })

  it('renders offline connectivity label when ping is not pong', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<StatusBarReact settings={DEFAULT_SETTINGS} ping="nope" />)
    await flush()

    expect(host.querySelector('[data-status-connectivity]')?.textContent).toContain('Offline')
  })
})

