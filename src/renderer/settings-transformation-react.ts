/*
Where: src/renderer/settings-transformation-react.ts
What: React-rendered Settings transformation controls and preset management section.
Why: Remove legacy DOM listener ownership for transformation controls while preserving selectors.
*/

import { createElement } from 'react'
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Settings } from '../shared/domain'

interface SettingsTransformationReactProps {
  settings: Settings
  presetNameError: string
  onToggleTransformEnabled: (checked: boolean) => void
  onToggleAutoRun: (checked: boolean) => void
  onSelectActivePreset: (presetId: string) => void
  onSelectDefaultPreset: (presetId: string) => void
  onChangeActivePresetDraft: (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ) => void
  onRunSelectedPreset: () => void
  onAddPreset: () => void
  onRemovePreset: (activePresetId: string) => void
}

export const SettingsTransformationReact = ({
  settings,
  presetNameError,
  onToggleTransformEnabled,
  onToggleAutoRun,
  onSelectActivePreset,
  onSelectDefaultPreset,
  onChangeActivePresetDraft,
  onRunSelectedPreset,
  onAddPreset,
  onRemovePreset
}: SettingsTransformationReactProps) => {
  const activePreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.activePresetId) ??
    settings.transformation.presets[0]

  const [enabled, setEnabled] = useState(settings.transformation.enabled)
  const [autoRun, setAutoRun] = useState(settings.transformation.autoRunDefaultTransform)
  const [presetName, setPresetName] = useState(activePreset?.name ?? 'Default')
  const [presetModel, setPresetModel] = useState(activePreset?.model ?? 'gemini-2.5-flash')
  const [systemPrompt, setSystemPrompt] = useState(activePreset?.systemPrompt ?? '')
  const [userPrompt, setUserPrompt] = useState(activePreset?.userPrompt ?? '')

  useEffect(() => {
    setEnabled(settings.transformation.enabled)
    setAutoRun(settings.transformation.autoRunDefaultTransform)
    setPresetName(activePreset?.name ?? 'Default')
    setPresetModel(activePreset?.model ?? 'gemini-2.5-flash')
    setSystemPrompt(activePreset?.systemPrompt ?? '')
    setUserPrompt(activePreset?.userPrompt ?? '')
  }, [
    settings.transformation.enabled,
    settings.transformation.autoRunDefaultTransform,
    settings.transformation.activePresetId,
    settings.transformation.defaultPresetId,
    activePreset?.name,
    activePreset?.model,
    activePreset?.systemPrompt,
    activePreset?.userPrompt
  ])

  return createElement(
    'div',
    null,
    createElement('h3', null, 'Transformation'),
    createElement(
      'label',
      { className: 'toggle-row' },
      createElement('input', {
        type: 'checkbox',
        id: 'settings-transform-enabled',
        checked: enabled,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const checked = event.target.checked
          setEnabled(checked)
          onToggleTransformEnabled(checked)
        }
      }),
      createElement('span', null, 'Enable transformation')
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Active configuration'),
      createElement(
        'select',
        {
          id: 'settings-transform-active-preset',
          value: settings.transformation.activePresetId,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const selected = event.target.value
            onSelectActivePreset(selected)
          }
        },
        ...settings.transformation.presets.map((preset) =>
          createElement('option', { key: preset.id, value: preset.id }, preset.name)
        )
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Default configuration'),
      createElement(
        'select',
        {
          id: 'settings-transform-default-preset',
          value: settings.transformation.defaultPresetId,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const selected = event.target.value
            onSelectDefaultPreset(selected)
          }
        },
        ...settings.transformation.presets.map((preset) =>
          createElement('option', { key: preset.id, value: preset.id }, preset.name)
        )
      )
    ),
    createElement(
      'div',
      { className: 'settings-actions' },
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-preset-add',
          onClick: () => {
            onAddPreset()
          }
        },
        'Add Configuration'
      ),
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-preset-remove',
          onClick: () => {
            onRemovePreset(settings.transformation.activePresetId)
          }
        },
        'Remove Active Configuration'
      ),
      createElement(
        'button',
        {
          type: 'button',
          id: 'settings-run-selected-preset',
          onClick: () => {
            onRunSelectedPreset()
          }
        },
        'Run Selected Configuration'
      )
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Configuration name'),
      createElement('input', {
        id: 'settings-transform-preset-name',
        type: 'text',
        value: presetName,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const value = event.target.value
          setPresetName(value)
          onChangeActivePresetDraft({ name: value })
        }
      })
    ),
    createElement('p', { className: 'field-error', id: 'settings-error-preset-name' }, presetNameError),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'Configuration model'),
      createElement(
        'select',
        {
          id: 'settings-transform-preset-model',
          value: presetModel,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value as Settings['transformation']['presets'][number]['model']
            setPresetModel(value)
            onChangeActivePresetDraft({ model: value })
          }
        },
        createElement('option', { value: 'gemini-2.5-flash' }, 'gemini-2.5-flash')
      )
    ),
    createElement(
      'label',
      { className: 'toggle-row' },
      createElement('input', {
        type: 'checkbox',
        id: 'settings-transform-auto-run',
        checked: autoRun,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const checked = event.target.checked
          setAutoRun(checked)
          onToggleAutoRun(checked)
        }
      }),
      createElement('span', null, 'Auto-run default transform')
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'System prompt'),
      createElement('textarea', {
        id: 'settings-system-prompt',
        rows: 3,
        value: systemPrompt,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
          const value = event.target.value
          setSystemPrompt(value)
          onChangeActivePresetDraft({ systemPrompt: value })
        }
      })
    ),
    createElement(
      'label',
      { className: 'text-row' },
      createElement('span', null, 'User prompt'),
      createElement('textarea', {
        id: 'settings-user-prompt',
        rows: 3,
        value: userPrompt,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
          const value = event.target.value
          setUserPrompt(value)
          onChangeActivePresetDraft({ userPrompt: value })
        }
      })
    )
  )
}
