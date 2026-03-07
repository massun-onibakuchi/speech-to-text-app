/*
Where: src/renderer/settings-output-react.tsx
What: React-rendered Settings output matrix controls.
Why: Continue Settings migration by moving output controls to React event ownership.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { OutputTextSource, Settings } from '../shared/domain'
import { getSelectedOutputDestinations } from '../shared/output-selection'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { Switch } from './components/ui/switch'
import { cn } from './lib/utils'

interface SettingsOutputReactProps {
  settings: Settings
  onChangeOutputSelection: (selection: OutputTextSource, destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }) => void
}

export const SettingsOutputReact = ({
  settings,
  onChangeOutputSelection
}: SettingsOutputReactProps) => {
  const sectionLegendClassName = 'text-xs font-medium text-foreground mb-2'
  const isStreamingMode = settings.processing.mode === 'streaming'
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
    if (isStreamingMode) {
      return
    }
    setSelectedTextSource(selection)
    setCopyChecked(destinations.copyToClipboard)
    setPasteChecked(destinations.pasteAtCursor)
    onChangeOutputSelection(selection, destinations)
  }

  const effectiveSelectedTextSource = isStreamingMode ? 'transcript' : selectedTextSource
  const effectiveCopyChecked = isStreamingMode ? false : copyChecked
  const effectivePasteChecked = isStreamingMode ? true : pasteChecked

  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground mb-3">
        {isStreamingMode
          ? 'Streaming mode always commits raw dictation with paste-at-cursor. Batch output preferences below are preserved for Default mode.'
          : 'Choose which text version to output, then where to send it.'}
      </p>
      <fieldset className="space-y-2">
        <legend className={sectionLegendClassName}>Output Mode</legend>
        <RadioGroup
          value={effectiveSelectedTextSource}
          onValueChange={(value) => {
            const source = value as OutputTextSource
            applySelection(source, { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
          }}
          className="space-y-2"
        >
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
              effectiveSelectedTextSource === 'transcript'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card hover:bg-accent'
            )}
            data-output-source-card="transcript"
            onClick={() => {
              if (effectiveSelectedTextSource !== 'transcript') {
                applySelection('transcript', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
              }
            }}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="transcript"
                id="settings-output-text-transcript"
                aria-label="Raw dictation"
                disabled={isStreamingMode}
                onClick={(event) => {
                  event.stopPropagation()
                }}
              />
              <span className="text-xs text-foreground">Raw dictation</span>
            </div>
          </div>
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
              effectiveSelectedTextSource === 'transformed'
                ? 'border-primary/50 bg-primary/5'
                : isStreamingMode
                ? 'border-border bg-card'
                : 'border-border bg-card hover:bg-accent'
            )}
            data-output-source-card="transformed"
            onClick={() => {
              if (effectiveSelectedTextSource !== 'transformed') {
                applySelection('transformed', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
              }
            }}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="transformed"
                id="settings-output-text-transformed"
                aria-label="Transformed text"
                disabled={isStreamingMode}
                onClick={(event) => {
                  event.stopPropagation()
                }}
              />
              <span className="text-xs text-foreground">Transformed text</span>
            </div>
            {isStreamingMode ? (
              <span className="text-[10px] text-muted-foreground">Default mode only</span>
            ) : null}
          </div>
        </RadioGroup>
      </fieldset>
      <fieldset className="space-y-2 mt-3">
        <legend className={sectionLegendClassName}>Output Destinations</legend>
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            effectiveCopyChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
          )}
          data-output-destination-card="copy"
          onClick={() => {
            applySelection(selectedTextSource, {
              copyToClipboard: !copyChecked,
              pasteAtCursor: pasteChecked
            })
          }}
        >
          <div className="flex flex-col text-left">
            <span className="text-xs text-foreground">Copy to clipboard</span>
            <span className="text-[10px] text-muted-foreground">
              {isStreamingMode ? 'Disabled while streaming raw dictation is active' : 'Keep output ready for paste'}
            </span>
          </div>
          <Switch
            id="settings-output-copy"
            aria-label="Copy to clipboard"
            checked={effectiveCopyChecked}
            disabled={isStreamingMode}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onCheckedChange={(checked) => {
              applySelection(selectedTextSource, { copyToClipboard: checked, pasteAtCursor: pasteChecked })
            }}
          />
        </div>
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            effectivePasteChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
          )}
          data-output-destination-card="paste"
          onClick={() => {
            applySelection(selectedTextSource, {
              copyToClipboard: copyChecked,
              pasteAtCursor: !pasteChecked
            })
          }}
        >
          <div className="flex flex-col text-left">
            <span className="text-xs text-foreground">Paste at cursor</span>
            <span className="text-[10px] text-muted-foreground">
              {isStreamingMode ? 'Forced on for streaming commit order and accessibility checks' : 'Insert output into focused field'}
            </span>
          </div>
          <Switch
            id="settings-output-paste"
            aria-label="Paste at cursor"
            checked={effectivePasteChecked}
            disabled={isStreamingMode}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onCheckedChange={(checked) => {
              applySelection(selectedTextSource, { copyToClipboard: copyChecked, pasteAtCursor: checked })
            }}
          />
        </div>
        {!effectiveCopyChecked && !effectivePasteChecked && (
          <p id="settings-output-destinations-warning" className="mt-2 text-[10px] text-warning">
            Both destinations are disabled. Enable at least one destination to receive output text.
          </p>
        )}
      </fieldset>
    </section>
  )
}
