/*
Where: src/renderer/settings-stt-provider-form-react.tsx
What: Unified STT provider form — provider, model, API key, and base URL in one section.
Why: Issue #197 — replace separate per-provider API key sections with one cohesive provider form
     so that model options, API key, and base URL all follow the selected provider.
     Issue #255: standardized select-like controls to app design-token pattern.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  STT_MODEL_ALLOWLIST,
  type Settings
} from '../shared/domain'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'

interface SettingsSttProviderFormReactProps {
  settings: Settings
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSelectTranscriptionProvider: (provider: Settings['transcription']['provider']) => void
  onSelectTranscriptionModel: (model: Settings['transcription']['model']) => void
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
}

const sttProviderOptions: Array<{ value: Settings['transcription']['provider']; label: string }> = [
  { value: 'groq', label: 'Groq' },
  { value: 'elevenlabs', label: 'ElevenLabs' }
]

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

// Shared select class set per issue #255 / style-update.md §4.
const SELECT_CLS = 'w-full h-8 rounded-md border border-input bg-input/30 hover:bg-input/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors'
const SELECT_MONO_CLS = `${SELECT_CLS} font-mono`

export const SettingsSttProviderFormReact = ({
  settings,
  apiKeyStatus,
  apiKeySaveStatus,
  onSelectTranscriptionProvider,
  onSelectTranscriptionModel,
  onSaveApiKey
}: SettingsSttProviderFormReactProps) => {
  const [selectedProvider, setSelectedProvider] = useState(settings.transcription.provider)
  const [selectedModel, setSelectedModel] = useState(settings.transcription.model)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [isEditingDraft, setIsEditingDraft] = useState(false)

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
      <label className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">STT provider</span>
        <select
          id="settings-transcription-provider"
          className={SELECT_CLS}
          value={selectedProvider}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const provider = event.target.value as Settings['transcription']['provider']
            const nextModel = STT_MODEL_ALLOWLIST[provider][0]
            setSelectedProvider(provider)
            setSelectedModel(nextModel)
            // Clear API key draft when provider changes
            // to avoid showing a stale key for the previous provider.
            setApiKeyValue('')
            setIsEditingDraft(false)
            onSelectTranscriptionProvider(provider)
          }}
        >
          {sttProviderOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* Model selector — filtered to selected provider's allowlist */}
      <label className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">STT model</span>
        <select
          id="settings-transcription-model"
          className={SELECT_MONO_CLS}
          value={selectedModel}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const model = event.target.value as Settings['transcription']['model']
            setSelectedModel(model)
            onSelectTranscriptionModel(model)
          }}
        >
          {availableModels.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </label>

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
            value={isSavedRedacted ? '••••••••' : apiKeyValue}
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
        </div>
      </label>
      <p
        className="text-[10px] text-muted-foreground"
        id={`api-key-save-status-${selectedProvider}`}
        aria-live="polite"
      >
        {selectedProviderSaveStatus}
      </p>
    </div>
  )
}
