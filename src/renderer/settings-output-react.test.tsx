/*
Where: src/renderer/settings-output-react.test.tsx
What: Component tests for React-rendered Settings output section.
Why: Guard output-toggle behavior and destination warning rendering.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import type { LocalCleanupReadinessSnapshot } from '../shared/ipc'
import { SettingsOutputReact } from './settings-output-react'

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

describe('SettingsOutputReact', () => {
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
            { id: 'qwen3.5:2b' as const, label: 'Qwen 3.5 2B' },
            { id: 'qwen3.5:4b' as const, label: 'Qwen 3.5 4B' },
            { id: 'sorc/qwen3.5-instruct:0.8b' as const, label: 'Sorc Qwen 3.5 Instruct 0.8B' }
          ],
          selectedModelId: 'qwen3.5:2b' as const,
          selectedModelInstalled: true
        }))
    }
    vi.stubGlobal('speechToTextApi', api)
    window.speechToTextApi = api as any
    return api
  }

  it('propagates toggle changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeOutputSelection = vi.fn()
    installSpeechApi()

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={onChangeOutputSelection}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const transcriptText = host.querySelector<HTMLElement>('#settings-output-text-transcript')
    await act(async () => {
      transcriptText?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(1)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: DEFAULT_SETTINGS.output.transcript.pasteAtCursor
    })

    const pasteOutput = host.querySelector<HTMLElement>('#settings-output-paste')
    await act(async () => {
      pasteOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(2)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: DEFAULT_SETTINGS.output.transcript.copyToClipboard,
      pasteAtCursor: true
    })

    const copyOutput = host.querySelector<HTMLElement>('#settings-output-copy')
    await act(async () => {
      copyOutput?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(3)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith('transcript', {
      copyToClipboard: false,
      pasteAtCursor: true
    })
  })

  it('shows destination warning when both output destinations are disabled', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeOutputSelection = vi.fn()
    installSpeechApi()
    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={onChangeOutputSelection}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const copyOutput = host.querySelector<HTMLElement>('#settings-output-copy')
    const pasteOutput = host.querySelector<HTMLElement>('#settings-output-paste')

    if (copyOutput?.getAttribute('aria-checked') === 'true') {
      await act(async () => {
        copyOutput.click()
      })
    }
    if (pasteOutput?.getAttribute('aria-checked') === 'true') {
      await act(async () => {
        pasteOutput.click()
      })
    }

    expect(host.querySelector('#settings-output-destinations-warning')?.textContent).toContain('Both destinations are disabled')

    const copyCard = host.querySelector('[data-output-destination-card="copy"]')
    const pasteCard = host.querySelector('[data-output-destination-card="paste"]')
    expect(copyCard?.className).toContain('border-border')
    expect(pasteCard?.className).toContain('border-border')
  })

  it('keeps card-surface click behavior for radio and switch cards', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeOutputSelection = vi.fn()
    installSpeechApi()
    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={onChangeOutputSelection}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const transformedCard = host.querySelector<HTMLElement>('[data-output-source-card="transformed"]')
    const transcriptCard = host.querySelector<HTMLElement>('[data-output-source-card="transcript"]')
    const copyCard = host.querySelector<HTMLElement>('[data-output-destination-card="copy"]')
    const transcriptRadio = host.querySelector<HTMLElement>('#settings-output-text-transcript')
    const initialCopyChecked = host.querySelector<HTMLElement>('#settings-output-copy')?.getAttribute('aria-checked') === 'true'
    const initialPasteChecked = host.querySelector<HTMLElement>('#settings-output-paste')?.getAttribute('aria-checked') === 'true'
    const clickTransformed = transcriptRadio?.getAttribute('aria-checked') === 'true'
    const expectedSource = clickTransformed ? 'transformed' : 'transcript'

    await act(async () => {
      if (clickTransformed) {
        transformedCard?.click()
      } else {
        transcriptCard?.click()
      }
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(1)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith(expectedSource, {
      copyToClipboard: initialCopyChecked,
      pasteAtCursor: initialPasteChecked
    })

    await act(async () => {
      copyCard?.click()
    })
    expect(onChangeOutputSelection).toHaveBeenCalledTimes(2)
    expect(onChangeOutputSelection).toHaveBeenLastCalledWith(expectedSource, {
      copyToClipboard: !initialCopyChecked,
      pasteAtCursor: initialPasteChecked
    })
  })

  it('renders destination labels with text-left and keeps switches after labels', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi()
    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const copyCard = host.querySelector<HTMLElement>('[data-output-destination-card="copy"]')
    const pasteCard = host.querySelector<HTMLElement>('[data-output-destination-card="paste"]')
    expect(copyCard).not.toBeNull()
    expect(pasteCard).not.toBeNull()
    const destinationsFieldset = copyCard?.closest('fieldset')
    expect(destinationsFieldset).not.toBeNull()
    expect(destinationsFieldset?.querySelector('legend')?.textContent?.trim()).toBe('Output Destinations')
    const modeLegend = host.querySelector('fieldset legend')
    expect(modeLegend?.textContent?.trim()).toBe('Output Mode')
    const destinationsLegendClass = destinationsFieldset?.querySelector('legend')?.className ?? ''
    const modeLegendClass = modeLegend?.className ?? ''
    for (const requiredClass of ['text-xs', 'font-medium', 'text-foreground']) {
      expect(modeLegendClass).toContain(requiredClass)
      expect(destinationsLegendClass).toContain(requiredClass)
    }
    expect(destinationsFieldset?.contains(pasteCard as Node)).toBe(true)

    const copyLabelBlock = copyCard?.querySelector<HTMLElement>('.text-left')
    const copySwitch = copyCard?.querySelector<HTMLElement>('#settings-output-copy')
    expect(copyLabelBlock?.textContent).toContain('Copy to clipboard')
    expect(copyLabelBlock?.className).toContain('text-left')
    expect(copySwitch).not.toBeNull()
    const copySwitchAfterLabel = (copyLabelBlock?.compareDocumentPosition(copySwitch as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(copySwitchAfterLabel).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const pasteLabelBlock = pasteCard?.querySelector<HTMLElement>('.text-left')
    const pasteSwitch = pasteCard?.querySelector<HTMLElement>('#settings-output-paste')
    expect(pasteLabelBlock?.textContent).toContain('Paste at cursor')
    expect(pasteLabelBlock?.className).toContain('text-left')
    expect(pasteSwitch).not.toBeNull()
    const pasteSwitchAfterLabel = (pasteLabelBlock?.compareDocumentPosition(pasteSwitch as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(pasteSwitchAfterLabel).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('propagates cleanup toggle and model changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi()
    const onChangeCleanupSettings = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
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

    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-cleanup-model')
    await act(async () => {
      if (modelSelect) {
        modelSelect.value = 'sorc/qwen3.5-instruct:0.8b'
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    expect(onChangeCleanupSettings).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS.cleanup,
      localModelId: 'sorc/qwen3.5-instruct:0.8b'
    })
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
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('unexpected internal error')
    expect(warning?.textContent).toContain('Install Ollama, then refresh.')
    const link = host.querySelector<HTMLAnchorElement>('#settings-cleanup-runtime-warning a')
    expect(link?.href).toBe('https://ollama.com/')
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
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('ECONNREFUSED')
    expect(warning?.textContent).toContain('Start Ollama, then refresh.')
    const link = host.querySelector<HTMLAnchorElement>('#settings-cleanup-runtime-warning a')
    expect(link?.href).toBe('https://ollama.com/')
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
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-model-warning')
    expect(warning?.textContent).toContain('No supported local cleanup model is installed in Ollama.')
    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-cleanup-model')
    expect(modelSelect?.disabled).toBe(true)
  })

  it('renders a generic fallback warning when cleanup readiness is unknown', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: {
          kind: 'unknown',
          message: 'Diagnostics returned an unexpected state.'
        },
        availableModels: [],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const warning = host.querySelector('#settings-cleanup-runtime-warning')
    expect(warning?.textContent).toContain('Diagnostics returned an unexpected state.')
    expect(warning?.textContent).toContain('Check the local cleanup runtime, then refresh.')
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
        availableModels: [{ id: 'qwen3.5:2b', label: 'Qwen 3.5 2B' }],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: true
      })
      .mockResolvedValueOnce({
        runtime: 'ollama',
        status: { kind: 'ready', message: 'Ollama is available.' },
        availableModels: [
          { id: 'qwen3.5:2b', label: 'Qwen 3.5 2B' },
          { id: 'qwen3.5:4b', label: 'Qwen 3.5 4B' }
        ],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: true
      })

    installSpeechApi({ getLocalCleanupStatus })

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    const refreshButton = host.querySelector<HTMLButtonElement>('#settings-cleanup-refresh')
    await act(async () => {
      refreshButton?.click()
    })

    expect(getLocalCleanupStatus).toHaveBeenCalledTimes(2)
    const refreshedOption = host.querySelector<HTMLSelectElement>('#settings-cleanup-model')?.querySelector('option[value="qwen3.5:4b"]')
    expect(refreshedOption?.textContent).toContain('Qwen 3.5 4B')
  })

  it('warns when the selected cleanup model is not installed', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    installSpeechApi({
      getLocalCleanupStatus: async () => ({
        runtime: 'ollama',
        status: { kind: 'selected_model_missing', message: 'The selected cleanup model is not currently installed in Ollama.' },
        availableModels: [{ id: 'qwen3.5:4b', label: 'Qwen 3.5 4B' }],
        selectedModelId: 'qwen3.5:2b',
        selectedModelInstalled: false
      })
    })

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-selected-model-warning')?.textContent).toContain(
      'not currently installed'
    )
    const modelSelect = host.querySelector<HTMLSelectElement>('#settings-cleanup-model')
    const missingOption = modelSelect?.querySelector<HTMLOptionElement>('option[value="qwen3.5:2b"]')
    expect(missingOption?.disabled).toBe(true)
    expect(missingOption?.textContent).toContain('not installed')
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
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-runtime-warning')?.textContent).toContain('IPC unavailable')
  })

  it('shows a fallback warning when the cleanup diagnostics API is missing', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    vi.stubGlobal('speechToTextApi', {} as any)
    window.speechToTextApi = {} as any

    await act(async () => {
      root?.render(
        <SettingsOutputReact
          settings={DEFAULT_SETTINGS}
          onChangeOutputSelection={vi.fn()}
          onChangeCleanupSettings={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-cleanup-runtime-warning')?.textContent).toContain('not a function')
  })
})
