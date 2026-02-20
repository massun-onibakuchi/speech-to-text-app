/*
Where: src/renderer/settings-output-react.test.ts
What: Component tests for React-rendered Settings output section.
Why: Guard output-toggle and restore-defaults callback ownership during migration.
*/

// @vitest-environment jsdom

import { createElement } from 'react'
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
  it('propagates toggle changes and restore-defaults callback', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onToggleTranscriptCopy = vi.fn()
    const onToggleTranscriptPaste = vi.fn()
    const onToggleTransformedCopy = vi.fn()
    const onToggleTransformedPaste = vi.fn()
    const expectedTranscriptCopy = !DEFAULT_SETTINGS.output.transcript.copyToClipboard
    const expectedTranscriptPaste = !DEFAULT_SETTINGS.output.transcript.pasteAtCursor
    const expectedTransformedCopy = !DEFAULT_SETTINGS.output.transformed.copyToClipboard
    const expectedTransformedPaste = !DEFAULT_SETTINGS.output.transformed.pasteAtCursor
    let resolveRestore: (() => void) | null = null
    const onRestoreDefaults = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRestore = resolve
        })
    )

    await act(async () => {
      root?.render(
        createElement(SettingsOutputReact, {
          settings: DEFAULT_SETTINGS,
          onToggleTranscriptCopy,
          onToggleTranscriptPaste,
          onToggleTransformedCopy,
          onToggleTransformedPaste,
          onRestoreDefaults
        })
      )
    })

    const transcriptCopy = host.querySelector<HTMLInputElement>('#settings-transcript-copy')
    await act(async () => {
      transcriptCopy?.click()
    })
    expect(onToggleTranscriptCopy).toHaveBeenCalledWith(expectedTranscriptCopy)

    const transcriptPaste = host.querySelector<HTMLInputElement>('#settings-transcript-paste')
    await act(async () => {
      transcriptPaste?.click()
    })
    expect(onToggleTranscriptPaste).toHaveBeenCalledWith(expectedTranscriptPaste)

    const transformedCopy = host.querySelector<HTMLInputElement>('#settings-transformed-copy')
    await act(async () => {
      transformedCopy?.click()
    })
    expect(onToggleTransformedCopy).toHaveBeenCalledWith(expectedTransformedCopy)

    const transformedPaste = host.querySelector<HTMLInputElement>('#settings-transformed-paste')
    await act(async () => {
      transformedPaste?.click()
    })
    expect(onToggleTransformedPaste).toHaveBeenCalledWith(expectedTransformedPaste)

    const restoreButton = host.querySelector<HTMLButtonElement>('#settings-restore-defaults')
    await act(async () => {
      restoreButton?.click()
    })
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1)
    expect(restoreButton?.disabled).toBe(true)

    await act(async () => {
      resolveRestore?.()
    })
    expect(restoreButton?.disabled).toBe(false)
  })
})
