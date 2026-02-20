/*
Where: src/renderer/settings-api-keys-react.ts
What: React-rendered Settings API keys form and provider connection controls.
Why: Continue Settings migration to React while keeping API key behavior and selectors consistent.
*/

import { createElement } from 'react'
import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ApiKeyProvider, ApiKeyStatusSnapshot } from '../shared/ipc'

interface SettingsApiKeysReactProps {
  apiKeyStatus: ApiKeyStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  apiKeyTestStatus: Record<ApiKeyProvider, string>
  saveMessage: string
  onTestApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
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
  const [savePending, setSavePending] = useState(false)

  return createElement(
    'form',
    {
      id: 'api-keys-form',
      className: 'settings-form',
      onSubmit: (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setSavePending(true)
        void onSaveApiKeys({
          groq: values.groq.trim(),
          elevenlabs: values.elevenlabs.trim(),
          google: values.google.trim()
        }).finally(() => {
          setSavePending(false)
        })
      }
    },
    createElement(
      'section',
      { className: 'settings-group' },
      createElement('h3', null, 'Provider API Keys'),
      ...providers.map((provider) => {
        const inputId = `settings-api-key-${provider}`
        const visible = visibility[provider]
        return createElement(
          'div',
          { key: provider, className: 'settings-key-row' },
          createElement(
            'label',
            { className: 'text-row' },
            createElement(
              'span',
              null,
              labelByProvider[provider],
              ' ',
              createElement('em', { className: 'field-hint' }, statusText(apiKeyStatus[provider]))
            ),
            createElement('input', {
              id: inputId,
              type: visible ? 'text' : 'password',
              autoComplete: 'off',
              placeholder: `Enter ${labelByProvider[provider]}`,
              value: values[provider],
              onChange: (event: ChangeEvent<HTMLInputElement>) => {
                setValues((current) => ({
                  ...current,
                  [provider]: event.target.value
                }))
              }
            })
          ),
          createElement(
            'div',
            { className: 'settings-actions settings-actions-inline' },
            createElement(
              'button',
              {
                type: 'button',
                'data-api-key-visibility-toggle': provider,
                onClick: () => {
                  setVisibility((current) => ({
                    ...current,
                    [provider]: !current[provider]
                  }))
                }
              },
              visible ? 'Hide' : 'Show'
            ),
            createElement(
              'button',
              {
                type: 'button',
                'data-api-key-test': provider,
                disabled: pendingTestByProvider[provider],
                onClick: () => {
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
                }
              },
              'Test Connection'
            )
          ),
          createElement('p', { className: 'muted provider-status', id: `api-key-save-status-${provider}`, 'aria-live': 'polite' }, apiKeySaveStatus[provider]),
          createElement('p', { className: 'muted provider-status', id: `api-key-test-status-${provider}`, 'aria-live': 'polite' }, apiKeyTestStatus[provider])
        )
      })
    ),
    createElement(
      'div',
      { className: 'settings-actions' },
      createElement('button', { type: 'submit', disabled: savePending }, 'Save API Keys')
    ),
    createElement('p', { id: 'api-keys-save-message', className: 'muted', 'aria-live': 'polite' }, saveMessage)
  )
}
