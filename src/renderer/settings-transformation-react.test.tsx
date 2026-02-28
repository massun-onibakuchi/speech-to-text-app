/*
Where: src/renderer/settings-transformation-react.test.tsx
What: Component tests for React-rendered Settings transformation controls.
Why: Guard callback ownership while migration removes legacy transformation listeners.
     Migrated from .test.ts to .test.tsx alongside the component TSX migration.
     #127: Updated for removal of user-facing Active profile concept.
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

    const onSelectDefaultPreset = vi.fn()
    const onChangeDefaultPresetDraft = vi.fn()
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
          onSelectDefaultPreset={onSelectDefaultPreset}
          onChangeDefaultPresetDraft={onChangeDefaultPresetDraft}
          onRunSelectedPreset={onRunSelectedPreset}
          onAddPreset={onAddPreset}
          onRemovePreset={onRemovePreset}
        />
      )
    })

    // Active profile should no longer appear in the UI (#127)
    expect(host.textContent).not.toContain('Active profile')
    expect(host.textContent).toContain('Default profile')
    expect(host.querySelector('#settings-help-active-profile')).toBeNull()
    expect(host.querySelector('#settings-help-default-profile')?.textContent).toContain('Run Transform shortcut')
    expect(host.querySelector('#settings-help-default-profile')?.textContent).toContain('manual Transform actions')
    expect(host.textContent).toContain('Add Profile')
    // Button text updated: no longer says "Remove Active Profile" (#127)
    expect(host.textContent).toContain('Remove Profile')
    expect(host.textContent).not.toContain('Remove Active Profile')
    expect(host.textContent).toContain('Run Selected Profile')
    expect(host.textContent).toContain('Profile name')
    expect(host.textContent).toContain('Profile model')
    expect(host.textContent).not.toContain('Configuration')

    expect(host.querySelector('#settings-transform-enabled')).toBeNull()
    expect(host.querySelector('#settings-help-transform-enabled')).toBeNull()
    // Active preset selector no longer rendered (#127)
    expect(host.querySelector('#settings-transform-active-preset')).toBeNull()

    await act(async () => {
      host.querySelector<HTMLButtonElement>('#settings-run-selected-preset')?.click()
      host.querySelector<HTMLButtonElement>('#settings-preset-add')?.click()
      host.querySelector<HTMLButtonElement>('#settings-preset-remove')?.click()
    })
    expect(onRunSelectedPreset).toHaveBeenCalledTimes(1)
    expect(onAddPreset).toHaveBeenCalledTimes(1)
    expect(onRemovePreset).toHaveBeenCalledWith('default')

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
    expect(onChangeDefaultPresetDraft).toHaveBeenCalledWith({ name: 'Edited preset' })
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
          onSelectDefaultPreset={() => {}}
          onChangeDefaultPresetDraft={() => {}}
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
          presetNameError="Profile name is required."
          systemPromptError="System prompt is required."
          userPromptError="User prompt must include {{text}}."
          onSelectDefaultPreset={() => {}}
          onChangeDefaultPresetDraft={() => {}}
          onRunSelectedPreset={() => {}}
          onAddPreset={() => {}}
          onRemovePreset={() => {}}
        />
      )
    })
    expect(host.querySelector('#settings-error-preset-name')?.textContent).toContain('Profile name is required.')
    expect(host.querySelector('#settings-help-transform-enabled')).toBeNull()
    // Active profile help text is no longer rendered (#127)
    expect(host.querySelector('#settings-help-active-profile')).toBeNull()
    expect(host.querySelector('#settings-help-default-profile')?.textContent).toContain('Saved across app restarts')
    expect(host.querySelector('#settings-error-system-prompt')?.textContent).toContain('System prompt is required.')
    expect(host.querySelector('#settings-error-user-prompt')?.textContent).toContain('{{text}}')
  })

  it('removes the displayed default profile even when lastPicked/default ids diverge', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const onRemovePreset = vi.fn()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transformation.defaultPresetId = 'default-id'
    settings.transformation.lastPickedPresetId = 'active-id'
    settings.transformation.presets = [
      { ...settings.transformation.presets[0], id: 'active-id', name: 'Active' },
      { ...settings.transformation.presets[0], id: 'default-id', name: 'Default' }
    ]

    await act(async () => {
      root?.render(
        <SettingsTransformationReact
          settings={settings}
          presetNameError=""
          systemPromptError=""
          userPromptError=""
          onSelectDefaultPreset={() => {}}
          onChangeDefaultPresetDraft={() => {}}
          onRunSelectedPreset={() => {}}
          onAddPreset={() => {}}
          onRemovePreset={onRemovePreset}
        />
      )
    })

    await act(async () => {
      host.querySelector<HTMLButtonElement>('#settings-preset-remove')?.click()
    })

    expect(onRemovePreset).toHaveBeenCalledWith('default-id')
  })
})
