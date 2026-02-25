/*
Where: src/renderer/settings-transformation-react.test.tsx
What: Component tests for React-rendered Settings transformation controls.
Why: Guard callback ownership while migration removes legacy transformation listeners.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
*/

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { SettingsTransformationReact } from './settings-transformation-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('SettingsTransformationReact', () => {
  it('dispatches transformation callbacks from controls', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onToggleTransformEnabled = vi.fn()
    const onToggleAutoRun = vi.fn()
    const onSelectActivePreset = vi.fn()
    const onSelectDefaultPreset = vi.fn()
    const onChangeActivePresetDraft = vi.fn()
    const onRunSelectedPreset = vi.fn()
    const onAddPreset = vi.fn()
    const onRemovePreset = vi.fn()

    await act(async () => {
      root?.render(
        <SettingsTransformationReact
          settings={DEFAULT_SETTINGS}
          presetNameError=""
          systemPromptError=""
          userPromptError=""
          onToggleTransformEnabled={onToggleTransformEnabled}
          onToggleAutoRun={onToggleAutoRun}
          onSelectActivePreset={onSelectActivePreset}
          onSelectDefaultPreset={onSelectDefaultPreset}
          onChangeActivePresetDraft={onChangeActivePresetDraft}
          onRunSelectedPreset={onRunSelectedPreset}
          onAddPreset={onAddPreset}
          onRemovePreset={onRemovePreset}
        />
      )
    })

    await act(async () => {
      host.querySelector<HTMLInputElement>('#settings-transform-enabled')?.click()
    })
    expect(onToggleTransformEnabled).toHaveBeenCalledTimes(1)

    await act(async () => {
      host.querySelector<HTMLInputElement>('#settings-transform-auto-run')?.click()
    })
    expect(onToggleAutoRun).toHaveBeenCalledTimes(1)

    await act(async () => {
      host.querySelector<HTMLButtonElement>('#settings-run-selected-preset')?.click()
      host.querySelector<HTMLButtonElement>('#settings-preset-add')?.click()
      host.querySelector<HTMLButtonElement>('#settings-preset-remove')?.click()
    })
    expect(onRunSelectedPreset).toHaveBeenCalledTimes(1)
    expect(onAddPreset).toHaveBeenCalledTimes(1)
    expect(onRemovePreset).toHaveBeenCalledWith('default')

    const activeSelect = host.querySelector<HTMLSelectElement>('#settings-transform-active-preset')
    await act(async () => {
      activeSelect!.value = 'default'
      activeSelect?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectActivePreset).toHaveBeenCalledWith('default')

    const defaultSelect = host.querySelector<HTMLSelectElement>('#settings-transform-default-preset')
    await act(async () => {
      defaultSelect!.value = 'default'
      defaultSelect?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectDefaultPreset).toHaveBeenCalledWith('default')

    const presetNameInput = host.querySelector<HTMLInputElement>('#settings-transform-preset-name')
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(presetNameInput, 'Edited preset')
      presetNameInput?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChangeActivePresetDraft).toHaveBeenCalledWith({ name: 'Edited preset' })
  })

  it('updates preset validation message on rerendered props', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(
        <SettingsTransformationReact
          settings={DEFAULT_SETTINGS}
          presetNameError=""
          systemPromptError=""
          userPromptError=""
          onToggleTransformEnabled={() => {}}
          onToggleAutoRun={() => {}}
          onSelectActivePreset={() => {}}
          onSelectDefaultPreset={() => {}}
          onChangeActivePresetDraft={() => {}}
          onRunSelectedPreset={() => {}}
          onAddPreset={() => {}}
          onRemovePreset={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-preset-name')?.textContent).toBe('')
    expect(host.querySelector('#settings-help-user-prompt')?.textContent).toContain('{{text}}')

    await act(async () => {
      root?.render(
        <SettingsTransformationReact
          settings={DEFAULT_SETTINGS}
          presetNameError="Preset name is required."
          systemPromptError="System prompt is required."
          userPromptError="User prompt must include {{text}}."
          onToggleTransformEnabled={() => {}}
          onToggleAutoRun={() => {}}
          onSelectActivePreset={() => {}}
          onSelectDefaultPreset={() => {}}
          onChangeActivePresetDraft={() => {}}
          onRunSelectedPreset={() => {}}
          onAddPreset={() => {}}
          onRemovePreset={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-preset-name')?.textContent).toContain('Preset name is required.')
    expect(host.querySelector('#settings-error-system-prompt')?.textContent).toContain('System prompt is required.')
    expect(host.querySelector('#settings-error-user-prompt')?.textContent).toContain('{{text}}')
  })
})
