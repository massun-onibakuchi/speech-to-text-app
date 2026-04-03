/*
Where: src/renderer/settings-api-keys-react.tsx
What: Renderer LLM credential and readiness surface for the Settings tab.
Why: Present Gemini, Codex Integration, and Ollama as flat top-level sections
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
const GOOGLE_MODEL_ID = 'gemini-2.5-flash'
const OPENAI_SUBSCRIPTION_MODEL_ID = 'gpt-5.4-mini'

const credentialSummary = (provider: LlmProvider, snapshot: LlmProviderStatusSnapshot[LlmProvider]): string => {
  if (snapshot.credential.kind === 'api_key') {
    return snapshot.credential.configured ? 'Saved' : 'Not set'
  }
  if (snapshot.credential.kind === 'cli') {
    return snapshot.credential.installed ? 'Installed' : 'Install required'
  }
  return provider === 'ollama' ? 'Local runtime' : 'Unavailable'
}

const ollamaStatusSummary = (snapshot: LlmProviderStatusSnapshot['ollama']): string => {
  if (snapshot.status.kind === 'runtime_unavailable') {
    return 'Not installed'
  }
  return snapshot.status.message
}

/** Returns a human-readable Codex CLI availability string for display in the UI. */
const codexCliStatusText = (snapshot: LlmProviderStatusSnapshot['openai-subscription']): string => {
  const version = snapshot.credential.kind === 'cli' ? snapshot.credential.version : undefined
  switch (snapshot.status.kind) {
    case 'ready':
      return version
        ? `Codex CLI ${version} is installed and signed in`
        : 'Codex CLI is installed and signed in'
    case 'cli_not_installed':
      return 'Not installed'
    case 'cli_login_required':
      return version
        ? `Codex CLI ${version} is installed but not signed in`
        : 'Codex CLI is installed but not signed in'
    default:
      return snapshot.status.message
  }
}

/** Ollama brand icon (Simple Icons — simpleicons.org/ollama, viewBox 0 0 24 24). */
const OllamaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16.361 10.26a.9.9 0 0 0-.558.47l-.072.148l.001.207c0 .193.004.217.059.353c.076.193.152.312.291.448c.24.238.51.3.872.205a.86.86 0 0 0 .517-.436a.75.75 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.1 1.1 0 0 0-.466 0m-9.203.005c-.305.096-.533.32-.65.639a1.2 1.2 0 0 0-.06.52c.057.309.31.59.598.667c.362.095.632.033.872-.205c.14-.136.215-.255.291-.448c.055-.136.059-.16.059-.353l.001-.207l-.072-.148a.9.9 0 0 0-.565-.472a1 1 0 0 0-.474.007m4.184 2c-.131.071-.223.25-.195.383c.031.143.157.288.353.407c.105.063.112.072.117.136c.004.038-.01.146-.029.243c-.02.094-.036.194-.036.222c.002.074.07.195.143.253c.064.052.076.054.255.059c.164.005.198.001.264-.03c.169-.082.212-.234.15-.525c-.052-.243-.042-.28.087-.355c.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48a.4.4 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053l-.053-.032c-.219-.13-.259-.145-.391-.143a.4.4 0 0 0-.193.032m.39-2.195c-.373.036-.475.05-.654.086a4.5 4.5 0 0 0-.951.328c-.94.46-1.589 1.226-1.787 2.114c-.04.176-.045.234-.045.53c0 .294.005.357.043.524c.264 1.16 1.332 2.017 2.714 2.173c.3.033 1.596.033 1.896 0c1.11-.125 2.064-.727 2.493-1.571c.114-.226.169-.372.22-.602c.039-.167.044-.23.044-.523c0-.297-.005-.355-.045-.531c-.288-1.29-1.539-2.304-3.072-2.497a7 7 0 0 0-.855-.031zm.645.937a3.3 3.3 0 0 1 1.44.514c.223.148.537.458.671.662c.166.251.26.508.303.82c.02.143.01.251-.043.482c-.08.345-.332.705-.672.957a3 3 0 0 1-.689.348c-.382.122-.632.144-1.525.138c-.582-.006-.686-.01-.853-.042q-.856-.16-1.35-.68c-.264-.28-.385-.535-.45-.946c-.03-.192.025-.509.137-.776c.136-.326.488-.73.836-.963c.403-.269.934-.46 1.422-.512c.187-.02.586-.02.773-.002m-5.503-11a1.65 1.65 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503c0 .544.064 1.24.155 1.721c.02.107.031.202.023.208l-.187.152a5.3 5.3 0 0 0-.949 1.02a5.5 5.5 0 0 0-.94 2.339a6.6 6.6 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195l-.037.064c-.269.452-.498 1.105-.605 1.732c-.084.496-.095.629-.095 1.294c0 .67.009.803.088 1.266c.095.555.288 1.143.503 1.534c.071.128.243.393.264.407c.007.003-.014.067-.046.141a7.4 7.4 0 0 0-.548 1.873a5 5 0 0 0-.071.991c0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597c.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.9.9 0 0 0-.194-.25a1.7 1.7 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451c.124-.486.329-.918.544-1.154a.8.8 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.14 3.14 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834c.563-.814 1.353-1.336 2.237-1.475c.199-.033.57-.028.776.01c.226.04.367.028.512-.041c.179-.085.268-.19.374-.431c.093-.215.165-.333.36-.576c.234-.29.46-.489.822-.729c.413-.27.884-.467 1.352-.561c.17-.035.25-.04.569-.04s.398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602c.034.057.095.177.132.267c.105.241.195.346.374.43c.14.068.286.082.503.045c.343-.058.607-.053.943.016c1.144.23 2.14 1.173 2.581 2.437c.385 1.108.276 2.267-.296 3.153c-.097.15-.193.27-.333.419c-.301.322-.301.722-.001 1.053c.493.539.801 1.866.708 3.036c-.062.772-.26 1.463-.533 1.854a2 2 0 0 1-.224.258a.9.9 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295c.253 1.008.231 2.01-.059 2.581a1 1 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074l.036-.134c.019-.076.057-.3.088-.516a9 9 0 0 0 0-1.258c-.11-.875-.295-1.57-.597-2.226c-.032-.074-.053-.138-.046-.141a1.4 1.4 0 0 0 .108-.152c.376-.569.607-1.284.724-2.228c.031-.26.031-1.378 0-1.628c-.083-.645-.182-1.082-.348-1.525a6 6 0 0 0-.329-.7l-.038-.064l.131-.194c.402-.604.636-1.262.727-2.04a6.6 6.6 0 0 0-.024-1.358a5.5 5.5 0 0 0-.939-2.339a5.3 5.3 0 0 0-.95-1.02l-.186-.152a.7.7 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503c-.19-.924-.535-1.658-.98-2.082c-.354-.338-.716-.482-1.15-.455c-.996.059-1.8 1.205-2.116 3.01a7 7 0 0 0-.097.726c0 .036-.007.066-.015.066a1 1 0 0 1-.149-.078A4.86 4.86 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a1 1 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a7 7 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2 2 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388c.03.113.06.244.069.292c.007.047.026.152.041.233c.067.365.098.76.102 1.24l.002.475l-.12.175l-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.4 8.4 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711c.067-.05.079-.049.157.013m9.825-.012c.17.126.358.46.498.888c.28.854.36 2.028.212 3.145c-.019.14-.024.151-.057.144l-.238-.06a3.7 3.7 0 0 0-.954-.124h-.278l-.119-.178l-.119-.175l.002-.474c.004-.669.066-1.19.214-1.772c.157-.623.434-1.185.68-1.382c.078-.062.09-.063.159-.012" />
  </svg>
)

/** OpenAI logo mark (Bootstrap Icons / svgviewer.dev/s/58713/openai, viewBox 0 0 24 24). */
const OpenAIIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
)

const SectionCard = ({
  id,
  title,
  icon,
  children
}: {
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
}) => (
  <section
    id={id}
    className="space-y-4 rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-card/70 p-4"
  >
    {title ? (
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon ? <span>{icon}</span> : null}
        <span>{title}</span>
      </div>
    ) : null}
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
      {/* ── Google Gemini ────────────────────────────────────────────────── */}
      <SectionCard id="llm-settings-google" title="">
        <div className="flex flex-col gap-2 text-xs">
          <span className="text-muted-foreground">LLM provider</span>
          <Select value={GOOGLE_PROVIDER_ID} onValueChange={() => {}}>
            <SelectTrigger id="settings-llm-provider-google" data-testid="select-llm-provider-google">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GOOGLE_PROVIDER_ID}>{LLM_PROVIDER_LABELS[GOOGLE_PROVIDER_ID]}</SelectItem>
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
      </SectionCard>

      {/* ── Ollama (local runtime) ───────────────────────────────────────── */}
      <SectionCard
        id="llm-settings-ollama"
        title="Ollama"
        icon={
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <OllamaIcon />
          </span>
        }
      >
        {/* Show status only when Ollama is not ready */}
        {ollamaStatus.status.kind === 'ready' ? null : (
          <p className="text-[10px] text-muted-foreground" id="llm-provider-status-ollama" aria-live="polite">
            {ollamaStatusSummary(ollamaStatus)}
          </p>
        )}

        <div className="space-y-2">
          <div className="rounded-xl border border-border/60 bg-background/60">
            {shouldShowOllamaEmptyState ? (
              <div className="border border-dashed border-transparent px-3 py-4 text-[10px] text-muted-foreground">
                No supported Ollama models are detected yet. Pull one of the curated models, then refresh readiness.
              </div>
            ) : (
              <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {ollamaStatus.models.map((model) => (
                  <div key={model.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium leading-4 text-foreground">{model.label}</p>
                      {model.label !== model.id ? (
                        <p className="break-all font-mono text-[10px] leading-4 text-muted-foreground">{model.id}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${
                        model.available
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-secondary text-muted-foreground'
                      }`}
                    >
                      {model.available ? 'Ready' : 'Not installed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Codex / OpenAI subscription ──────────────────────────────────── */}
      <SectionCard
        id="llm-settings-openai-subscription"
        title="Codex CLI Integration"
        icon={
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <OpenAIIcon />
          </span>
        }
      >
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

        <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            {/* Dynamic status: version + sign-in state */}
            <p
              className="font-medium text-foreground"
              id="llm-provider-status-openai-subscription"
              aria-live="polite"
            >
              {codexCliStatusText(subscriptionStatus)}
            </p>
            <button
              type="button"
              disabled={isSubscriptionPending}
              className="h-7 shrink-0 rounded border border-border bg-secondary px-2 text-[10px] text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
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
          <p className="text-[10px] text-muted-foreground">
            Refresh after install or login to update Codex CLI readiness.
          </p>
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
