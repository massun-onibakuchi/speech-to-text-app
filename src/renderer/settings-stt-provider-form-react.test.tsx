/*
Where: src/renderer/settings-stt-provider-form-react.test.tsx
What: Component tests for the unified STT provider form (provider, model, API key, base URL).
Why: Issue #197 — guard that provider selection updates the model list, API key element IDs,
     test/save callbacks target the selected provider, and base URL callback fires correctly.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST } from '../shared/domain'
import { SettingsSttProviderFormReact } from './settings-stt-provider-form-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

const setReactInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const setReactSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

const defaultProps = {
  settings: DEFAULT_SETTINGS,
  apiKeyStatus: { groq: false, elevenlabs: false, google: false },
  apiKeySaveStatus: { groq: '', elevenlabs: '', google: '' },
  baseUrlError: '',
  onSelectTranscriptionProvider: vi.fn(),
  onSelectTranscriptionModel: vi.fn(),
  onSaveApiKey: vi.fn(async () => {}),
  onChangeTranscriptionBaseUrlDraft: vi.fn(),
  onResetTranscriptionBaseUrlDraft: vi.fn()
}

describe('SettingsSttProviderFormReact', () => {
  it('renders groq provider and model by default (matching DEFAULT_SETTINGS)', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<SettingsSttProviderFormReact {...defaultProps} />)
    })

    const providerSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')!
    expect(providerSelect.value).toBe('groq')

    // Groq model list should be shown
    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-model')!
    const modelOptions = Array.from(modelSelect.options).map((o) => o.value)
    expect(modelOptions).toEqual(STT_MODEL_ALLOWLIST.groq)

    // API key input ID matches the selected provider
    expect(host.querySelector('#settings-api-key-groq')).not.toBeNull()
    expect(host.querySelector('#settings-api-key-elevenlabs')).toBeNull()
  })

  it('switches model list and API key input when provider changes to elevenlabs', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSelectTranscriptionProvider = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          onSelectTranscriptionProvider={onSelectTranscriptionProvider}
        />
      )
    })

    const providerSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')!
    await act(async () => {
      setReactSelectValue(providerSelect, 'elevenlabs')
    })

    expect(onSelectTranscriptionProvider).toHaveBeenCalledWith('elevenlabs')

    // Model list should now reflect elevenlabs models
    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-model')!
    const modelOptions = Array.from(modelSelect.options).map((o) => o.value)
    expect(modelOptions).toEqual(STT_MODEL_ALLOWLIST.elevenlabs)

    // API key input ID should now use elevenlabs
    expect(host.querySelector('#settings-api-key-elevenlabs')).not.toBeNull()
    expect(host.querySelector('#settings-api-key-groq')).toBeNull()
  })

  it('save callback receives the currently selected provider', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSaveApiKey = vi.fn(async () => {})

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          onSaveApiKey={onSaveApiKey}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { setReactInputValue(input, 'my-groq-key') })

    expect(host.querySelector('[data-api-key-test="groq"]')).toBeNull()

    const saveButton = host.querySelector<HTMLButtonElement>('[data-api-key-save="groq"]')!
    await act(async () => { saveButton.click() })
    expect(onSaveApiKey).toHaveBeenCalledWith('groq', 'my-groq-key')
  })

  it('calls onChangeTranscriptionBaseUrlDraft when STT base URL changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onChangeTranscriptionBaseUrlDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          onChangeTranscriptionBaseUrlDraft={onChangeTranscriptionBaseUrlDraft}
        />
      )
    })

    const urlInput = host.querySelector<HTMLInputElement>('#settings-transcription-base-url')!
    await act(async () => {
      setReactInputValue(urlInput, 'https://stt-proxy.local')
    })
    expect(onChangeTranscriptionBaseUrlDraft).toHaveBeenCalledWith('https://stt-proxy.local')
  })

  it('reset STT URL button calls onResetTranscriptionBaseUrlDraft', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onResetTranscriptionBaseUrlDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          onResetTranscriptionBaseUrlDraft={onResetTranscriptionBaseUrlDraft}
        />
      )
    })

    await act(async () => {
      host.querySelector<HTMLButtonElement>('#settings-reset-transcription-base-url')?.click()
    })
    expect(onResetTranscriptionBaseUrlDraft).toHaveBeenCalledTimes(1)
  })

  it('shows save status message for the selected provider', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: 'Saved.', elevenlabs: '', google: '' }}
        />
      )
    })

    expect(host.querySelector('#api-key-save-status-groq')?.textContent).toBe('Saved.')
  })
})
