/*
Where: src/renderer/settings-api-keys-react.tsx
What: React-rendered Settings API key form for the Google Gemini (LLM) provider.
Why: Issue #197 — STT provider API keys moved to SettingsSttProviderFormReact; this component
     now handles only the Google key so the LLM section has the same cohesive provider-form shape.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'

interface SettingsApiKeysReactProps {
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
}

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

export const SettingsApiKeysReact = ({
  apiKeyStatus,
  apiKeySaveStatus,
  onSaveApiKey
}: SettingsApiKeysReactProps) => {
  const [value, setValue] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
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
            value={isSavedRedacted ? '••••••••' : value}
            className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs font-mono text-foreground"
            onFocus={() => {
              if (isSavedRedacted) {
                setIsEditingDraft(true)
                setValue('')
              }
            }}
            onBlur={() => {
              if (value.trim().length === 0) {
                setIsEditingDraft(false)
              }
            }}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (!isEditingDraft) {
                setIsEditingDraft(true)
              }
              setValue(event.target.value)
            }}
          />
        </div>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-api-key-save="google"
          className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          disabled={savePending || isSavedRedacted || value.trim().length === 0}
          onClick={() => {
            setSavePending(true)
            void onSaveApiKey('google', value.trim()).finally(() => { setSavePending(false) })
          }}
        >
          Save
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground" id="api-key-save-status-google" aria-live="polite">
        {apiKeySaveStatus.google}
      </p>
    </div>
  )
}
