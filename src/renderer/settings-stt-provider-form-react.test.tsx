/*
Where: src/renderer/settings-stt-provider-form-react.test.tsx
What: Component tests for the unified STT provider form (provider, model, API key).
Why: Issue #197 — guard that provider selection updates the model list, API key element IDs,
     and test/save callbacks target the selected provider.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, STT_MODEL_ALLOWLIST } from '../shared/domain'
import { FIXED_API_KEY_MASK } from './api-key-mask'
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
  onSelectTranscriptionProvider: vi.fn(),
  onSelectTranscriptionModel: vi.fn(),
  onSaveApiKey: vi.fn(async () => {})
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

  it('save callback receives the currently selected provider on blur', async () => {
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
    expect(host.querySelector('[data-api-key-save="groq"]')).toBeNull()
    await act(async () => { input.focus() })
    await act(async () => { input.blur() })
    expect(onSaveApiKey).toHaveBeenCalledWith('groq', 'my-groq-key')
  })

  it('does not render STT base URL controls', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact {...defaultProps} />
      )
    })

    expect(host.querySelector('#settings-transcription-base-url')).toBeNull()
    expect(host.querySelector('#settings-reset-transcription-base-url')).toBeNull()
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

  it('shows redacted key indicator for selected provider when key is already saved', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    expect(input.value).toBe(FIXED_API_KEY_MASK)
    expect(host.querySelector('[data-api-key-visibility-toggle="groq"]')).toBeNull()
    expect(host.querySelector('[data-api-key-save="groq"]')).toBeNull()
  })

  it('clears plaintext draft when save status becomes Saved and reverts to redacted indicator', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { input.focus() })
    await act(async () => { setReactInputValue(input, 'new-groq-key') })
    expect(input.value).toBe('new-groq-key')

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          apiKeySaveStatus={{ groq: 'Saved.', elevenlabs: '', google: '' }}
        />
      )
    })

    const rerenderedInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    expect(rerenderedInput.value).toBe(FIXED_API_KEY_MASK)
  })

  it('returns to redacted indicator when focused saved field blurs without draft text', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { input.focus() })
    expect(input.value).toBe('')

    await act(async () => {
      input.blur()
    })

    const rerenderedInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    expect(rerenderedInput.value).toBe(FIXED_API_KEY_MASK)
  })

  it('clears unsaved draft when switching providers so no stale plaintext leaks across tabs', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: true, google: false }}
        />
      )
    })

    const groqInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { groqInput.focus() })
    await act(async () => { setReactInputValue(groqInput, 'temporary-groq-draft') })
    expect(groqInput.value).toBe('temporary-groq-draft')

    const providerSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')!
    await act(async () => {
      setReactSelectValue(providerSelect, 'elevenlabs')
    })

    const elevenLabsInput = host.querySelector<HTMLInputElement>('#settings-api-key-elevenlabs')!
    expect(elevenLabsInput.value).toBe(FIXED_API_KEY_MASK)
  })

  it('shows redacted destination key when switching from unsaved source provider with a draft', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: false, elevenlabs: true, google: false }}
        />
      )
    })

    const groqInput = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { setReactInputValue(groqInput, 'unsaved-groq-draft') })
    expect(groqInput.value).toBe('unsaved-groq-draft')

    const providerSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')!
    await act(async () => {
      setReactSelectValue(providerSelect, 'elevenlabs')
    })

    const elevenLabsInput = host.querySelector<HTMLInputElement>('#settings-api-key-elevenlabs')!
    expect(elevenLabsInput.value).toBe(FIXED_API_KEY_MASK)
  })

  // Issue #255: style regression guard — provider/model selects must use standardized token classes.
  it('renders provider and model selects with standardized token classes and muted-foreground labels', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<SettingsSttProviderFormReact {...defaultProps} />)
    })

    const providerSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-provider')!
    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-transcription-model')!

    for (const [id, el] of [['provider', providerSelect], ['model', modelSelect]] as const) {
      expect(el.className, `${id} should have w-full`).toContain('w-full')
      expect(el.className, `${id} should have rounded-md`).toContain('rounded-md')
      expect(el.className, `${id} should have bg-input/30`).toContain('bg-input/30')
      expect(el.className, `${id} should have focus-visible:ring-2`).toContain('focus-visible:ring-2')
    }

    const mutedSpans = host.querySelectorAll<HTMLSpanElement>('label > span.text-muted-foreground')
    expect(mutedSpans.length).toBeGreaterThanOrEqual(2)
  })

  it('does not call save while selected provider key is in redacted mode', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSaveApiKey = vi.fn(async () => {})

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          onSaveApiKey={onSaveApiKey}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-groq')!
    await act(async () => { input.blur() })
    expect(onSaveApiKey).not.toHaveBeenCalled()
  })
})
