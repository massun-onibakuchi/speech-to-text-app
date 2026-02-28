/*
Where: src/renderer/settings-endpoint-overrides-react.test.tsx
What: Component tests for the LLM base URL override control in the Settings panel.
Why: Guard that the component handles only transformation (LLM) URL after issue #197
     moved STT URL into SettingsSttProviderFormReact.
*/

// @vitest-environment jsdom

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

describe('SettingsEndpointOverridesReact (LLM URL only)', () => {
  it('renders LLM transformation URL input but NOT transcription URL input', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsEndpointOverridesReact
          settings={DEFAULT_SETTINGS}
          transformationBaseUrlError=""
          onChangeTransformationBaseUrlDraft={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-transformation-base-url')).not.toBeNull()
    // STT URL is now in SettingsSttProviderFormReact
    expect(host.querySelector('#settings-transcription-base-url')).toBeNull()
  })

  it('calls onChangeTransformationBaseUrlDraft when LLM URL changes', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onChangeTransformationBaseUrlDraft = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsEndpointOverridesReact
          settings={DEFAULT_SETTINGS}
          transformationBaseUrlError=""
          onChangeTransformationBaseUrlDraft={onChangeTransformationBaseUrlDraft}
        />
      )
    })

    const transformationInput = host.querySelector<HTMLInputElement>('#settings-transformation-base-url')!
    await act(async () => {
      setReactInputValue(transformationInput, 'https://llm-proxy.local')
    })
    expect(onChangeTransformationBaseUrlDraft).toHaveBeenCalledWith('https://llm-proxy.local')
  })

  it('shows validation error text when rerendered with new props', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsEndpointOverridesReact
          settings={DEFAULT_SETTINGS}
          transformationBaseUrlError=""
          onChangeTransformationBaseUrlDraft={() => {}}
        />
      )
    })

    expect(host.querySelector('#settings-error-transformation-base-url')?.textContent).toBe('')

    await act(async () => {
      root?.render(
        <SettingsEndpointOverridesReact
          settings={DEFAULT_SETTINGS}
          transformationBaseUrlError="Transformation URL must use http:// or https://"
          onChangeTransformationBaseUrlDraft={() => {}}
        />
      )
    })

    expect(host.querySelector('#settings-error-transformation-base-url')?.textContent).toContain('must use http:// or https://')
  })

  it('does not render reset LLM URL control', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsEndpointOverridesReact
          settings={DEFAULT_SETTINGS}
          transformationBaseUrlError=""
          onChangeTransformationBaseUrlDraft={vi.fn()}
        />
      )
    })

    expect(host.querySelector('#settings-reset-transformation-base-url')).toBeNull()
  })
})
