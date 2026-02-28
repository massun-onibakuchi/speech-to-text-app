/*
Where: src/renderer/settings-output-react.test.tsx
What: Component tests for React-rendered Settings output section.
Why: Guard output-toggle behavior and destination warning rendering.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { SettingsOutputReact } from './settings-output-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsOutputReact', () => {
  it('propagates toggle changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeOutputSelection = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={onChangeOutputSelection}
        />
      )
    })

    const transcriptText = host.querySelector<HTMLInputElement>('#settings-output-text-transcript')
    await act(async () => {
      transcriptText?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: DEFAULT_SETTINGS.output.transcript.pasteAtCursor
    })

    const pasteOutput = host.querySelector<HTMLInputElement>('#settings-output-paste')
    await act(async () => {
      pasteOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: true
    })

    const copyOutput = host.querySelector<HTMLInputElement>('#settings-output-copy')
    await act(async () => {
      copyOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: false,
      pasteAtCursor: true
    })
  })

  it('shows destination warning when both output destinations are disabled', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeOutputSelection = vi.fn()
    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={onChangeOutputSelection}
        />
      )
    })

    const copyOutput = host.querySelector<HTMLInputElement>('#settings-output-copy')
    const pasteOutput = host.querySelector<HTMLInputElement>('#settings-output-paste')

    if (copyOutput?.checked) {
      await act(async () => {
        copyOutput.click()
      })
    }
    if (pasteOutput?.checked) {
      await act(async () => {
        pasteOutput.click()
      })
    }

    expect(host.querySelector('#settings-output-destinations-warning')?.textContent).toContain('Both destinations are disabled')

    const copyCard = host.querySelector('[data-output-destination-card="copy"]')
    const pasteCard = host.querySelector('[data-output-destination-card="paste"]')
    expect(copyCard?.className).toContain('border-border')
    expect(pasteCard?.className).toContain('border-border')
  })
})
