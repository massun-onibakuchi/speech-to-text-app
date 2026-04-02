/*
Where: src/renderer/settings-api-keys-react.tsx
What: Renderer LLM provider credentials and readiness surface for the Settings tab.
Why: LLM providers no longer share one API-key-only readiness model, so the UI needs
     to show provider-scoped readiness while keeping Google key editing intact.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { LLM_PROVIDER_LABELS, type LlmProvider } from '../shared/llm'
import type { ApiKeyProvider, LlmProviderStatusSnapshot } from '../shared/ipc'
import { FIXED_API_KEY_MASK } from './api-key-mask'
import { ConfirmDeleteApiKeyDialogReact } from './confirm-delete-api-key-dialog-react'

interface SettingsApiKeysReactProps {
  llmProviderStatus: LlmProviderStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onDeleteApiKey: (provider: ApiKeyProvider) => Promise<boolean>
}

const GOOGLE_PROVIDER_ID: LlmProvider = 'google'

const credentialSummary = (provider: LlmProvider, snapshot: LlmProviderStatusSnapshot[LlmProvider]): string => {
  if (snapshot.credential.kind === 'api_key') {
    return snapshot.credential.configured ? 'Saved' : 'Not set'
  }
  if (snapshot.credential.kind === 'oauth') {
    return snapshot.credential.configured ? 'Connected' : 'Sign-in required'
  }
  return provider === 'ollama' ? 'Local runtime' : 'Unavailable'
}

export const SettingsApiKeysReact = ({
  llmProviderStatus,
  apiKeySaveStatus,
  onSaveApiKey,
  onDeleteApiKey
}: SettingsApiKeysReactProps) => {
  const [value, setValue] = useState('')
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const googleStatus = llmProviderStatus.google
  const hasSavedKey = googleStatus.credential.kind === 'api_key' && googleStatus.credential.configured
  const isSavedRedacted = hasSavedKey && !isEditingDraft && value.length === 0

  useEffect(() => {
    if (apiKeySaveStatus.google.startsWith('Saved')) {
      setValue('')
      setIsEditingDraft(false)
    }
  }, [apiKeySaveStatus.google])

  return (
    <div className="space-y-4">
      <label className="block text-xs">
        <span>
          Google Gemini API key{'  '}
          <em className="text-[10px] text-muted-foreground not-italic">
            {credentialSummary(GOOGLE_PROVIDER_ID, googleStatus)}
          </em>
        </span>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="settings-api-key-google"
            type="password"
            autoComplete="off"
            placeholder={isSavedRedacted ? 'Saved key hidden. Type to replace.' : 'Enter Google Gemini API key'}
            value={isSavedRedacted ? FIXED_API_KEY_MASK : value}
            className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs font-mono text-foreground"
            onFocus={() => {
              if (isSavedRedacted) {
                setIsEditingDraft(true)
                setValue('')
              }
            }}
            onBlur={() => {
              const trimmed = value.trim()
              if (trimmed.length === 0) {
                setIsEditingDraft(false)
                return
              }
              if (isEditingDraft) {
                void onSaveApiKey('google', trimmed)
              }
            }}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (!isEditingDraft) {
                setIsEditingDraft(true)
              }
              setValue(event.target.value)
            }}
          />
          <button
            type="button"
            aria-label="Delete Google API key"
            disabled={!hasSavedKey || isDeletePending}
            className="h-8 w-8 rounded border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            onClick={() => {
              setIsDeleteDialogOpen(true)
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </label>
      <p className="text-[10px] text-muted-foreground" id="api-key-save-status-google" aria-live="polite">
        {apiKeySaveStatus.google}
      </p>
      <p className="text-[10px] text-muted-foreground" id="llm-provider-status-google" aria-live="polite">
        {googleStatus.status.message}
      </p>

      <div className="space-y-2 rounded-md border border-border/60 bg-card/60 p-3">
        {(['ollama', 'openai-subscription'] as const).map((provider) => (
          <div key={provider} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{LLM_PROVIDER_LABELS[provider]}</span>
              <span className="text-muted-foreground">{credentialSummary(provider, llmProviderStatus[provider])}</span>
            </div>
            <p className="text-[10px] text-muted-foreground" id={`llm-provider-status-${provider}`}>
              {llmProviderStatus[provider].status.message}
            </p>
          </div>
        ))}
      </div>

      <ConfirmDeleteApiKeyDialogReact
        open={isDeleteDialogOpen}
        providerLabel="Google"
        pending={isDeletePending}
        onOpenChange={(open) => {
          if (isDeletePending) {
            return
          }
          setIsDeleteDialogOpen(open)
        }}
        onConfirm={async () => {
          setIsDeletePending(true)
          const didDelete = await onDeleteApiKey('google')
          setIsDeletePending(false)
          if (didDelete) {
            setIsDeleteDialogOpen(false)
            setIsEditingDraft(false)
            setValue('')
          }
          return didDelete
        }}
      />
    </div>
  )
}
