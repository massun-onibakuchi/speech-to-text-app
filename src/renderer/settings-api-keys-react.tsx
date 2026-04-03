/*
Where: src/renderer/settings-api-keys-react.tsx
What: Renderer LLM credential and readiness surface for the Settings tab.
Why: Present Gemini, OpenAI subscription, and Ollama as separate setup sections
     while keeping provider readiness and credential actions in one renderer surface.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { LLM_PROVIDER_LABELS, type LlmProvider } from '../shared/llm'
import type { ApiKeyProvider, LlmProviderStatusSnapshot } from '../shared/ipc'
import { FIXED_API_KEY_MASK } from './api-key-mask'
import { ConfirmDeleteApiKeyDialogReact } from './confirm-delete-api-key-dialog-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'

interface SettingsApiKeysReactProps {
  llmProviderStatus: LlmProviderStatusSnapshot
  apiKeySaveStatus: Record<ApiKeyProvider, string>
  onSaveApiKey: (provider: ApiKeyProvider, candidateValue: string) => Promise<void>
  onDeleteApiKey: (provider: ApiKeyProvider) => Promise<boolean>
  onConnectLlmProvider: () => Promise<boolean>
  onDisconnectLlmProvider: () => Promise<boolean>
}

const GOOGLE_PROVIDER_ID: LlmProvider = 'google'
const OPENAI_SUBSCRIPTION_PROVIDER_ID: LlmProvider = 'openai-subscription'
const OLLAMA_PROVIDER_ID: LlmProvider = 'ollama'
const GOOGLE_MODEL_ID = 'gemini-2.5-flash'
const OPENAI_SUBSCRIPTION_MODEL_ID = 'gpt-5.4-mini'
const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex'
const CODEX_LOGIN_COMMAND = 'codex login'
const SETTINGS_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: LLM_PROVIDER_LABELS.google,
  ollama: LLM_PROVIDER_LABELS.ollama,
  'openai-subscription': 'Codex (subscription)'
}

const credentialSummary = (provider: LlmProvider, snapshot: LlmProviderStatusSnapshot[LlmProvider]): string => {
  if (snapshot.credential.kind === 'api_key') {
    return snapshot.credential.configured ? 'Saved' : 'Not set'
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
        body: 'LLM settings could not verify Codex CLI readiness. Check the diagnostic below, fix the issue, then click Refresh.'
      }
    case 'ready':
      return {
        title: 'Codex CLI ready',
        body: 'Codex CLI sign-in is complete. ChatGPT subscription models are ready to use.'
      }
    default:
      return null
  }
}

const SectionCard = ({
  id,
  title,
  children
}: {
  id: string
  title: string
  children: ReactNode
}) => (
  <section
    id={id}
    className="space-y-4 rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-card/70 p-4"
  >
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">LLM</p>
      <div className="text-sm font-semibold text-foreground">{title}</div>
    </div>
    {children}
  </section>
)

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
  const ollamaStatus = llmProviderStatus.ollama
  const subscriptionGuidance = codexGuidance(subscriptionStatus)
  const hasSavedKey = googleStatus.credential.kind === 'api_key' && googleStatus.credential.configured
  const isSavedRedacted = hasSavedKey && !isEditingDraft && value.length === 0
  const shouldShowOllamaEmptyState = ollamaStatus.models.length === 0

  void onDisconnectLlmProvider

  useEffect(() => {
    if (apiKeySaveStatus.google.startsWith('Saved')) {
      setValue('')
      setIsEditingDraft(false)
    }
  }, [apiKeySaveStatus.google])

  return (
    <div className="space-y-5">
      <SectionCard id="llm-settings-google" title="Gemini">
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">LLM provider</span>
            <Select value={GOOGLE_PROVIDER_ID} onValueChange={() => {}}>
              <SelectTrigger id="settings-llm-provider-google" data-testid="select-llm-provider-google">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GOOGLE_PROVIDER_ID}>{SETTINGS_PROVIDER_LABELS[GOOGLE_PROVIDER_ID]}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">LLM model</span>
            <Select value={GOOGLE_MODEL_ID} onValueChange={() => {}}>
              <SelectTrigger id="settings-llm-model-google" data-testid="select-llm-model-google" className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GOOGLE_MODEL_ID} className="font-mono">{GOOGLE_MODEL_ID}</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                className="flex h-8 w-8 items-center justify-center rounded border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      </SectionCard>

      <SectionCard id="llm-settings-openai-subscription" title="OpenAI subscription">
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">LLM provider</span>
            <Select value={OPENAI_SUBSCRIPTION_PROVIDER_ID} onValueChange={() => {}}>
              <SelectTrigger
                id="settings-llm-provider-openai-subscription"
                data-testid="select-llm-provider-openai-subscription"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OPENAI_SUBSCRIPTION_PROVIDER_ID}>
                  {SETTINGS_PROVIDER_LABELS[OPENAI_SUBSCRIPTION_PROVIDER_ID]}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <span className="text-muted-foreground">LLM model</span>
            <Select value={OPENAI_SUBSCRIPTION_MODEL_ID} onValueChange={() => {}}>
              <SelectTrigger
                id="settings-llm-model-openai-subscription"
                data-testid="select-llm-model-openai-subscription"
                className="font-mono"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OPENAI_SUBSCRIPTION_MODEL_ID} className="font-mono">
                  {OPENAI_SUBSCRIPTION_MODEL_ID}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-medium text-foreground">Codex CLI access</p>
              <p className="text-[10px] text-muted-foreground">
                Refresh after install or login to update ChatGPT subscription readiness.
              </p>
            </div>
            <button
              type="button"
              disabled={isSubscriptionPending}
              className="h-7 rounded border border-border bg-secondary px-2 text-[10px] text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                setIsSubscriptionPending(true)
                try {
                  await onConnectLlmProvider()
                } finally {
                  setIsSubscriptionPending(false)
                }
              }}
            >
              Refresh
            </button>
          </div>

          <p
            className="text-[10px] text-muted-foreground"
            id="llm-provider-status-openai-subscription"
            aria-live="polite"
          >
            {subscriptionStatus.status.message}
          </p>

          {subscriptionGuidance ? (
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
      </SectionCard>

      <SectionCard id="llm-settings-ollama" title="Ollama">
        <div className="flex flex-col gap-2 text-xs">
          <span className="text-muted-foreground">LLM provider</span>
          <Select value={OLLAMA_PROVIDER_ID} onValueChange={() => {}}>
            <SelectTrigger id="settings-llm-provider-ollama" data-testid="select-llm-provider-ollama">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OLLAMA_PROVIDER_ID}>{SETTINGS_PROVIDER_LABELS[OLLAMA_PROVIDER_ID]}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-[10px] text-muted-foreground" id="llm-provider-status-ollama" aria-live="polite">
          {ollamaStatus.status.message}
        </p>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Model availability</p>
          <div className="space-y-2">
            {shouldShowOllamaEmptyState ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-3 py-4 text-[10px] text-muted-foreground">
                No supported Ollama models are detected yet. Pull one of the curated models, then refresh readiness.
              </div>
            ) : (
              ollamaStatus.models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{model.label}</p>
                    {model.label !== model.id ? (
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{model.id}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-[10px] ${
                      model.available
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-border bg-secondary text-muted-foreground'
                    }`}
                  >
                    {model.available ? 'Ready' : 'Unavailable'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </SectionCard>

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
