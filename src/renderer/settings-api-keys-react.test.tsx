/*
Where: src/renderer/settings-api-keys-react.test.tsx
What: Component tests for the LLM provider readiness and Google credential form.
Why: Guard the new provider-scoped readiness contract while preserving current Google key editing behavior.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LlmProviderStatusSnapshot } from '../shared/ipc'
import { FIXED_API_KEY_MASK } from './api-key-mask'
import { SettingsApiKeysReact } from './settings-api-keys-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

const baseLlmProviderStatus = (): LlmProviderStatusSnapshot => ({
  google: {
    provider: 'google',
    credential: { kind: 'api_key', configured: false },
    status: { kind: 'missing_credentials', message: 'Add a Google API key to enable Gemini transformation.' },
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: false }]
  },
  ollama: {
    provider: 'ollama',
    credential: { kind: 'local' },
    status: { kind: 'runtime_unavailable', message: 'Ollama is not installed.' },
    models: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', available: false }]
  },
  'openai-subscription': {
    provider: 'openai-subscription',
    credential: { kind: 'oauth', configured: false },
    status: { kind: 'oauth_required', message: 'Browser sign-in is required before ChatGPT subscription models can be used.' },
    models: [{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', available: false }]
  }
})

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
  it('renders the Google key field and read-only provider readiness rows', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={baseLlmProviderStatus()}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    expect(host.querySelector('#settings-api-key-google')).not.toBeNull()
    expect(host.querySelector('#llm-provider-status-google')?.textContent).toContain('Add a Google API key')
    expect(host.querySelector('#llm-provider-status-ollama')?.textContent).toContain('Ollama is not installed.')
    expect(host.querySelector('#llm-provider-status-openai-subscription')?.textContent).toContain('Browser sign-in is required')
  })

  it('calls save callback for Google on blur', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSaveApiKey = vi.fn(async () => {})

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={baseLlmProviderStatus()}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={onSaveApiKey}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    await act(async () => {
      setReactInputValue(input, 'my-google-key')
      input.focus()
      input.blur()
    })

    expect(onSaveApiKey).toHaveBeenCalledWith('google', 'my-google-key')
  })

  it('shows redacted mode when the Google credential is already configured', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const llmProviderStatus = baseLlmProviderStatus()
    llmProviderStatus.google.credential = { kind: 'api_key', configured: true }
    llmProviderStatus.google.status = { kind: 'ready', message: 'Google API key is configured.' }
    llmProviderStatus.google.models[0] = {
      ...llmProviderStatus.google.models[0],
      available: true
    }

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={llmProviderStatus}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    expect(input.value).toBe(FIXED_API_KEY_MASK)
  })

  it('does not call save when a redacted saved field blurs without a new draft', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSaveApiKey = vi.fn(async () => {})
    const llmProviderStatus = baseLlmProviderStatus()
    llmProviderStatus.google.credential = { kind: 'api_key', configured: true }
    llmProviderStatus.google.status = { kind: 'ready', message: 'Google API key is configured.' }

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={llmProviderStatus}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={onSaveApiKey}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    await act(async () => {
      input.blur()
    })

    expect(onSaveApiKey).not.toHaveBeenCalled()
  })

  it('returns to redacted mode after the parent rerenders with a saved status', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={baseLlmProviderStatus()}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const input = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    await act(async () => {
      input.focus()
      setReactInputValue(input, 'new-google-key')
    })
    expect(input.value).toBe('new-google-key')

    const updatedStatus = baseLlmProviderStatus()
    updatedStatus.google.credential = { kind: 'api_key', configured: true }
    updatedStatus.google.status = { kind: 'ready', message: 'Google API key is configured.' }
    updatedStatus.google.models[0] = {
      ...updatedStatus.google.models[0],
      available: true
    }

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={updatedStatus}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: 'Saved.' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const rerenderedInput = host.querySelector<HTMLInputElement>('#settings-api-key-google')!
    expect(rerenderedInput.value).toBe(FIXED_API_KEY_MASK)
  })

  it('opens the delete confirmation dialog for the Google key', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const llmProviderStatus = baseLlmProviderStatus()
    llmProviderStatus.google.credential = { kind: 'api_key', configured: true }
    llmProviderStatus.google.status = { kind: 'ready', message: 'Google API key is configured.' }

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={llmProviderStatus}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const deleteButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete Google API key"]')!
    await act(async () => {
      deleteButton.click()
    })

    expect(document.body.textContent).toContain('Delete API key?')
  })

  it('calls the OpenAI subscription connect callback when connect is clicked', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onConnectLlmProvider = vi.fn(async () => true)

    await act(async () => {
      root?.render(
        <SettingsApiKeysReact
          llmProviderStatus={baseLlmProviderStatus()}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={onConnectLlmProvider}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    const connectButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Connect')
    await act(async () => {
      connectButton?.click()
    })

    expect(onConnectLlmProvider).toHaveBeenCalledOnce()
  })
})
