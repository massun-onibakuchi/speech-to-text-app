/*
Where: src/renderer/settings-stt-provider-form-react.tsx
What: Unified STT provider form — provider, model, API key, and base URL in one section.
Why: Issue #197 — replace separate per-provider API key sections with one cohesive provider form
     so that model options, API key, and base URL all follow the selected provider.
     Issue #299: migrated provider/model selects from native <select> to Radix Select primitive
     for cross-platform popup/item theming via app design tokens.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Trash2 } from 'lucide-react'
import {
  STT_MODEL_ALLOWLIST,
  type Settings
} from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'
import { FIXED_API_KEY_MASK } from './api-key-mask'
import { ConfirmDeleteApiKeyDialogReact } from './confirm-delete-api-key-dialog-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'

interface SettingsSttProviderFormReactProps {
  settings: Settings
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onDeleteApiKey: (provider: ApiKeyProvider) => Promise<boolean>
}

const sttProviderOptions: Array<{ value: Settings['transcription']['provider']; label: string }> = [
  { value: 'groq', label: 'Groq' },
  { value: 'elevenlabs', label: 'ElevenLabs' }
]

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

export const SettingsSttProviderFormReact = ({
  settings,
  apiKeyStatus,
  apiKeySaveStatus,
  onSelectTranscriptionProvider,
  onSelectTranscriptionModel,
  onSaveApiKey,
  onDeleteApiKey
}: SettingsSttProviderFormReactProps) => {
  const [selectedProvider, setSelectedProvider] = useState(settings.transcription.provider)
  const [selectedModel, setSelectedModel] = useState(settings.transcription.model)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const [deleteTargetProvider, setDeleteTargetProvider] = useState<ApiKeyProvider>(settings.transcription.provider as ApiKeyProvider)
  const [deleteTargetLabel, setDeleteTargetLabel] = useState('Groq')

  // Sync display state when external settings change (e.g. restore defaults).
  useEffect(() => {
    setSelectedProvider(settings.transcription.provider)
    setSelectedModel(settings.transcription.model)
    setApiKeyValue('')
    setIsEditingDraft(false)
  }, [settings.transcription.provider, settings.transcription.model])

  const selectedProviderSaveStatus = apiKeySaveStatus[selectedProvider]

  useEffect(() => {
    if (selectedProviderSaveStatus.startsWith('Saved')) {
      setApiKeyValue('')
      setIsEditingDraft(false)
    }
  }, [selectedProviderSaveStatus])

  const availableModels = STT_MODEL_ALLOWLIST[selectedProvider]
  const providerLabel = sttProviderOptions.find((o) => o.value === selectedProvider)?.label ?? selectedProvider
  const hasSavedKey = apiKeyStatus[selectedProvider]
  const isSavedRedacted = hasSavedKey && !isEditingDraft && apiKeyValue.length === 0

  return (
    <div className="space-y-3">
      {/* Provider selector */}
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">STT provider</span>
        <Select
          value={selectedProvider}
          onValueChange={(val) => {
            const provider = val as Settings['transcription']['provider']
            const nextModel = STT_MODEL_ALLOWLIST[provider][0]
            setSelectedProvider(provider)
            setSelectedModel(nextModel)
            // Clear API key draft when provider changes to avoid stale key leakage.
            setApiKeyValue('')
            setIsEditingDraft(false)
            onSelectTranscriptionProvider(provider)
          }}
        >
          <SelectTrigger
            id="settings-transcription-provider"
            data-testid="select-transcription-provider"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sttProviderOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model selector — filtered to selected provider's allowlist */}
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">STT model</span>
        <Select
          value={selectedModel}
          onValueChange={(val) => {
            const model = val as Settings['transcription']['model']
            setSelectedModel(model)
            onSelectTranscriptionModel(model)
          }}
        >
          <SelectTrigger
            id="settings-transcription-model"
            data-testid="select-transcription-model"
            className="font-mono"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model} value={model} className="font-mono">{model}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* API key for the currently selected provider */}
      <label className="block text-xs">
        <span>
          {providerLabel} API key{'  '}
          <em className="text-[10px] text-muted-foreground not-italic">
            {statusText(apiKeyStatus[selectedProvider])}
          </em>
        </span>
        <div className="mt-2 flex items-center gap-2">
          <input
            id={`settings-api-key-${selectedProvider}`}
            type="password"
            autoComplete="off"
            placeholder={isSavedRedacted ? 'Saved key hidden. Type to replace.' : `Enter ${providerLabel} API key`}
            value={isSavedRedacted ? FIXED_API_KEY_MASK : apiKeyValue}
            className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs font-mono text-foreground"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (!isEditingDraft) {
                setIsEditingDraft(true)
              }
              setApiKeyValue(event.target.value)
            }}
            onFocus={() => {
              if (isSavedRedacted) {
                setIsEditingDraft(true)
                setApiKeyValue('')
              }
            }}
            onBlur={() => {
              const trimmed = apiKeyValue.trim()
              if (trimmed.length === 0) {
                setIsEditingDraft(false)
                return
              }
              if (isEditingDraft) {
                void onSaveApiKey(selectedProvider, trimmed)
              }
            }}
          />
          <button
            type="button"
            aria-label={`Delete ${providerLabel} API key`}
            disabled={!hasSavedKey || isDeletePending}
            className="h-8 w-8 rounded border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              setDeleteTargetProvider(selectedProvider as ApiKeyProvider)
              setDeleteTargetLabel(providerLabel)
              setIsDeleteDialogOpen(true)
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </label>
      <p
        className="text-[10px] text-muted-foreground"
        id={`api-key-save-status-${selectedProvider}`}
        aria-live="polite"
      >
        {selectedProviderSaveStatus}
      </p>
      <ConfirmDeleteApiKeyDialogReact
        open={isDeleteDialogOpen}
        providerLabel={deleteTargetLabel}
        pending={isDeletePending}
        onOpenChange={(open) => {
          if (isDeletePending) {
            return
          }
          setIsDeleteDialogOpen(open)
        }}
        onConfirm={async () => {
          setIsDeletePending(true)
          const didDelete = await onDeleteApiKey(deleteTargetProvider)
          setIsDeletePending(false)
          if (didDelete) {
            setIsDeleteDialogOpen(false)
            setIsEditingDraft(false)
            setApiKeyValue('')
          }
          return didDelete
        }}
      />
    </div>
  )
}
