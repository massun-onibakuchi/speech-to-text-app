/*
Where: src/renderer/settings-api-keys-react.tsx
What: Renderer LLM credential and readiness surface for the Settings tab.
Why: Cloud and local LLM providers now need distinct setup affordances, while still
     sharing one coherent Settings information architecture.
*/

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { LLM_PROVIDER_IDS, LLM_PROVIDER_LABELS, type LlmProvider } from '../shared/llm'
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
type CloudLlmProvider = Exclude<LlmProvider, 'ollama'>
const CLOUD_PROVIDER_IDS = LLM_PROVIDER_IDS.filter((provider): provider is CloudLlmProvider => provider !== 'ollama')
const OLLAMA_PROVIDER_ID: LlmProvider = 'ollama'
const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex'
const CODEX_LOGIN_COMMAND = 'codex login'

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
        body: 'Dicta could not verify Codex CLI readiness. Check the diagnostic below, fix the issue, then click Refresh.'
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

const readinessPill = (snapshot: LlmProviderStatusSnapshot[LlmProvider]) => {
  switch (snapshot.status.kind) {
    case 'ready':
      return {
        label: 'Ready',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      }
    case 'missing_credentials':
      return {
        label: 'Key required',
        className: 'border-border bg-secondary text-muted-foreground'
      }
    case 'cli_not_installed':
      return {
        label: 'Install required',
        className: 'border-border bg-secondary text-muted-foreground'
      }
    case 'cli_login_required':
      return {
        label: 'Login required',
        className: 'border-border bg-secondary text-muted-foreground'
      }
    case 'runtime_unavailable':
      return {
        label: 'Runtime unavailable',
        className: 'border-border bg-secondary text-muted-foreground'
      }
    case 'cli_probe_failed':
      return {
        label: 'Check status',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      }
    case 'unknown':
      return {
        label: 'Loading',
        className: 'border-border bg-secondary text-muted-foreground'
      }
    default:
      return {
        label: 'Needs setup',
        className: 'border-border bg-secondary text-muted-foreground'
      }
  }
}

const modelAvailabilityLabel = (available: boolean): string => (available ? 'Ready' : 'Unavailable')

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
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<CloudLlmProvider>('google')
  const googleStatus = llmProviderStatus.google
  const subscriptionStatus = llmProviderStatus['openai-subscription']
  const ollamaStatus = llmProviderStatus.ollama
  const subscriptionGuidance = codexGuidance(subscriptionStatus)
  const hasSavedKey = googleStatus.credential.kind === 'api_key' && googleStatus.credential.configured
  const isSavedRedacted = hasSavedKey && !isEditingDraft && value.length === 0
  const selectedCloudSnapshot = llmProviderStatus[selectedCloudProvider]
  const selectedCloudPill = readinessPill(selectedCloudSnapshot)
  const ollamaPill = readinessPill(ollamaStatus)

  useEffect(() => {
    if (apiKeySaveStatus.google.startsWith('Saved')) {
      setValue('')
      setIsEditingDraft(false)
    }
  }, [apiKeySaveStatus.google])

  return (
    <div className="space-y-5">
      <section
        id="llm-settings-cloud"
        className="space-y-4 rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-card/70 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Cloud LLM</p>
            <div className="text-sm font-semibold text-foreground">Hosted providers</div>
            <p className="max-w-[44ch] text-[10px] leading-4 text-muted-foreground">
              Review each provider&apos;s setup requirements and model readiness here. Profile provider/model choices still
              live in the Profiles tab.
            </p>
          </div>
          <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
            {credentialSummary(selectedCloudProvider, selectedCloudSnapshot)}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Provider details</p>
          <div className="flex flex-wrap gap-2" aria-label="Cloud provider details">
            {CLOUD_PROVIDER_IDS.map((provider) => {
              const pill = readinessPill(llmProviderStatus[provider])
              const isSelected = provider === selectedCloudProvider
              return (
                <button
                  key={provider}
                  id={`settings-llm-cloud-provider-${provider}`}
                  type="button"
                  aria-pressed={isSelected}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-foreground/20 bg-foreground/5'
                      : 'border-border bg-background/70 hover:bg-accent/60'
                  }`}
                  onClick={() => {
                    setSelectedCloudProvider(provider)
                  }}
                >
                  <div className="text-xs font-medium text-foreground">{LLM_PROVIDER_LABELS[provider]}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{credentialSummary(provider, llmProviderStatus[provider])}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 ${pill.className}`}>{pill.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{LLM_PROVIDER_LABELS[selectedCloudProvider]}</p>
              <p
                className="text-[10px] text-muted-foreground"
                id={`llm-provider-status-${selectedCloudProvider}`}
                aria-live="polite"
              >
                {selectedCloudSnapshot.status.message}
              </p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[10px] ${selectedCloudPill.className}`}>
              {selectedCloudPill.label}
            </span>
          </div>

          <div className="mt-3 rounded-lg border border-border/60 bg-card/60 p-3">
            {selectedCloudProvider === GOOGLE_PROVIDER_ID ? (
              <div className="space-y-3">
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
              </div>
            ) : (
              <div className="space-y-3">
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
            )}

            <div className="mt-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Supported models</p>
              <div className="space-y-2">
                {selectedCloudSnapshot.models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{model.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{model.id}</p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] ${
                        model.available
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-secondary text-muted-foreground'
                      }`}
                    >
                      {modelAvailabilityLabel(model.available)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="llm-settings-local"
        className="space-y-4 rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-card/70 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Local LLM</p>
            <div className="text-sm font-semibold text-foreground">Ollama runtime</div>
            <p className="max-w-[44ch] text-[10px] leading-4 text-muted-foreground">
              Local models depend on runtime health and per-model availability, so diagnostics stay visible together.
            </p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[10px] ${ollamaPill.className}`}>
            {ollamaPill.label}
          </span>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{LLM_PROVIDER_LABELS[OLLAMA_PROVIDER_ID]}</p>
              <p className="text-[10px] text-muted-foreground">
                {credentialSummary(OLLAMA_PROVIDER_ID, ollamaStatus)}
              </p>
            </div>
            <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
              Runtime
            </span>
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground" id="llm-provider-status-ollama" aria-live="polite">
            {ollamaStatus.status.message}
          </p>

          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Model availability</p>
            <div className="space-y-2">
              {ollamaStatus.models.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-3 py-4 text-[10px] text-muted-foreground">
                  No supported Ollama models are detected yet. Pull one of Dicta&apos;s curated models, then refresh readiness.
                </div>
              ) : (
                ollamaStatus.models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{model.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{model.id}</p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] ${
                        model.available
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-secondary text-muted-foreground'
                      }`}
                    >
                      {modelAvailabilityLabel(model.available)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

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
