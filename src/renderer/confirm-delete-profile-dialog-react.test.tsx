/*
Where: src/renderer/confirm-delete-profile-dialog-react.test.tsx
What: Component tests for profile delete confirmation dialog interaction behavior.
Why: Prevent regressions in destructive-action confirmation semantics for issue #367.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDeleteProfileDialogReact } from './confirm-delete-profile-dialog-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('ConfirmDeleteProfileDialogReact', () => {
  it('renders canonical copy and no close icon', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <ConfirmDeleteProfileDialogReact
          open
          profileName="Alpha"
          pending={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn(async () => true)}
        />
      )
    })

    expect(document.body.textContent).toContain('Delete profile?')
    expect(document.body.textContent).toContain('This deletes the profile "Alpha" from this app.')
    expect(document.body.querySelector('[aria-label="Close"]')).toBeNull()
  })

  it('supports ESC and backdrop click as cancel paths', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onOpenChange = vi.fn()

    await act(async () => {
      root?.render(
        <ConfirmDeleteProfileDialogReact
          open
          profileName="Beta"
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
        <ConfirmDeleteProfileDialogReact
          open
          profileName="Gamma"
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
