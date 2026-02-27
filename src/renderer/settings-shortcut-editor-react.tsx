/*
Where: src/renderer/settings-shortcut-editor-react.tsx
What: React-rendered editable shortcut fields inside the Settings form.
Why: Continue Settings migration by moving shortcut input event ownership to React.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../shared/domain'

type ShortcutKey =
  | 'startRecording'
  | 'stopRecording'
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

interface SettingsShortcutEditorReactProps {
  settings: Settings
  validationErrors: Partial<Record<ShortcutKey, string>>
  onChangeShortcutDraft: (key: ShortcutKey, value: string) => void
}

export const SettingsShortcutEditorReact = ({
  settings,
  validationErrors,
  onChangeShortcutDraft
}: SettingsShortcutEditorReactProps) => {
  const [startRecording, setStartRecording] = useState(settings.shortcuts.startRecording ?? DEFAULT_SETTINGS.shortcuts.startRecording)
  const [stopRecording, setStopRecording] = useState(settings.shortcuts.stopRecording ?? DEFAULT_SETTINGS.shortcuts.stopRecording)
  const [toggleRecording, setToggleRecording] = useState(settings.shortcuts.toggleRecording ?? DEFAULT_SETTINGS.shortcuts.toggleRecording)
  const [cancelRecording, setCancelRecording] = useState(settings.shortcuts.cancelRecording ?? DEFAULT_SETTINGS.shortcuts.cancelRecording)
  const [runTransform, setRunTransform] = useState(settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform)
  const [runTransformOnSelection, setRunTransformOnSelection] = useState(
    settings.shortcuts.runTransformOnSelection ?? DEFAULT_SETTINGS.shortcuts.runTransformOnSelection
  )
  const [pickTransformation, setPickTransformation] = useState(
    settings.shortcuts.pickTransformation ?? DEFAULT_SETTINGS.shortcuts.pickTransformation
  )
  const [changeTransformationDefault, setChangeTransformationDefault] = useState(
    settings.shortcuts.changeTransformationDefault ?? DEFAULT_SETTINGS.shortcuts.changeTransformationDefault
  )

  useEffect(() => {
    setStartRecording(settings.shortcuts.startRecording ?? DEFAULT_SETTINGS.shortcuts.startRecording)
    setStopRecording(settings.shortcuts.stopRecording ?? DEFAULT_SETTINGS.shortcuts.stopRecording)
    setToggleRecording(settings.shortcuts.toggleRecording ?? DEFAULT_SETTINGS.shortcuts.toggleRecording)
    setCancelRecording(settings.shortcuts.cancelRecording ?? DEFAULT_SETTINGS.shortcuts.cancelRecording)
    setRunTransform(settings.shortcuts.runTransform ?? DEFAULT_SETTINGS.shortcuts.runTransform)
    setRunTransformOnSelection(settings.shortcuts.runTransformOnSelection ?? DEFAULT_SETTINGS.shortcuts.runTransformOnSelection)
    setPickTransformation(settings.shortcuts.pickTransformation ?? DEFAULT_SETTINGS.shortcuts.pickTransformation)
    setChangeTransformationDefault(
      settings.shortcuts.changeTransformationDefault ?? DEFAULT_SETTINGS.shortcuts.changeTransformationDefault
    )
  }, [
    settings.shortcuts.startRecording,
    settings.shortcuts.stopRecording,
    settings.shortcuts.toggleRecording,
    settings.shortcuts.cancelRecording,
    settings.shortcuts.runTransform,
    settings.shortcuts.runTransformOnSelection,
    settings.shortcuts.pickTransformation,
    settings.shortcuts.changeTransformationDefault
  ])

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Start recording shortcut</span>
        <input
          id="settings-shortcut-start-recording"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={startRecording}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setStartRecording(value)
            onChangeShortcutDraft('startRecording', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-start-recording">{validationErrors.startRecording ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Stop recording shortcut</span>
        <input
          id="settings-shortcut-stop-recording"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={stopRecording}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setStopRecording(value)
            onChangeShortcutDraft('stopRecording', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-stop-recording">{validationErrors.stopRecording ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Toggle recording shortcut</span>
        <input
          id="settings-shortcut-toggle-recording"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={toggleRecording}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setToggleRecording(value)
            onChangeShortcutDraft('toggleRecording', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-toggle-recording">{validationErrors.toggleRecording ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Cancel recording shortcut</span>
        <input
          id="settings-shortcut-cancel-recording"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={cancelRecording}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setCancelRecording(value)
            onChangeShortcutDraft('cancelRecording', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-cancel-recording">{validationErrors.cancelRecording ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Run transform shortcut</span>
        <input
          id="settings-shortcut-run-transform"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={runTransform}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setRunTransform(value)
            onChangeShortcutDraft('runTransform', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-run-transform">{validationErrors.runTransform ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Run transform on selection shortcut</span>
        <input
          id="settings-shortcut-run-transform-selection"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={runTransformOnSelection}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setRunTransformOnSelection(value)
            onChangeShortcutDraft('runTransformOnSelection', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-run-transform-selection">{validationErrors.runTransformOnSelection ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Pick transformation shortcut</span>
        <input
          id="settings-shortcut-pick-transform"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={pickTransformation}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setPickTransformation(value)
            onChangeShortcutDraft('pickTransformation', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-pick-transform">{validationErrors.pickTransformation ?? ''}</p>
      <label className="flex flex-col gap-1.5 text-xs">
        <span>Change default transformation shortcut</span>
        <input
          id="settings-shortcut-change-default-transform"
          type="text"
          className="h-8 rounded border border-input bg-input px-2 text-xs font-mono"
          value={changeTransformationDefault}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            setChangeTransformationDefault(value)
            onChangeShortcutDraft('changeTransformationDefault', value)
          }}
        />
      </label>
      <p className="min-h-4 text-[10px] text-destructive" id="settings-error-change-default-transform">{validationErrors.changeTransformationDefault ?? ''}</p>
    </div>
  )
}
