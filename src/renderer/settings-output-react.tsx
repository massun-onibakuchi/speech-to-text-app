/*
Where: src/renderer/settings-output-react.tsx
What: React-rendered Settings output matrix controls.
Why: Continue Settings migration by moving output controls to React event ownership.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { OutputTextSource, Settings } from '../shared/domain'
import { getSelectedOutputDestinations } from '../shared/output-selection'
import { cn } from './lib/utils'

interface SettingsOutputReactProps {
  settings: Settings
  onChangeOutputSelection: (selection: OutputTextSource, destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }) => void
}

export const SettingsOutputReact = ({
  settings,
  onChangeOutputSelection
}: SettingsOutputReactProps) => {
  const selectedDestinations = getSelectedOutputDestinations(settings.output)
  const [selectedTextSource, setSelectedTextSource] = useState<OutputTextSource>(settings.output.selectedTextSource)
  const [copyChecked, setCopyChecked] = useState(selectedDestinations.copyToClipboard)
  const [pasteChecked, setPasteChecked] = useState(selectedDestinations.pasteAtCursor)

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
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground mb-3">Choose which text version to output, then where to send it.</p>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground mb-2">Output text</legend>
        <label
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            selectedTextSource === 'transcript'
              ? 'border-primary/50 bg-primary/5'
              : 'border-border bg-card hover:bg-accent'
          )}
          data-output-source-card="transcript"
        >
          <input
            type="radio"
            name="settings-output-text-source"
            id="settings-output-text-transcript"
            className="sr-only"
            checked={selectedTextSource === 'transcript'}
            onChange={() => {
              applySelection('transcript', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
            }}
          />
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-4 rounded-full border-2 flex items-center justify-center',
                selectedTextSource === 'transcript' ? 'border-primary' : 'border-border'
              )}
            >
              {selectedTextSource === 'transcript' && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="text-xs text-foreground">Raw dictation</span>
          </div>
        </label>
        <label
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            selectedTextSource === 'transformed'
              ? 'border-primary/50 bg-primary/5'
              : 'border-border bg-card hover:bg-accent'
          )}
          data-output-source-card="transformed"
        >
          <input
            type="radio"
            name="settings-output-text-source"
            id="settings-output-text-transformed"
            className="sr-only"
            checked={selectedTextSource === 'transformed'}
            onChange={() => {
              applySelection('transformed', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
            }}
          />
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-4 rounded-full border-2 flex items-center justify-center',
                selectedTextSource === 'transformed' ? 'border-primary' : 'border-border'
              )}
            >
              {selectedTextSource === 'transformed' && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="text-xs text-foreground">Transformed text</span>
          </div>
        </label>
      </fieldset>
      <p className="text-[11px] text-muted-foreground mt-2">When transformed text is selected, raw dictation is treated as intermediate output.</p>
      <label
        className={cn(
          'mt-3 flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
          copyChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
        )}
        data-output-destination-card="copy"
      >
        <input
          type="checkbox"
          id="settings-output-copy"
          className="sr-only"
          checked={copyChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            applySelection(selectedTextSource, { copyToClipboard: checked, pasteAtCursor: pasteChecked })
          }}
        />
        <div className="flex flex-col">
          <span className="text-xs text-foreground">Copy to clipboard</span>
          <span className="text-[10px] text-muted-foreground">Keep output ready for paste</span>
        </div>
        <span
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            copyChecked ? 'bg-primary' : 'bg-secondary'
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              'inline-block size-4 transform rounded-full bg-primary-foreground transition-transform',
              copyChecked ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </span>
      </label>
      <label
        className={cn(
          'mt-2 flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
          pasteChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
        )}
        data-output-destination-card="paste"
      >
        <input
          type="checkbox"
          id="settings-output-paste"
          className="sr-only"
          checked={pasteChecked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const checked = event.target.checked
            applySelection(selectedTextSource, { copyToClipboard: copyChecked, pasteAtCursor: checked })
          }}
        />
        <div className="flex flex-col">
          <span className="text-xs text-foreground">Paste at cursor</span>
          <span className="text-[10px] text-muted-foreground">Insert output into focused field</span>
        </div>
        <span
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            pasteChecked ? 'bg-primary' : 'bg-secondary'
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              'inline-block size-4 transform rounded-full bg-primary-foreground transition-transform',
              pasteChecked ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </span>
      </label>
      {!copyChecked && !pasteChecked && (
        <p id="settings-output-destinations-warning" className="mt-2 text-[10px] text-warning">
          Both destinations are disabled. Enable at least one destination to receive output text.
        </p>
      )}
    </section>
  )
}
