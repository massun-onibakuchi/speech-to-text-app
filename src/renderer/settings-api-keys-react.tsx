/*
Where: src/renderer/settings-api-keys-react.tsx
What: React-rendered Settings API key form for the Google Gemini (LLM) provider.
Why: Issue #197 — STT provider API keys moved to SettingsSttProviderFormReact; this component
     now handles only the Google key so the LLM section has the same cohesive provider-form shape.
*/

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'

interface SettingsApiKeysReactProps {
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  apiKeyTestStatus: Record<ApiKeyProvider, string>
  onTestApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
}

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

export const SettingsApiKeysReact = ({
  apiKeyStatus,
  apiKeySaveStatus,
  apiKeyTestStatus,
  onTestApiKey,
  onSaveApiKey
}: SettingsApiKeysReactProps) => {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [testPending, setTestPending] = useState(false)
  const [savePending, setSavePending] = useState(false)

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
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            placeholder="Enter Google Gemini API key"
            value={value}
            className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs font-mono text-foreground"
            onChange={(event: ChangeEvent<HTMLInputElement>) => { setValue(event.target.value) }}
          />
          <button
            type="button"
            data-api-key-visibility-toggle="google"
            className="rounded bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={visible ? 'Hide Google Gemini API key' : 'Show Google Gemini API key'}
            onClick={() => { setVisible((v) => !v) }}
          >
            {visible
              ? <EyeOff className="size-3.5" aria-hidden="true" />
              : <Eye className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-api-key-test="google"
          className="h-7 rounded bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          disabled={testPending || savePending}
          onClick={() => {
            setTestPending(true)
            void onTestApiKey('google', value.trim()).finally(() => { setTestPending(false) })
          }}
        >
          Test Connection
        </button>
        <button
          type="button"
          data-api-key-save="google"
          className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          disabled={savePending}
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
      <p className="text-[10px] text-muted-foreground" id="api-key-test-status-google" aria-live="polite">
        {apiKeyTestStatus.google}
      </p>
    </div>
  )
}
