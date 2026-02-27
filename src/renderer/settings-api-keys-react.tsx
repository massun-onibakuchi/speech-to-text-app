/*
Where: src/renderer/settings-api-keys-react.tsx
What: React-rendered Settings API keys form and provider connection controls.
Why: Continue Settings migration to React while keeping API key behavior and selectors consistent.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'

interface SettingsApiKeysReactProps {
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  apiKeyTestStatus: Record<ApiKeyProvider, string>
  saveMessage: string
  onTestApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onSaveApiKeys: (values: Record<ApiKeyProvider, string>) => Promise<void>
}

const providers: ApiKeyProvider[] = ['groq', 'elevenlabs', 'google']

const labelByProvider: Record<ApiKeyProvider, string> = {
  groq: 'Groq API key',
  elevenlabs: 'ElevenLabs API key',
  google: 'Google Gemini API key'
}

const statusText = (saved: boolean): string => (saved ? 'Saved' : 'Not set')

export const SettingsApiKeysReact = ({
  apiKeyStatus,
  apiKeySaveStatus,
  apiKeyTestStatus,
  saveMessage,
  onTestApiKey,
  onSaveApiKey,
  onSaveApiKeys
}: SettingsApiKeysReactProps) => {
  const [values, setValues] = useState<Record<ApiKeyProvider, string>>({
    groq: '',
    elevenlabs: '',
    google: ''
  })
  const [visibility, setVisibility] = useState<Record<ApiKeyProvider, boolean>>({
    groq: false,
    elevenlabs: false,
    google: false
  })
  const [pendingTestByProvider, setPendingTestByProvider] = useState<Record<ApiKeyProvider, boolean>>({
    groq: false,
    elevenlabs: false,
    google: false
  })
  const [pendingSaveByProvider, setPendingSaveByProvider] = useState<Record<ApiKeyProvider, boolean>>({
    groq: false,
    elevenlabs: false,
    google: false
  })
  const [savePending, setSavePending] = useState(false)
  const anyProviderSavePending = providers.some((provider) => pendingSaveByProvider[provider])

  return (
    <form
      id="api-keys-form"
      className="settings-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setSavePending(true)
        void onSaveApiKeys({
          groq: values.groq.trim(),
          elevenlabs: values.elevenlabs.trim(),
          google: values.google.trim()
        }).finally(() => {
          setSavePending(false)
        })
      }}
    >
      <section className="settings-group">
        <h3>Provider API Keys</h3>
        <p className="text-xs text-muted-foreground">
          Save each provider key independently. Unsaved edits in other fields stay local until you save them.
        </p>
        {providers.map((provider) => {
          const inputId = `settings-api-key-${provider}`
          const visible = visibility[provider]
          return (
            <div key={provider} className="settings-key-row mt-3 rounded-lg border border-border bg-card p-3">
              <label className="block">
                <span className="text-xs text-foreground">
                  {labelByProvider[provider]}
                  {'  '}
                  <em className="text-[10px] text-muted-foreground not-italic">{statusText(apiKeyStatus[provider])}</em>
                </span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={inputId}
                    type={visible ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder={`Enter ${labelByProvider[provider]}`}
                    value={values[provider]}
                    className="h-8 flex-1 rounded border border-input bg-input px-2 text-xs font-mono text-foreground"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setValues((current) => ({
                        ...current,
                        [provider]: event.target.value
                      }))
                    }}
                  />
                  <button
                    type="button"
                    data-api-key-visibility-toggle={provider}
                    className="rounded bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={visible ? `Hide ${labelByProvider[provider]}` : `Show ${labelByProvider[provider]}`}
                    onClick={() => {
                      setVisibility((current) => ({
                        ...current,
                        [provider]: !current[provider]
                      }))
                    }}
                  >
                    {visible ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                  </button>
                </div>
              </label>
              <div className="settings-actions settings-actions-inline mt-2">
                <button
                  type="button"
                  data-api-key-test={provider}
                  className="h-7 rounded bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent"
                  disabled={pendingTestByProvider[provider] || pendingSaveByProvider[provider] || savePending}
                  onClick={() => {
                    setPendingTestByProvider((current) => ({
                      ...current,
                      [provider]: true
                    }))
                    void onTestApiKey(provider, values[provider].trim()).finally(() => {
                      setPendingTestByProvider((current) => ({
                        ...current,
                        [provider]: false
                      }))
                    })
                  }}
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  data-api-key-save={provider}
                  className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
                  disabled={pendingSaveByProvider[provider] || savePending}
                  onClick={() => {
                    setPendingSaveByProvider((current) => ({
                      ...current,
                      [provider]: true
                    }))
                    void onSaveApiKey(provider, values[provider].trim()).finally(() => {
                      setPendingSaveByProvider((current) => ({
                        ...current,
                        [provider]: false
                      }))
                    })
                  }}
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground" id={`api-key-save-status-${provider}`} aria-live="polite">
                {apiKeySaveStatus[provider]}
              </p>
              <p className="text-[10px] text-muted-foreground" id={`api-key-test-status-${provider}`} aria-live="polite">
                {apiKeyTestStatus[provider]}
              </p>
            </div>
          )
        })}
      </section>
      <div className="settings-actions">
        <button
          type="submit"
          className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          disabled={savePending || anyProviderSavePending}
        >
          Save API Keys
        </button>
      </div>
      <p id="api-keys-save-message" className="text-xs text-muted-foreground" aria-live="polite">{saveMessage}</p>
    </form>
  )
}
