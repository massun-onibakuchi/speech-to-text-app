/*
Where: src/renderer/settings-api-keys-react.test.tsx
What: Component tests for the Google API key form in the LLM Transformation section.
Why: Guard that individual save/test callbacks fire correctly for the Google provider.
     Updated for issue #197: STT keys moved to SettingsSttProviderFormReact;
     this component now handles only the Google key.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('SettingsApiKeysReact (Google LLM key)', () => {
  it('renders only the Google Gemini API key input', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          apiKeyStatus={{ groq: false, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
        />
      )
    })

    expect(host.querySelector('#settings-api-key-google')).not.toBeNull()
    // STT keys are no longer rendered in this component
    expect(host.querySelector('#settings-api-key-groq')).toBeNull()
    expect(host.querySelector('#settings-api-key-elevenlabs')).toBeNull()
  })

  it('toggles visibility and calls save callback for google', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let resolveSave: (() => void) | null = null
    const onSaveApiKey = vi.fn(
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
          onSaveApiKey={onSaveApiKey}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    const toggle = host.querySelector<HTMLButtonElement>('[data-api-key-visibility-toggle="google"]')!
    expect(input.type).toBe('password')

    await act(async () => { toggle.click() })
    expect(input.type).toBe('text')
    await act(async () => { toggle.click() })
    expect(input.type).toBe('password')

    await act(async () => { setReactInputValue(input, 'my-google-key') })

    expect(host.querySelector('[data-api-key-test="google"]')).toBeNull()

    const saveButton = host.querySelector<HTMLButtonElement>('[data-api-key-save="google"]')!
    expect(saveButton.disabled).toBe(false)
    await act(async () => { saveButton.click() })
    expect(saveButton.disabled).toBe(true)
    expect(onSaveApiKey).toHaveBeenCalledWith('google', 'my-google-key')
    await act(async () => { resolveSave?.() })
    expect(saveButton.disabled).toBe(false)
  })

  it('shows save status message', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          apiKeyStatus={{ groq: false, elevenlabs: false, google: true }}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: 'Saved.' }}
          onSaveApiKey={vi.fn(async () => {})}
        />
      )
    })

    expect(host.querySelector('#api-key-save-status-google')?.textContent).toBe('Saved.')
  })
})
