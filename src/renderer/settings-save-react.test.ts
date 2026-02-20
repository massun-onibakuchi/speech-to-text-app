/*
Where: src/renderer/settings-save-react.test.ts
What: Component tests for React-rendered Settings save action button.
Why: Guard save callback ownership after removing legacy form submit listener wiring.
*/

// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsSaveReact } from './settings-save-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsSaveReact', () => {
  it('runs save callback and disables button while save is pending', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    let resolveSave: (() => void) | null = null
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        })
    )

    await act(async () => {
      root?.render(createElement(SettingsSaveReact, { saveMessage: '', onSave }))
    })

    const saveButton = host.querySelector<HTMLButtonElement>('button')
    expect(saveButton?.disabled).toBe(false)

    await act(async () => {
      saveButton?.click()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saveButton?.disabled).toBe(true)

    await act(async () => {
      resolveSave?.()
    })
    expect(saveButton?.disabled).toBe(false)
  })

  it('re-enables button when save callback rejects', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    let rejectSave: ((reason?: unknown) => void) | null = null
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )

    await act(async () => {
      root?.render(createElement(SettingsSaveReact, { saveMessage: '', onSave }))
    })

    const saveButton = host.querySelector<HTMLButtonElement>('button')
    expect(saveButton?.disabled).toBe(false)

    await act(async () => {
      saveButton?.click()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saveButton?.disabled).toBe(true)

    await act(async () => {
      rejectSave?.(new Error('save failed'))
    })
    expect(saveButton?.disabled).toBe(false)
  })

  it('renders save message from props', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(createElement(SettingsSaveReact, { saveMessage: 'Settings saved.', onSave: async () => {} }))
    })

    expect(host.textContent).toContain('Settings saved.')
  })
})
