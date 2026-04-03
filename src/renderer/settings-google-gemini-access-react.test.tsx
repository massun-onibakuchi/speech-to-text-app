/*
Where: src/renderer/settings-google-gemini-access-react.test.tsx
What: Component tests for the Google/Gemini STT-style access wrapper.
Why: Guard the provider -> model -> key layout without relying on Radix portal behavior.
*/

// @vitest-environment jsdom

vi.mock('./components/ui/select', () => {
  const React = require('react')

  const Select = ({ value, onValueChange, disabled, children }: {
    value?: string
    onValueChange?: (val: string) => void
    disabled?: boolean
    children?: React.ReactNode
  }) => {
    const optionChildren = React.Children.toArray(children).filter((child: any) => {
      return child?.type?.displayName !== 'SelectTrigger'
    })

    return React.createElement('select', {
      'data-select-root': 'true',
      value,
      disabled,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value)
    }, optionChildren)
  }

  const SelectTrigger = React.forwardRef(
    ({ id, 'data-testid': testId, className, disabled, children, ...rest }: any, ref: any) =>
      React.createElement('button', {
        ref,
        id,
        'data-testid': testId,
        'data-slot': 'select-trigger',
        className,
        disabled,
        ...rest
      }, children)
  )
  SelectTrigger.displayName = 'SelectTrigger'

  const SelectContent = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  SelectContent.displayName = 'SelectContent'

  const SelectValue = () => null
  SelectValue.displayName = 'SelectValue'

  const SelectItem = ({
    value,
    disabled,
    children,
    className
  }: {
    value: string
    disabled?: boolean
    children?: React.ReactNode
    className?: string
  }) => React.createElement('option', { value, disabled, className }, children)
  SelectItem.displayName = 'SelectItem'

  return {
    Select,
    SelectTrigger,
    SelectContent,
    SelectValue,
    SelectItem
  }
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LlmProviderStatusSnapshot } from '../shared/ipc'
import { SettingsGoogleGeminiAccessReact } from './settings-google-gemini-access-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsGoogleGeminiAccessReact', () => {
  it('renders provider and model selects above the Google key input', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const llmProviderStatus: LlmProviderStatusSnapshot = {
      google: {
        provider: 'google',
        credential: { kind: 'api_key', configured: false },
        status: { kind: 'missing_credentials', message: 'Add a Google API key to enable Gemini transformation.' },
        models: [{ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', available: false }]
      },
      ollama: {
        provider: 'ollama',
        credential: { kind: 'local' },
        status: { kind: 'runtime_unavailable', message: 'Ollama is not installed.' },
        models: [{ id: 'qwen3.5:2b', label: 'qwen3.5:2b', available: false }]
      },
      'openai-subscription': {
        provider: 'openai-subscription',
        credential: { kind: 'cli', installed: false },
        status: { kind: 'cli_not_installed', message: 'Codex CLI is not installed.' },
        models: [{ id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', available: false }]
      }
    }

    await act(async () => {
      root?.render(
        <SettingsGoogleGeminiAccessReact
          llmProviderStatus={llmProviderStatus}
          apiKeySaveStatus={{ groq: '', elevenlabs: '', google: '' }}
          onSaveApiKey={vi.fn(async () => {})}
          onDeleteApiKey={vi.fn(async () => true)}
          onConnectLlmProvider={vi.fn(async () => true)}
          onDisconnectLlmProvider={vi.fn(async () => true)}
        />
      )
    })

    expect(host.textContent).toContain('LLM provider')
    expect(host.textContent).toContain('LLM model')
    expect(host.querySelector('#settings-api-key-google')).not.toBeNull()

    const selects = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')
    expect(selects.length).toBeGreaterThanOrEqual(2)
    expect(Array.from(selects[0].options).map((option) => option.textContent)).toEqual(['Google'])
    expect(Array.from(selects[1].options).map((option) => option.textContent)).toEqual(['gemini-2.5-flash'])
  })
})
