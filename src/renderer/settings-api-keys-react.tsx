/*
Where: src/renderer/settings-api-keys-react.tsx
What: React-rendered Settings API keys form and provider connection controls.
Why: Continue Settings migration to React while keeping API key behavior and selectors consistent.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

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
        <p className="muted">
          Save each provider key independently. Unsaved edits in other fields stay local until you save them.
        </p>
        {providers.map((provider) => {
          const inputId = `settings-api-key-${provider}`
          const visible = visibility[provider]
          return (
            <div key={provider} className="settings-key-row">
              <label className="text-row">
                <span>
                  {labelByProvider[provider]}
                  {' '}
                  <em className="field-hint">{statusText(apiKeyStatus[provider])}</em>
                </span>
                <input
                  id={inputId}
                  type={visible ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder={`Enter ${labelByProvider[provider]}`}
                  value={values[provider]}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setValues((current) => ({
                      ...current,
                      [provider]: event.target.value
                    }))
                  }}
                />
              </label>
              <div className="settings-actions settings-actions-inline">
                <button
                  type="button"
                  data-api-key-visibility-toggle={provider}
                  onClick={() => {
                    setVisibility((current) => ({
                      ...current,
                      [provider]: !current[provider]
                    }))
                  }}
                >
                  {visible ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  data-api-key-test={provider}
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
              <p className="muted provider-status" id={`api-key-save-status-${provider}`} aria-live="polite">
                {apiKeySaveStatus[provider]}
              </p>
              <p className="muted provider-status" id={`api-key-test-status-${provider}`} aria-live="polite">
                {apiKeyTestStatus[provider]}
              </p>
            </div>
          )
        })}
      </section>
      <div className="settings-actions">
        <button type="submit" disabled={savePending || anyProviderSavePending}>Save API Keys</button>
      </div>
      <p id="api-keys-save-message" className="muted" aria-live="polite">{saveMessage}</p>
    </form>
  )
}
