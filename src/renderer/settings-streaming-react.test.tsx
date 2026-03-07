/*
Where: src/renderer/settings-streaming-react.test.tsx
What: Component tests for streaming mode settings controls.
Why: Guard the PR-8 UX contract for mode/provider/language selection and raw-only output.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { SettingsStreamingReact } from './settings-streaming-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsStreamingReact', () => {
  it('lets the user switch from default mode to streaming mode', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onSelectProcessingMode = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsStreamingReact
          settings={DEFAULT_SETTINGS}
          isLocked={false}
          onSelectProcessingMode={onSelectProcessingMode}
          onSelectStreamingProvider={vi.fn()}
          onSelectStreamingLanguage={vi.fn()}
        />
      )
    })

    await act(async () => {
      host.querySelector<HTMLElement>('[data-processing-mode-card="streaming"]')?.click()
    })

    expect(onSelectProcessingMode).toHaveBeenCalledWith('streaming')
  })

  it('shows provider defaults and accepts provider changes while streaming mode is active', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.processing.mode = 'streaming'
    settings.processing.streaming.enabled = true
    settings.processing.streaming.provider = 'local_whispercpp_coreml'
    settings.processing.streaming.transport = 'native_stream'
    settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    settings.processing.streaming.outputMode = 'stream_raw_dictation'
    const onSelectStreamingProvider = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsStreamingReact
          settings={settings}
          isLocked={false}
          onSelectProcessingMode={vi.fn()}
          onSelectStreamingProvider={onSelectStreamingProvider}
          onSelectStreamingLanguage={vi.fn()}
        />
      )
    })

    expect(host.querySelector('[data-streaming-provider-summary]')?.textContent).toContain('native_stream')
    expect(host.querySelector('[data-streaming-provider-summary]')?.textContent).toContain('ggml-large-v3-turbo-q5_0')

    await act(async () => {
      host.querySelector<HTMLElement>('[data-streaming-provider-card="groq_whisper_large_v3_turbo"]')?.click()
    })

    expect(onSelectStreamingProvider).toHaveBeenCalledWith('groq_whisper_large_v3_turbo')
  })

  it('keeps transformed streaming visible as disabled copy only', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.processing.mode = 'streaming'
    settings.processing.streaming.enabled = true
    settings.processing.streaming.provider = 'groq_whisper_large_v3_turbo'
    settings.processing.streaming.transport = 'rolling_upload'
    settings.processing.streaming.model = 'whisper-large-v3-turbo'
    settings.processing.streaming.outputMode = 'stream_raw_dictation'

    await act(async () => {
      root?.render(
        <SettingsStreamingReact
          settings={settings}
          isLocked={false}
          onSelectProcessingMode={vi.fn()}
          onSelectStreamingProvider={vi.fn()}
          onSelectStreamingLanguage={vi.fn()}
        />
      )
    })

    expect(host.querySelector('[data-streaming-output-card="stream_raw_dictation"]')?.textContent).toContain('Raw dictation stream')
    expect(host.querySelector('[data-streaming-output-card="stream_transformed"]')?.textContent).toContain('structured transform context contract')
  })

  it('locks mode and provider edits while a streaming session is active', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.processing.mode = 'streaming'
    settings.processing.streaming.enabled = true
    settings.processing.streaming.provider = 'local_whispercpp_coreml'
    settings.processing.streaming.transport = 'native_stream'
    settings.processing.streaming.model = 'ggml-large-v3-turbo-q5_0'
    settings.processing.streaming.outputMode = 'stream_raw_dictation'
    const onSelectProcessingMode = vi.fn()
    const onSelectStreamingProvider = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsStreamingReact
          settings={settings}
          isLocked={true}
          onSelectProcessingMode={onSelectProcessingMode}
          onSelectStreamingProvider={onSelectStreamingProvider}
          onSelectStreamingLanguage={vi.fn()}
        />
      )
    })

    expect(host.querySelector('[data-streaming-settings-lock-note]')?.textContent).toContain('Stop the active streaming session')

    await act(async () => {
      host.querySelector<HTMLElement>('[data-processing-mode-card="default"]')?.click()
      host.querySelector<HTMLElement>('[data-streaming-provider-card="groq_whisper_large_v3_turbo"]')?.click()
    })

    expect(onSelectProcessingMode).not.toHaveBeenCalled()
    expect(onSelectStreamingProvider).not.toHaveBeenCalled()
  })
})
