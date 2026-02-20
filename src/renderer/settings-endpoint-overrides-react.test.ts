/*
Where: src/renderer/settings-endpoint-overrides-react.test.ts
What: Component tests for React-rendered endpoint override controls in Settings.
Why: Guard callback ownership while removing legacy endpoint-reset listener wiring.
*/

// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { SettingsEndpointOverridesReact } from './settings-endpoint-overrides-react'

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

describe('SettingsEndpointOverridesReact', () => {
  it('updates endpoint draft values and reset actions through callbacks', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeTranscriptionBaseUrlDraft = vi.fn()
    const onChangeTransformationBaseUrlDraft = vi.fn()
    const onResetTranscriptionBaseUrlDraft = vi.fn()
    const onResetTransformationBaseUrlDraft = vi.fn()

    await act(async () => {
      root?.render(
        createElement(SettingsEndpointOverridesReact, {
          settings: DEFAULT_SETTINGS,
          transcriptionBaseUrlError: '',
          transformationBaseUrlError: '',
          onChangeTranscriptionBaseUrlDraft,
          onChangeTransformationBaseUrlDraft,
          onResetTranscriptionBaseUrlDraft,
          onResetTransformationBaseUrlDraft
        })
      )
    })

    const transcriptionInput = host.querySelector<HTMLInputElement>('#settings-transcription-base-url')
    await act(async () => {
      setReactInputValue(transcriptionInput!, 'https://stt-proxy.local')
    })
    expect(onChangeTranscriptionBaseUrlDraft).toHaveBeenCalledWith('https://stt-proxy.local')

    const transformationInput = host.querySelector<HTMLInputElement>('#settings-transformation-base-url')
    await act(async () => {
      setReactInputValue(transformationInput!, 'https://llm-proxy.local')
    })
    expect(onChangeTransformationBaseUrlDraft).toHaveBeenCalledWith('https://llm-proxy.local')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('#settings-reset-transcription-base-url')?.click()
      host.querySelector<HTMLButtonElement>('#settings-reset-transformation-base-url')?.click()
    })
    expect(onResetTranscriptionBaseUrlDraft).toHaveBeenCalledTimes(1)
    expect(onResetTransformationBaseUrlDraft).toHaveBeenCalledTimes(1)
  })
})
