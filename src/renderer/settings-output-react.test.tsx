/*
Where: src/renderer/settings-output-react.test.tsx
What: Component tests for React-rendered Settings output section.
Why: Guard output-toggle behavior and destination warning rendering after local
     cleanup controls moved into the dedicated LLM settings section.
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
  vi.unstubAllGlobals()
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

    const transcriptText = host.querySelector<HTMLElement>('#settings-output-text-transcript')
    await act(async () => {
      transcriptText?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(1)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: DEFAULT_SETTINGS.output.transcript.pasteAtCursor
    })

    const pasteOutput = host.querySelector<HTMLElement>('#settings-output-paste')
    await act(async () => {
      pasteOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(2)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: true
    })

    const copyOutput = host.querySelector<HTMLElement>('#settings-output-copy')
    await act(async () => {
      copyOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(3)
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

    const copyOutput = host.querySelector<HTMLElement>('#settings-output-copy')
    const pasteOutput = host.querySelector<HTMLElement>('#settings-output-paste')

    if (copyOutput?.getAttribute('aria-checked') === 'true') {
      await act(async () => {
        copyOutput.click()
      })
    }
    if (pasteOutput?.getAttribute('aria-checked') === 'true') {
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

  it('keeps card-surface click behavior for radio and switch cards', async () => {
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

    const transformedCard = host.querySelector<HTMLElement>('[data-output-source-card="transformed"]')
    const transcriptCard = host.querySelector<HTMLElement>('[data-output-source-card="transcript"]')
    const copyCard = host.querySelector<HTMLElement>('[data-output-destination-card="copy"]')
    const transcriptRadio = host.querySelector<HTMLElement>('#settings-output-text-transcript')
    const initialCopyChecked = host.querySelector<HTMLElement>('#settings-output-copy')?.getAttribute('aria-checked') === 'true'
    const initialPasteChecked = host.querySelector<HTMLElement>('#settings-output-paste')?.getAttribute('aria-checked') === 'true'
    const clickTransformed = transcriptRadio?.getAttribute('aria-checked') === 'true'
    const expectedSource = clickTransformed ? 'transformed' : 'transcript'

    await act(async () => {
      if (clickTransformed) {
        transformedCard?.click()
      } else {
        transcriptCard?.click()
      }
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(1)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith(expectedSource, {
      copyToClipboard: initialCopyChecked,
      pasteAtCursor: initialPasteChecked
    })

    await act(async () => {
      copyCard?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(2)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith(expectedSource, {
      copyToClipboard: !initialCopyChecked,
      pasteAtCursor: initialPasteChecked
    })
  })

  it('renders destination labels with text-left and keeps switches after labels', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
        />
      )
    })

    const copyCard = host.querySelector<HTMLElement>('[data-output-destination-card="copy"]')
    const pasteCard = host.querySelector<HTMLElement>('[data-output-destination-card="paste"]')
    expect(copyCard).not.toBeNull()
    expect(pasteCard).not.toBeNull()
    const destinationsFieldset = copyCard?.closest('fieldset')
    expect(destinationsFieldset).not.toBeNull()
    expect(destinationsFieldset?.querySelector('legend')?.textContent?.trim()).toBe('Output Destinations')
    const modeLegend = host.querySelector('fieldset legend')
    expect(modeLegend?.textContent?.trim()).toBe('Output Mode')
    const destinationsLegendClass = destinationsFieldset?.querySelector('legend')?.className ?? ''
    const modeLegendClass = modeLegend?.className ?? ''
    for (const requiredClass of ['text-xs', 'font-medium', 'text-foreground']) {
      expect(modeLegendClass).toContain(requiredClass)
      expect(destinationsLegendClass).toContain(requiredClass)
    }
    expect(destinationsFieldset?.contains(pasteCard as Node)).toBe(true)

    const copyLabelBlock = copyCard?.querySelector<HTMLElement>('.text-left')
    const copySwitch = copyCard?.querySelector<HTMLElement>('#settings-output-copy')
    expect(copyLabelBlock?.textContent).toContain('Copy to clipboard')
    expect(copyLabelBlock?.className).toContain('text-left')
    expect(copySwitch).not.toBeNull()
    const copySwitchAfterLabel = (copyLabelBlock?.compareDocumentPosition(copySwitch as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(copySwitchAfterLabel).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const pasteLabelBlock = pasteCard?.querySelector<HTMLElement>('.text-left')
    const pasteSwitch = pasteCard?.querySelector<HTMLElement>('#settings-output-paste')
    expect(pasteLabelBlock?.textContent).toContain('Paste at cursor')
    expect(pasteLabelBlock?.className).toContain('text-left')
    expect(pasteSwitch).not.toBeNull()
    const pasteSwitchAfterLabel = (pasteLabelBlock?.compareDocumentPosition(pasteSwitch as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(pasteSwitchAfterLabel).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})
