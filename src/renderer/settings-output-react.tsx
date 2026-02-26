/*
Where: src/renderer/settings-output-react.tsx
What: React-rendered Settings output matrix and defaults restore actions.
Why: Continue Settings migration by moving output controls to React event ownership.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { OutputTextSource, Settings } from '../shared/domain'
import { getSelectedOutputDestinations } from '../shared/output-selection'

interface SettingsOutputReactProps {
  settings: Settings
  onChangeOutputSelection: (selection: OutputTextSource, destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }) => void
  // Intentionally restores both output matrix defaults and shortcut defaults
  // to preserve existing Settings contract.
  onRestoreDefaults: () => Promise<void>
}

export const SettingsOutputReact = ({
  settings,
  onChangeOutputSelection,
  onRestoreDefaults
}: SettingsOutputReactProps) => {
  const selectedDestinations = getSelectedOutputDestinations(settings.output)
  const [selectedTextSource, setSelectedTextSource] = useState<OutputTextSource>(settings.output.selectedTextSource)
  const [copyChecked, setCopyChecked] = useState(selectedDestinations.copyToClipboard)
  const [pasteChecked, setPasteChecked] = useState(selectedDestinations.pasteAtCursor)
  const [restoringDefaults, setRestoringDefaults] = useState(false)

  useEffect(() => {
    const nextDestinations = getSelectedOutputDestinations(settings.output)
    setSelectedTextSource(settings.output.selectedTextSource)
    setCopyChecked(nextDestinations.copyToClipboard)
    setPasteChecked(nextDestinations.pasteAtCursor)
  }, [
    settings.output.selectedTextSource,
    settings.output.transcript.copyToClipboard,
    settings.output.transcript.pasteAtCursor,
    settings.output.transformed.copyToClipboard,
    settings.output.transformed.pasteAtCursor
  ])

  const applySelection = (selection: OutputTextSource, destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }) => {
    setSelectedTextSource(selection)
    setCopyChecked(destinations.copyToClipboard)
    setPasteChecked(destinations.pasteAtCursor)
    onChangeOutputSelection(selection, destinations)
  }

  return (
    <section className="settings-group">
      <h3>Output</h3>
      <p className="muted">Choose which text version to output, then where to send it.</p>
      <fieldset className="settings-subgroup">
        <legend>Output text</legend>
        <label className="toggle-row">
          <input
            type="radio"
            name="settings-output-text-source"
            id="settings-output-text-transcript"
            checked={selectedTextSource === 'transcript'}
            onChange={() => {
              applySelection('transcript', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
            }}
          />
          <span>Raw dictation</span>
        </label>
        <label className="toggle-row">
          <input
            type="radio"
            name="settings-output-text-source"
            id="settings-output-text-transformed"
            checked={selectedTextSource === 'transformed'}
            onChange={() => {
              applySelection('transformed', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
            }}
          />
          <span>Transformed text</span>
        </label>
      </fieldset>
      <p className="muted">When transformed text is selected, raw dictation is treated as intermediate output.</p>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-output-copy"
          checked={copyChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            applySelection(selectedTextSource, { copyToClipboard: checked, pasteAtCursor: pasteChecked })
          }}
        />
        <span>Copy to clipboard</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-output-paste"
          checked={pasteChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            applySelection(selectedTextSource, { copyToClipboard: copyChecked, pasteAtCursor: checked })
          }}
        />
        <span>Paste at cursor</span>
      </label>
      <div className="settings-actions">
        <button
          type="button"
          id="settings-restore-defaults"
          disabled={restoringDefaults}
          onClick={() => {
            setRestoringDefaults(true)
            void onRestoreDefaults().finally(() => {
              setRestoringDefaults(false)
            })
          }}
        >
          Restore Defaults
        </button>
      </div>
    </section>
  )
}
