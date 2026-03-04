/*
Where: src/renderer/settings-api-keys-react.tsx
What: React-rendered Settings API key form for the Google Gemini (LLM) provider.
Why: Issue #197 — STT provider API keys moved to SettingsSttProviderFormReact; this component
     now handles only the Google key so the LLM section has the same cohesive provider-form shape.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Trash2 } from 'lucide-react'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'
import { FIXED_API_KEY_MASK } from './api-key-mask'
import { ConfirmDeleteApiKeyDialogReact } from './confirm-delete-api-key-dialog-react'

interface SettingsApiKeysReactProps {
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onDeleteApiKey: (provider: ApiKeyProvider) => Promise<boolean>
}

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

export const SettingsApiKeysReact = ({
  apiKeyStatus,
  apiKeySaveStatus,
  onSaveApiKey,
  onDeleteApiKey
}: SettingsApiKeysReactProps) => {
  const [value, setValue] = useState('')
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const hasSavedKey = apiKeyStatus.google
  const isSavedRedacted = hasSavedKey && !isEditingDraft && value.length === 0

  useEffect(() => {
    if (apiKeySaveStatus.google.startsWith('Saved')) {
      setValue('')
      setIsEditingDraft(false)
    }
  }, [apiKeySaveStatus.google])

  return (
    <div className="space-y-3">
      <label className="block text-xs">
        <span>
          Google Gemini API key{'  '}
          <em className="text-[10px] text-muted-foreground not-italic">
            {statusText(apiKeyStatus.google)}
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
            className="h-8 w-8 rounded border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
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
