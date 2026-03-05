/*
Where: src/renderer/settings-stt-provider-form-react.test.tsx
What: Component tests for the unified STT provider form (provider, model, API key).
Why: Issue #197 — guard that provider selection updates the model list, API key element IDs,
     and test/save callbacks target the selected provider.
     Issue #299 — updated for Radix Select migration: triggers are <button> elements,
     value changes via pointer events on the dropdown portal.
*/

// @vitest-environment jsdom

// Mock the Radix Select primitive with a minimal shim for testability.
// Radix Select's portal+pointer interaction does not run in jsdom; this shim
// replaces the primitive with native elements so tests focus on component logic.
vi.mock('./components/ui/select', () => {
  const React = require('react')

  // Select root: renders a native <select> wired to onValueChange.
  const Select = ({ value, onValueChange, children }: {
    value?: string
    onValueChange?: (val: string) => void
    children?: React.ReactNode
  }) => React.createElement('select', {
    'data-select-root': 'true',
    value,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value)
  }, children)

  // Trigger shim: keeps id/testid/className for assertions; renders selected value as text.
  const SelectTrigger = React.forwardRef(
    ({ id, 'data-testid': testId, className, children, ...rest }: any, ref: any) =>
      React.createElement('button', {
        ref, id, 'data-testid': testId, 'data-slot': 'select-trigger', className, ...rest
      }, children)
  )
  SelectTrigger.displayName = 'SelectTrigger'

  // Content: pass-through so SelectItem children reach the native <select>.
  const SelectContent = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  SelectContent.displayName = 'SelectContent'

  // Value: renders nothing in shim (native select shows the selected option text).
  const SelectValue = () => null
  SelectValue.displayName = 'SelectValue'

  // Item: renders as <option> so native select can pick it.
  const SelectItem = ({ value, children, className }: { value: string; children?: React.ReactNode; className?: string }) =>
    React.createElement('option', { value, className }, children)
  SelectItem.displayName = 'SelectItem'

  const SelectGroup = ({ children }: any) => React.createElement(React.Fragment, null, children)
  const SelectLabel = ({ children }: any) => React.createElement('span', null, children)
  const SelectSeparator = () => null

  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem, SelectGroup, SelectLabel, SelectSeparator }
})

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

// Simulate selecting a value in the shim native <select> wired to Radix onValueChange.
const changeShimSelect = (selectEl: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  descriptor?.set?.call(selectEl, value)
  selectEl.dispatchEvent(new Event('change', { bubbles: true }))
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
  onSaveApiKey: vi.fn(async () => {}),
  onDeleteApiKey: vi.fn(async () => true)
}

describe('SettingsSttProviderFormReact', () => {
  it('renders groq provider and model by default (matching DEFAULT_SETTINGS)', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<SettingsSttProviderFormReact {...defaultProps} />)
    })

    // Shim renders native <select>; current value must be 'groq'.
    const providerSelect = host.querySelector<HTMLSelectElement>('[data-select-root]')!
    expect(providerSelect.value).toBe('groq')

    // Model select must show the first groq model.
    const modelSelects = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')
    const modelSelect = modelSelects[1]
    expect(modelSelect.value).toBe(STT_MODEL_ALLOWLIST.groq[0])

    // API key input ID matches the selected provider.
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

    const providerSelect = host.querySelector<HTMLSelectElement>('[data-select-root]')!
    await act(async () => { changeShimSelect(providerSelect, 'elevenlabs') })

    expect(onSelectTranscriptionProvider).toHaveBeenCalledWith('elevenlabs')

    // Model select should now show the first elevenlabs model.
    const modelSelects = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')
    expect(modelSelects[1].value).toBe(STT_MODEL_ALLOWLIST.elevenlabs[0])

    // API key input ID should now use elevenlabs.
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

    const providerSelect = host.querySelector<HTMLSelectElement>('[data-select-root]')!
    await act(async () => { changeShimSelect(providerSelect, 'elevenlabs') })

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

    const providerSelect = host.querySelector<HTMLSelectElement>('[data-select-root]')!
    await act(async () => { changeShimSelect(providerSelect, 'elevenlabs') })

    const elevenLabsInput = host.querySelector<HTMLInputElement>('#settings-api-key-elevenlabs')!
    expect(elevenLabsInput.value).toBe(FIXED_API_KEY_MASK)
  })

  // Issue #255/#299: regression guard — provider/model selects must use Radix Select triggers, not native <select>.
  it('renders provider and model selects as Radix Select triggers (not native selects)', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<SettingsSttProviderFormReact {...defaultProps} />)
    })

    // Triggers carry data-slot and data-testid confirming Radix Select usage.
    const providerTrigger = host.querySelector('[data-testid="select-transcription-provider"]')!
    const modelTrigger = host.querySelector('[data-testid="select-transcription-model"]')!
    expect(providerTrigger.getAttribute('data-slot')).toBe('select-trigger')
    expect(modelTrigger.getAttribute('data-slot')).toBe('select-trigger')
    expect(providerTrigger.getAttribute('id')).toBe('settings-transcription-provider')
    expect(modelTrigger.getAttribute('id')).toBe('settings-transcription-model')

    // Label spans with muted foreground are present for provider and model sections.
    const mutedSpans = host.querySelectorAll<HTMLSpanElement>('span.text-muted-foreground')
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

  it('opens delete confirmation and calls delete callback for selected provider', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onDeleteApiKey = vi.fn(async () => true)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          onDeleteApiKey={onDeleteApiKey}
        />
      )
    })

    const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete Groq API key"]')!
    await act(async () => { deleteButton.click() })
    expect(document.body.textContent).toContain('Delete API key?')

    const confirmButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.trim() === 'Delete key'
    )!
    await act(async () => { confirmButton.click() })
    expect(onDeleteApiKey).toHaveBeenCalledWith('groq')
  })

  it('keeps confirmation open when provider delete fails', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onDeleteApiKey = vi.fn(async () => false)

    await act(async () => {
      root?.render(
        <SettingsSttProviderFormReact
          {...defaultProps}
          apiKeyStatus={{ groq: true, elevenlabs: false, google: false }}
          onDeleteApiKey={onDeleteApiKey}
        />
      )
    })

    const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete Groq API key"]')!
    await act(async () => { deleteButton.click() })

    const confirmButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.trim() === 'Delete key'
    )!
    await act(async () => { confirmButton.click() })

    expect(onDeleteApiKey).toHaveBeenCalledWith('groq')
    expect(document.body.textContent).toContain('Delete API key?')
  })
})
