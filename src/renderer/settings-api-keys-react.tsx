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
  onConnectLlmProvider: () => Promise<boolean>
  onDisconnectLlmProvider: () => Promise<boolean>
}

const GOOGLE_PROVIDER_ID: LlmProvider = 'google'
const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex'
const CODEX_LOGIN_COMMAND = 'codex login'

const credentialSummary = (provider: LlmProvider, snapshot: LlmProviderStatusSnapshot[LlmProvider]): string => {
  if (snapshot.credential.kind === 'api_key') {
    return snapshot.credential.configured ? 'Saved' : 'Not set'
  }
  if (snapshot.credential.kind === 'oauth') {
    return snapshot.credential.configured ? 'Connected' : 'Sign-in required'
  }
  if (snapshot.credential.kind === 'cli') {
    return snapshot.credential.installed ? 'Installed' : 'Install required'
  }
  return provider === 'ollama' ? 'Local runtime' : 'Unavailable'
}

const codexGuidance = (snapshot: LlmProviderStatusSnapshot['openai-subscription']) => {
  switch (snapshot.status.kind) {
    case 'cli_not_installed':
      return {
        title: 'Install Codex CLI',
        body: 'Install the official Codex CLI, then click Refresh to recheck readiness.',
        command: CODEX_INSTALL_COMMAND
      }
    case 'cli_login_required':
      return {
        title: 'Sign in with ChatGPT',
        body: 'Run the Codex login command in your terminal, finish sign-in there, then click Refresh.',
        command: CODEX_LOGIN_COMMAND
      }
    case 'cli_probe_failed':
      return {
        title: 'Retry readiness check',
        body: 'Dicta could not verify Codex CLI readiness. Check the diagnostic below, fix the issue, then click Refresh.'
      }
    case 'ready':
      return {
        title: 'Codex CLI ready',
        body: 'Codex CLI sign-in is complete. OpenAI subscription execution will unlock once the runtime adapter lands.'
      }
    default:
      return null
  }
}

export const SettingsApiKeysReact = ({
  llmProviderStatus,
  apiKeySaveStatus,
  onSaveApiKey,
  onDeleteApiKey,
  onConnectLlmProvider,
  onDisconnectLlmProvider
}: SettingsApiKeysReactProps) => {
  const [value, setValue] = useState('')
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const [isSubscriptionPending, setIsSubscriptionPending] = useState(false)
  const googleStatus = llmProviderStatus.google
  const subscriptionStatus = llmProviderStatus['openai-subscription']
  const subscriptionGuidance = codexGuidance(subscriptionStatus)
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
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{credentialSummary(provider, llmProviderStatus[provider])}</span>
                {provider === 'openai-subscription' ? (
                  <button
                    type="button"
                    disabled={isSubscriptionPending}
                    className="h-7 rounded border border-border bg-secondary px-2 text-[10px] text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      setIsSubscriptionPending(true)
                      await onConnectLlmProvider()
                      setIsSubscriptionPending(false)
                    }}
                  >
                    Refresh
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground" id={`llm-provider-status-${provider}`}>
              {llmProviderStatus[provider].status.message}
            </p>
            {provider === 'openai-subscription' && subscriptionGuidance ? (
              <div
                id="llm-provider-guidance-openai-subscription"
                className="rounded-md border border-border/60 bg-background/80 p-2 text-[10px] text-muted-foreground"
              >
                <p className="font-medium text-foreground">{subscriptionGuidance.title}</p>
                <p className="mt-1">{subscriptionGuidance.body}</p>
                {subscriptionGuidance.command ? (
                  <code className="mt-2 block rounded bg-secondary px-2 py-1 font-mono text-foreground">
                    {subscriptionGuidance.command}
                  </code>
                ) : null}
              </div>
            ) : null}
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
