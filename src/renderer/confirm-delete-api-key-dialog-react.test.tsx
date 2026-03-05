/*
Where: src/renderer/confirm-delete-api-key-dialog-react.test.tsx
What: Component tests for delete confirmation dialog interaction contract.
Why: Lock cancel paths and destructive-action semantics for issue #335.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDeleteApiKeyDialogReact } from './confirm-delete-api-key-dialog-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('ConfirmDeleteApiKeyDialogReact', () => {
  it('renders canonical copy and no close icon', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <ConfirmDeleteApiKeyDialogReact
          open
          providerLabel="Groq"
          pending={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn(async () => true)}
        />
      )
    })

    expect(document.body.textContent).toContain('Delete API key?')
    expect(document.body.textContent).toContain('This deletes the saved Groq API key from this app.')
    expect(document.body.querySelector('[aria-label="Close"]')).toBeNull()
  })

  it('supports ESC and backdrop click as cancel paths', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onOpenChange = vi.fn()

    await act(async () => {
      root?.render(
        <ConfirmDeleteApiKeyDialogReact
          open
          providerLabel="Google"
          pending={false}
          onOpenChange={onOpenChange}
          onConfirm={vi.fn(async () => true)}
        />
      )
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)

    const overlay = document.body.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      overlay.click()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps cancel path locked while pending', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onOpenChange = vi.fn()

    await act(async () => {
      root?.render(
        <ConfirmDeleteApiKeyDialogReact
          open
          providerLabel="ElevenLabs"
          pending
          onOpenChange={onOpenChange}
          onConfirm={vi.fn(async () => true)}
        />
      )
    })

    const cancelButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.trim() === 'Cancel'
    )!
    expect(cancelButton.disabled).toBe(true)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
