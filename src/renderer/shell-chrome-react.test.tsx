/*
 * Where: src/renderer/shell-chrome-react.test.tsx
 * What: Component tests for the compact app header bar.
 * Why: Guard header metadata and state dot behavior after STY-02 re-architecture.
 *      ShellChromeReact is now a fixed header with logo + recording state dot only;
 *      tab navigation has moved to the right workspace panel in AppShell.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('renders app name and ready state dot when not recording', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    expect(host.textContent).toContain('Speech-to-Text v1')
    expect(host.textContent).toContain('Ready')
    expect(host.textContent).not.toContain('Recording')
  })

  it('renders recording state dot with "Recording" label when isRecording is true', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={true} />)
    await flush()

    expect(host.textContent).toContain('Recording')
    expect(host.textContent).not.toContain('Ready')
  })

  it('renders header element with logo icon', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    expect(host.querySelector('header')).not.toBeNull()
    // Logo container uses bg-primary/10 class
    expect(host.querySelector('.\\[bg-primary\\/10\\]') ?? host.querySelector('[class*="bg-primary"]')).not.toBeNull()
  })
})
