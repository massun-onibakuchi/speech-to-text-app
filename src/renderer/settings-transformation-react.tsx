/*
Where: src/renderer/settings-transformation-react.tsx
What: React-rendered Settings transformation controls and preset management section.
Why: Remove legacy DOM listener ownership for transformation controls while preserving selectors.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
     #127: Removed user-facing "Active profile" concept; editor now tracks the default profile.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Settings } from '../shared/domain'

interface SettingsTransformationReactProps {
  settings: Settings
  presetNameError: string
  systemPromptError: string
  userPromptError: string
  onToggleAutoRun: (checked: boolean) => void
  onSelectDefaultPreset: (presetId: string) => void
  onChangeDefaultPresetDraft: (
    patch: Partial<Pick<Settings['transformation']['presets'][number], 'name' | 'model' | 'systemPrompt' | 'userPrompt'>>
  ) => void
  onRunSelectedPreset: () => void
  onAddPreset: () => void
  onRemovePreset: (presetId: string) => void
}

export const SettingsTransformationReact = ({
  settings,
  presetNameError,
  systemPromptError,
  userPromptError,
  onToggleAutoRun,
  onSelectDefaultPreset,
  onChangeDefaultPresetDraft,
  onRunSelectedPreset,
  onAddPreset,
  onRemovePreset
}: SettingsTransformationReactProps) => {
  const defaultPreset =
    settings.transformation.presets.find((preset) => preset.id === settings.transformation.defaultPresetId) ??
    settings.transformation.presets[0]

  const [autoRun, setAutoRun] = useState(settings.transformation.autoRunDefaultTransform)
  const [presetName, setPresetName] = useState(defaultPreset?.name ?? 'Default')
  const [presetModel, setPresetModel] = useState(defaultPreset?.model ?? 'gemini-2.5-flash')
  const [systemPrompt, setSystemPrompt] = useState(defaultPreset?.systemPrompt ?? '')
  const [userPrompt, setUserPrompt] = useState(defaultPreset?.userPrompt ?? '')

  useEffect(() => {
    setAutoRun(settings.transformation.autoRunDefaultTransform)
    setPresetName(defaultPreset?.name ?? 'Default')
    setPresetModel(defaultPreset?.model ?? 'gemini-2.5-flash')
    setSystemPrompt(defaultPreset?.systemPrompt ?? '')
    setUserPrompt(defaultPreset?.userPrompt ?? '')
  }, [
    settings.transformation.autoRunDefaultTransform,
    settings.transformation.defaultPresetId,
    defaultPreset?.name,
    defaultPreset?.model,
    defaultPreset?.systemPrompt,
    defaultPreset?.userPrompt
  ])

  return (
    <div>
      <h3>Transformation</h3>
      <label className="text-row">
        <span>Default profile</span>
        <select
          id="settings-transform-default-preset"
          value={settings.transformation.defaultPresetId}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const selected = event.target.value
            onSelectDefaultPreset(selected)
          }}
        >
          {settings.transformation.presets.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </label>
      <p className="muted" id="settings-help-default-profile">
        Used for recording/capture transformations, the Run Transform shortcut, and manual Transform actions. Saved across app restarts.
      </p>
      <div className="settings-actions">
        <button
          type="button"
          id="settings-preset-add"
          onClick={() => { onAddPreset() }}
        >
          Add Profile
        </button>
        <button
          type="button"
          id="settings-preset-remove"
          onClick={() => { onRemovePreset(settings.transformation.defaultPresetId) }}
        >
          Remove Profile
        </button>
        <button
          type="button"
          id="settings-run-selected-preset"
          onClick={() => { onRunSelectedPreset() }}
        >
          Run Selected Profile
        </button>
      </div>
      <label className="text-row">
        <span>Profile name</span>
        <input
          id="settings-transform-preset-name"
          type="text"
          value={presetName}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setPresetName(value)
            onChangeDefaultPresetDraft({ name: value })
          }}
        />
      </label>
      <p className="field-error" id="settings-error-preset-name">{presetNameError}</p>
      <label className="text-row">
        <span>Profile model</span>
        <select
          id="settings-transform-preset-model"
          value={presetModel}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value as Settings['transformation']['presets'][number]['model']
            setPresetModel(value)
            onChangeDefaultPresetDraft({ model: value })
          }}
        >
          <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        </select>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-transform-auto-run"
          checked={autoRun}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            setAutoRun(checked)
            onToggleAutoRun(checked)
          }}
        />
        <span>Auto-run default transform</span>
      </label>
      <p className="muted" id="settings-help-transform-auto-run">
        Only affects recording/capture automatic transformation using the default profile. Manual transforms still work when this is off.
      </p>
      <label className="text-row">
        <span>System prompt</span>
        <textarea
          id="settings-system-prompt"
          rows={3}
          value={systemPrompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value
            setSystemPrompt(value)
            onChangeDefaultPresetDraft({ systemPrompt: value })
          }}
        />
      </label>
      <p className="field-error" id="settings-error-system-prompt">{systemPromptError}</p>
      <label className="text-row">
        <span>User prompt</span>
        <textarea
          id="settings-user-prompt"
          rows={3}
          value={userPrompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value
            setUserPrompt(value)
            onChangeDefaultPresetDraft({ userPrompt: value })
          }}
        />
      </label>
      <p className="muted" id="settings-help-user-prompt">Required. Include {'{{text}}'} where the transcript should be inserted.</p>
      <p className="field-error" id="settings-error-user-prompt">{userPromptError}</p>
    </div>
  )
}
