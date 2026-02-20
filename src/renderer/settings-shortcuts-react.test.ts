/*
Where: src/renderer/settings-shortcuts-react.test.ts
What: Component tests for React-rendered Settings shortcut contract panel.
Why: Guard Settings shortcut panel rendering while migrating Settings UI slices to React.
*/

// @vitest-environment jsdom

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsShortcutsReact } from './settings-shortcuts-react'

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

describe('SettingsShortcutsReact', () => {
  it('renders shortcut contract rows', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    root.render(
      createElement(SettingsShortcutsReact, {
        shortcuts: [
          { action: 'Start recording', combo: 'Cmd+Opt+R' },
          { action: 'Run transform', combo: 'Cmd+Opt+L' }
        ]
      })
    )

    await flush()

    expect(host.querySelector('h2')?.textContent).toBe('Shortcut Contract')
    const combos = [...host.querySelectorAll<HTMLElement>('.shortcut-combo')].map((node) => node.textContent)
    expect(combos).toEqual(['Cmd+Opt+R', 'Cmd+Opt+L'])
  })
})
