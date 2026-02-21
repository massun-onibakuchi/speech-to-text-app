/*
Where: src/renderer/settings-output-react.tsx
What: React-rendered Settings output matrix and defaults restore actions.
Why: Continue Settings migration by moving output controls to React event ownership.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Settings } from '../shared/domain'

interface SettingsOutputReactProps {
  settings: Settings
  onToggleTranscriptCopy: (checked: boolean) => void
  onToggleTranscriptPaste: (checked: boolean) => void
  onToggleTransformedCopy: (checked: boolean) => void
  onToggleTransformedPaste: (checked: boolean) => void
  // Intentionally restores both output matrix defaults and shortcut defaults
  // to preserve existing Settings contract.
  onRestoreDefaults: () => Promise<void>
}

export const SettingsOutputReact = ({
  settings,
  onToggleTranscriptCopy,
  onToggleTranscriptPaste,
  onToggleTransformedCopy,
  onToggleTransformedPaste,
  onRestoreDefaults
}: SettingsOutputReactProps) => {
  const [transcriptCopyChecked, setTranscriptCopyChecked] = useState(settings.output.transcript.copyToClipboard)
  const [transcriptPasteChecked, setTranscriptPasteChecked] = useState(settings.output.transcript.pasteAtCursor)
  const [transformedCopyChecked, setTransformedCopyChecked] = useState(settings.output.transformed.copyToClipboard)
  const [transformedPasteChecked, setTransformedPasteChecked] = useState(settings.output.transformed.pasteAtCursor)
  const [restoringDefaults, setRestoringDefaults] = useState(false)

  useEffect(() => {
    setTranscriptCopyChecked(settings.output.transcript.copyToClipboard)
    setTranscriptPasteChecked(settings.output.transcript.pasteAtCursor)
    setTransformedCopyChecked(settings.output.transformed.copyToClipboard)
    setTransformedPasteChecked(settings.output.transformed.pasteAtCursor)
  }, [
    settings.output.transcript.copyToClipboard,
    settings.output.transcript.pasteAtCursor,
    settings.output.transformed.copyToClipboard,
    settings.output.transformed.pasteAtCursor
  ])

  return (
    <section className="settings-group">
      <h3>Output</h3>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-transcript-copy"
          checked={transcriptCopyChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            setTranscriptCopyChecked(checked)
            onToggleTranscriptCopy(checked)
          }}
        />
        <span>Transcript: Copy to clipboard</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-transcript-paste"
          checked={transcriptPasteChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            setTranscriptPasteChecked(checked)
            onToggleTranscriptPaste(checked)
          }}
        />
        <span>Transcript: Paste at cursor</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-transformed-copy"
          checked={transformedCopyChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            setTransformedCopyChecked(checked)
            onToggleTransformedCopy(checked)
          }}
        />
        <span>Transformed: Copy to clipboard</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          id="settings-transformed-paste"
          checked={transformedPasteChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            setTransformedPasteChecked(checked)
            onToggleTransformedPaste(checked)
          }}
        />
        <span>Transformed: Paste at cursor</span>
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
