/*
Where: src/renderer/settings-llm-provider-form-react.test.tsx
What: Component tests for the local LLM provider/model/status settings form.
Why: Guard the moved cleanup controls, literal model labels, and readiness surface semantics.
*/

// @vitest-environment jsdom

// Mock the Radix Select primitive with a minimal shim so tests can assert
// the provider/model logic without depending on portal interaction in jsdom.
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
import { DEFAULT_SETTINGS } from '../shared/domain'
import type { LocalCleanupReadinessSnapshot } from '../shared/ipc'
import { SettingsLlmProviderFormReact } from './settings-llm-provider-form-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('SettingsLlmProviderFormReact', () => {
  const installSpeechApi = (overrides?: {
    getLocalCleanupStatus?: () => Promise<LocalCleanupReadinessSnapshot>
  }) => {
    const api = {
      getLocalCleanupStatus:
        overrides?.getLocalCleanupStatus ??
        vi.fn(async () => ({
          runtime: 'ollama' as const,
          status: { kind: 'ready' as const, message: 'Ollama is available.' },
          availableModels: [
            { id: 'qwen3.5:2b' as const, label: 'qwen3.5:2b' },
            { id: 'qwen3.5:4b' as const, label: 'qwen3.5:4b' },
            { id: 'sorc/qwen3.5-instruct:0.8b' as const, label: 'sorc/qwen3.5-instruct:0.8b' }
          ],
          selectedModelId: 'qwen3.5:2b' as const,
          selectedModelInstalled: true
        }))
    }
    vi.stubGlobal('speechToTextApi', api)
    window.speechToTextApi = api as any
    return api
  }

  it('propagates cleanup toggle changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    installSpeechApi()
    const onChangeCleanupSettings = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={onChangeCleanupSettings}
        />
      )
    })

    const cleanupToggle = host.querySelector<HTMLElement>('#settings-cleanup-enabled')
    await act(async () => {
      cleanupToggle?.click()
    })
    expect(onChangeCleanupSettings).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS.cleanup,
      enabled: true
    })
  })

  it('renders a status panel instead of a fake local API key row', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    installSpeechApi()

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-api-key')).toBeNull()
    expect(host.querySelector('#settings-cleanup-ready')?.textContent).toContain('Ollama is available.')
  })

  it('renders install guidance when runtime_unavailable', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: {
          kind: 'runtime_unavailable',
          message: 'unexpected internal error'
        },
        availableModels: [],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('unexpected internal error')
    expect(warning?.textContent).toContain('Install Ollama, then refresh.')
  })

  it('renders start guidance when server_unreachable', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: {
          kind: 'server_unreachable',
          message: 'connect ECONNREFUSED 127.0.0.1:11434'
        },
        availableModels: [],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('ECONNREFUSED')
    expect(warning?.textContent).toContain('Start Ollama, then refresh.')
  })

  it('renders auth guidance when local runtime auth fails', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: {
          kind: 'auth_error',
          message: 'Ollama request failed with status 401'
        },
        availableModels: [],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('status 401')
    expect(warning?.textContent).toContain('Check the local runtime auth or proxy configuration, then refresh.')
  })

  it('renders supported-model guidance when Ollama is reachable without curated installed models', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: {
          kind: 'no_supported_models',
          message: 'No supported local cleanup model is installed in Ollama.'
        },
        availableModels: [],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-model-warning')
    expect(warning?.textContent).toContain('No supported local cleanup model is installed in Ollama.')
    const cleanupModelSelect = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')[1]
    expect(cleanupModelSelect?.disabled).toBe(true)
  })

  it('warns when the selected cleanup model is not installed', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: { kind: 'selected_model_missing', message: 'The selected cleanup model is not currently installed in Ollama.' },
        availableModels: [{ id: 'qwen3.5:4b', label: 'qwen3.5:4b' }],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-selected-model-warning')?.textContent).toContain(
      'not currently installed'
    )
  })

  it('shows a fallback warning when cleanup diagnostics fail to load', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => {
        throw new Error('IPC unavailable')
      }
    })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-runtime-warning')?.textContent).toContain('IPC unavailable')
  })

  it('refreshes cleanup diagnostics on demand', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const getLocalCleanupStatus = vi
      .fn()
      .mockResolvedValueOnce({
        runtime: 'ollama',
        status: { kind: 'ready', message: 'Ollama is available.' },
        availableModels: [{ id: 'qwen3.5:2b', label: 'qwen3.5:2b' }],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: true
      })
      .mockResolvedValueOnce({
        runtime: 'ollama',
        status: { kind: 'ready', message: 'Ollama is available.' },
        availableModels: [
          { id: 'qwen3.5:2b', label: 'qwen3.5:2b' },
          { id: 'qwen3.5:4b', label: 'qwen3.5:4b' }
        ],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: true
      })

    installSpeechApi({ getLocalCleanupStatus })

    await act(async () => {
      root?.render(
        <SettingsLlmProviderFormReact
          settings={DEFAULT_SETTINGS}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const refreshButton = host.querySelector<HTMLButtonElement>('#settings-cleanup-refresh')
    await act(async () => {
      refreshButton?.click()
    })

    expect(getLocalCleanupStatus).toHaveBeenCalledTimes(2)
    const cleanupModelSelect = host.querySelectorAll<HTMLSelectElement>('[data-select-root]')[1]
    expect(Array.from(cleanupModelSelect?.options ?? []).map((option) => option.textContent)).toContain('qwen3.5:4b')
  })
})
