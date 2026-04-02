/*
Where: src/renderer/settings-output-react.tsx
What: React-rendered Settings output matrix controls.
Why: Continue Settings migration by moving output controls to React event ownership.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { useEffect, useState } from 'react'
import type { OutputTextSource, Settings } from '../shared/domain'
import type { LocalCleanupReadinessSnapshot } from '../shared/ipc'
import { getSelectedOutputDestinations } from '../shared/output-selection'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { Switch } from './components/ui/switch'
import { cn } from './lib/utils'

interface SettingsOutputReactProps {
  settings: Settings
  onChangeOutputSelection: (selection: OutputTextSource, destinations: { copyToClipboard: boolean; pasteAtCursor: boolean }) => void
  onChangeCleanupSettings: (cleanup: Settings['cleanup']) => void
}

export const SettingsOutputReact = ({
  settings,
  onChangeOutputSelection,
  onChangeCleanupSettings
}: SettingsOutputReactProps) => {
  const sectionLegendClassName = 'text-xs font-medium text-foreground mb-2'
  const selectedDestinations = getSelectedOutputDestinations(settings.output)
  const [selectedTextSource, setSelectedTextSource] = useState<OutputTextSource>(settings.output.selectedTextSource)
  const [copyChecked, setCopyChecked] = useState(selectedDestinations.copyToClipboard)
  const [pasteChecked, setPasteChecked] = useState(selectedDestinations.pasteAtCursor)
  const [cleanupStatus, setCleanupStatus] = useState<LocalCleanupReadinessSnapshot | null>(null)

  const refreshCleanupStatus = async () => {
    setCleanupStatus(await fetchCleanupStatus(settings.cleanup.runtime, settings.cleanup.localModelId))
  }

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

  useEffect(() => {
    let cancelled = false

    const loadCleanupStatus = async () => {
      const status = await fetchCleanupStatus(settings.cleanup.runtime, settings.cleanup.localModelId)
      if (!cancelled) {
        setCleanupStatus(status)
      }
    }

    void loadCleanupStatus()

    return () => {
      cancelled = true
    }
  }, [settings.cleanup.runtime, settings.cleanup.localModelId])

  const availableCleanupModels = cleanupStatus?.availableModels ?? []
  const selectedCleanupModelInstalled = cleanupStatus?.selectedModelInstalled ?? false
  const cleanupModelOptions =
    availableCleanupModels.length > 0 && !selectedCleanupModelInstalled
      ? [
          {
            id: settings.cleanup.localModelId,
            label: `${settings.cleanup.localModelId} (not installed)`,
            disabled: true
          },
          ...availableCleanupModels.map((model) => ({
            ...model,
            disabled: false
          }))
        ]
      : availableCleanupModels.map((model) => ({
          ...model,
          disabled: false
        }))

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
        <legend className={sectionLegendClassName}>Output Mode</legend>
        <RadioGroup
          value={selectedTextSource}
          onValueChange={(value) => {
            const source = value as OutputTextSource
            applySelection(source, { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
          }}
          className="space-y-2"
        >
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
              selectedTextSource === 'transcript'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card hover:bg-accent'
            )}
            data-output-source-card="transcript"
            onClick={() => {
              if (selectedTextSource !== 'transcript') {
                applySelection('transcript', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
              }
            }}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="transcript"
                id="settings-output-text-transcript"
                aria-label="Raw dictation"
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
              selectedTextSource === 'transformed'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card hover:bg-accent'
            )}
            data-output-source-card="transformed"
            onClick={() => {
              if (selectedTextSource !== 'transformed') {
                applySelection('transformed', { copyToClipboard: copyChecked, pasteAtCursor: pasteChecked })
              }
            }}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="transformed"
                id="settings-output-text-transformed"
                aria-label="Transformed text"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              />
              <span className="text-xs text-foreground">Transformed text</span>
            </div>
          </div>
        </RadioGroup>
      </fieldset>
      <fieldset className="space-y-2 mt-3">
        <legend className={sectionLegendClassName}>Output Destinations</legend>
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            copyChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
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
            <span className="text-[10px] text-muted-foreground">Keep output ready for paste</span>
          </div>
          <Switch
            id="settings-output-copy"
            aria-label="Copy to clipboard"
            checked={copyChecked}
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
            pasteChecked ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
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
            <span className="text-[10px] text-muted-foreground">Insert output into focused field</span>
          </div>
          <Switch
            id="settings-output-paste"
            aria-label="Paste at cursor"
            checked={pasteChecked}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onCheckedChange={(checked) => {
              applySelection(selectedTextSource, { copyToClipboard: copyChecked, pasteAtCursor: checked })
            }}
          />
        </div>
        {!copyChecked && !pasteChecked && (
          <p id="settings-output-destinations-warning" className="mt-2 text-[10px] text-warning">
            Both destinations are disabled. Enable at least one destination to receive output text.
          </p>
        )}
      </fieldset>
      <fieldset className="space-y-2 mt-3">
        <legend className={sectionLegendClassName}>Local Cleanup</legend>
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
            settings.cleanup.enabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-accent'
          )}
          data-cleanup-toggle-card="enabled"
          onClick={() => {
            onChangeCleanupSettings({
              ...settings.cleanup,
              enabled: !settings.cleanup.enabled
            })
          }}
        >
          <div className="flex flex-col text-left">
            <span className="text-xs text-foreground">Enable local transcript cleanup</span>
            <span className="text-[10px] text-muted-foreground">Runs after dictionary replacement and falls back on failure</span>
          </div>
          <Switch
            id="settings-cleanup-enabled"
            aria-label="Enable local transcript cleanup"
            checked={settings.cleanup.enabled}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onCheckedChange={(checked) => {
              onChangeCleanupSettings({
                ...settings.cleanup,
                enabled: checked
              })
            }}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col text-left">
              <span className="text-xs text-foreground">Runtime</span>
              <span className="text-[10px] text-muted-foreground">Phase 1 uses Ollama only</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ollama</span>
              <button
                id="settings-cleanup-refresh"
                type="button"
                className="rounded border border-input px-2 py-1 text-[10px] text-foreground"
                onClick={() => {
                  void refreshCleanupStatus()
                }}
              >
                Refresh
              </button>
            </div>
          </div>
          {cleanupStatus &&
            cleanupStatus.status.kind !== 'ready' &&
            cleanupStatus.status.kind !== 'no_supported_models' &&
            cleanupStatus.status.kind !== 'selected_model_missing' && (
            <p id="settings-cleanup-runtime-warning" className="text-[10px] text-warning">
              {getCleanupRuntimeGuidance(cleanupStatus)}{' '}
              <a
                href="https://ollama.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Ollama landing page
              </a>
            </p>
          )}
          {cleanupStatus?.status.kind === 'no_supported_models' && (
            <p id="settings-cleanup-model-warning" className="text-[10px] text-warning">
              No supported local cleanup model is installed in Ollama.{' '}
              <a
                href="https://ollama.com/library/qwen3.5"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                View supported Qwen models
              </a>
            </p>
          )}
          {cleanupStatus?.status.kind === 'selected_model_missing' && (
              <p id="settings-cleanup-selected-model-warning" className="text-[10px] text-warning">
                The selected cleanup model is not currently installed in Ollama. Refresh status or choose an installed model.
              </p>
            )}
          <label className="flex flex-col gap-2 text-left" htmlFor="settings-cleanup-model">
            <span className="text-xs text-foreground">Model</span>
            <select
              id="settings-cleanup-model"
              className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
              value={settings.cleanup.localModelId}
              disabled={availableCleanupModels.length === 0}
              onChange={(event) => {
                onChangeCleanupSettings({
                  ...settings.cleanup,
                  localModelId: event.currentTarget.value as Settings['cleanup']['localModelId']
                })
              }}
            >
              {cleanupModelOptions.map((model) => (
                <option key={`${model.id}-${model.disabled ? 'missing' : 'installed'}`} value={model.id} disabled={model.disabled}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
    </section>
  )
}

const fetchCleanupStatus = async (
  runtime: Settings['cleanup']['runtime'],
  selectedModelId: Settings['cleanup']['localModelId']
): Promise<LocalCleanupReadinessSnapshot> => {
  try {
    return await window.speechToTextApi.getLocalCleanupStatus()
  } catch (error) {
    return {
      runtime,
      status: {
        kind: 'unknown',
        message: error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to load local cleanup diagnostics.'
      },
      availableModels: [],
      selectedModelId,
      selectedModelInstalled: false
    }
  }
}

const getCleanupRuntimeGuidance = (status: LocalCleanupReadinessSnapshot): string => {
  if (status.status.kind === 'ready') {
    return status.status.message
  }

  if (status.status.kind === 'server_unreachable') {
    return `${status.status.message} Start Ollama, then refresh.`
  }

  if (status.status.kind === 'runtime_unavailable') {
    return `${status.status.message} Install Ollama, then refresh.`
  }

  return `${status.status.message} Check the local cleanup runtime, then refresh.`
}
