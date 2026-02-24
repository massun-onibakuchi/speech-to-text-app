/*
Where: src/renderer/settings-api-keys-react.test.tsx
What: Component tests for React-rendered Settings API keys section.
Why: Guard API key form behavior and callback ownership during Settings migration.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiKeyProvider } from '../shared/ipc'
import { SettingsApiKeysReact } from './settings-api-keys-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

const setReactInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsApiKeysReact', () => {
  it('toggles visibility, runs test callback, and submits form values', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onTestApiKey = vi.fn(async () => {})
    let resolveSave: (() => void) | null = null
    const onSaveApiKeys = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        })
    )

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          apiKeyStatus={{ groq: false, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          apiKeyTestStatus={{ groq: '', elevenlabs: '', google: '' }}
          saveMessage="Initial save message"
          onTestApiKey={onTestApiKey}
          onSaveApiKeys={onSaveApiKeys}
        />
      )
    })

    const groqInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')
    const toggle = host.querySelector<HTMLButtonElement>('[data-api-key-visibility-toggle="groq"]')
    expect(host.querySelector<HTMLElement>('#api-keys-save-message')?.textContent).toBe('Initial save message')
    expect(host.querySelector<HTMLElement>('#api-key-save-status-groq')?.textContent).toBe('')
    expect(host.querySelector<HTMLElement>('#api-key-test-status-groq')?.textContent).toBe('')

    await act(async () => {
      toggle?.click()
    })
    const visibleGroqInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')
    expect(visibleGroqInput?.type).toBe('text')

    await act(async () => {
      setReactInputValue(visibleGroqInput!, 'key-1')
    })

    const testButton = host.querySelector<HTMLButtonElement>('[data-api-key-test="groq"]')
    await act(async () => {
      testButton?.click()
    })
    expect(onTestApiKey).toHaveBeenCalledTimes(1)
    expect(onTestApiKey).toHaveBeenCalledWith('groq' as ApiKeyProvider, 'key-1')

    const saveButton = host.querySelector<HTMLButtonElement>('button[type="submit"]')
    const form = host.querySelector<HTMLFormElement>('#api-keys-form')
    expect(saveButton?.disabled).toBe(false)
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(saveButton?.disabled).toBe(true)
    await act(async () => {
      resolveSave?.()
    })
    expect(onSaveApiKeys).toHaveBeenCalledTimes(1)
    expect(onSaveApiKeys).toHaveBeenCalledWith({
      groq: 'key-1',
      elevenlabs: '',
      google: ''
    })
    expect(saveButton?.disabled).toBe(false)
  })
})
