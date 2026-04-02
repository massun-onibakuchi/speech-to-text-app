/*
Where: src/renderer/settings-llm-provider-form-react.tsx
What: Unified local-LLM settings form for cleanup provider, model, and readiness status.
Why: Keep the Ollama subsection aligned with the STT provider/model selector flow while
     replacing the fake local-auth row with an explicit status surface.
*/

import { useEffect, useState } from 'react'
import type { Settings } from '../shared/domain'
import type { LocalCleanupReadinessSnapshot } from '../shared/ipc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'
import { Switch } from './components/ui/switch'
import { cn } from './lib/utils'

interface SettingsLlmProviderFormReactProps {
  settings: Settings
  onChangeCleanupSettings: (cleanup: Settings['cleanup']) => void
}

const llmProviderOptions: Array<{ value: Settings['cleanup']['runtime']; label: string }> = [
  { value: 'ollama', label: 'Ollama' }
]

export const SettingsLlmProviderFormReact = ({
  settings,
  onChangeCleanupSettings
}: SettingsLlmProviderFormReactProps) => {
  const [cleanupStatus, setCleanupStatus] = useState<LocalCleanupReadinessSnapshot | null>(null)

  const refreshCleanupStatus = async () => {
    setCleanupStatus(await fetchCleanupStatus(settings.cleanup.runtime, settings.cleanup.localModelId))
  }

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
            label: settings.cleanup.localModelId,
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

  return (
    <section className="space-y-3">
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

      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">LLM provider</span>
        <Select
          value={settings.cleanup.runtime}
          onValueChange={(value) => {
            onChangeCleanupSettings({
              ...settings.cleanup,
              runtime: value as Settings['cleanup']['runtime']
            })
          }}
        >
          <SelectTrigger id="settings-cleanup-provider" data-testid="select-cleanup-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {llmProviderOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">LLM model</span>
        <Select
          value={settings.cleanup.localModelId}
          onValueChange={(value) => {
            onChangeCleanupSettings({
              ...settings.cleanup,
              localModelId: value as Settings['cleanup']['localModelId']
            })
          }}
          disabled={cleanupModelOptions.length === 0}
        >
          <SelectTrigger
            id="settings-cleanup-model"
            data-testid="select-cleanup-model"
            className="font-mono"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cleanupModelOptions.map((model) => (
              <SelectItem
                key={`${model.id}-${model.disabled ? 'missing' : 'installed'}`}
                value={model.id}
                disabled={model.disabled}
                className="font-mono"
              >
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="space-y-2 rounded-lg border border-border bg-card px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground">Status</span>
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

        {cleanupStatus?.status.kind === 'ready' && (
          <p id="settings-cleanup-ready" className="text-[10px] text-muted-foreground">
            {cleanupStatus.status.message}
          </p>
        )}

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
      </section>
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
        message:
          error instanceof Error && error.message.trim().length > 0
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

  if (status.status.kind === 'auth_error') {
    return `${status.status.message} Check the local runtime auth or proxy configuration, then refresh.`
  }

  return `${status.status.message} Check the local cleanup runtime, then refresh.`
}
