/*
 * Where: src/renderer/shell-chrome-react.test.tsx
 * What: Component tests for the compact app header bar.
 * Why: Guard header metadata and state dot behavior after STY-02 re-architecture.
 *      ShellChromeReact is now a fixed header with recording state indicator only;
 *      tab navigation has moved to the right workspace panel in AppShell.
 */

// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  beforeEach(() => {
    window.electronPlatform = 'linux'
  })

  it('omits app title text and renders ready state dot when not recording', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    expect(host.textContent).not.toContain('Dicta')
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
    expect(host.textContent).not.toContain('Dicta')
  })

  it('renders header element without legacy logo icon container', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    expect(host.querySelector('header')).not.toBeNull()
    expect(host.querySelector('header svg')).toBeNull()
  })

  it('adds drag-region classes to the header and no-drag classes to child groups', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    const header = host.querySelector('header')
    expect(header?.className).toContain('app-region-drag')
    expect(header?.className).toContain('select-none')
    expect(host.querySelectorAll('.app-region-no-drag').length).toBe(1)
  })

  it('uses macOS traffic-light clearance padding when platform is darwin', async () => {
    window.electronPlatform = 'darwin'
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    const header = host.querySelector('header')
    expect(header?.className).toContain('pl-[var(--traffic-light-clearance)]')
  })

  it('uses non-darwin overlay clearance padding on the right side', async () => {
    window.electronPlatform = 'linux'
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(<ShellChromeReact isRecording={false} />)
    await flush()

    const header = host.querySelector('header')
    expect(header?.className).toContain('pr-[var(--titlebar-overlay-clearance)]')
  })
})
