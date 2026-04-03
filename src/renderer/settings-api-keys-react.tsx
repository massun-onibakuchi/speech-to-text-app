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

/** Official Ollama logo (from github.com/ollama/ollama/blob/main/docs/ollama-logo.svg). */
const OllamaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 17 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.40517 0.102088C4.62117 0.198678 4.81617 0.357766 4.99317 0.56799C5.28817 0.915712 5.53718 1.41342 5.72718 2.00318C5.91818 2.59635 6.04218 3.25316 6.08918 3.91224C6.71878 3.5075 7.41754 3.26103 8.13818 3.18953L8.18918 3.18498C9.05919 3.10544 9.91919 3.28384 10.6692 3.72361C10.7702 3.78384 10.8692 3.84861 10.9662 3.91679C11.0162 3.27021 11.1382 2.62817 11.3262 2.04863C11.5162 1.45773 11.7652 0.961166 12.0592 0.612308C12.2235 0.410338 12.4245 0.251368 12.6482 0.146406C12.9052 0.032771 13.1782 0.0123167 13.4442 0.098679C13.8452 0.228223 14.1892 0.516855 14.4602 0.936167C14.7082 1.3191 14.8942 1.81 15.0212 2.39863C15.2512 3.45998 15.2912 4.85655 15.1362 6.54061L15.1892 6.58607L15.2152 6.60766C15.9722 7.26219 16.4992 8.19513 16.7782 9.27807C17.2133 10.9678 16.9943 12.8632 16.2442 13.9235L16.2262 13.9473L16.2282 13.9507C16.6453 14.8166 16.8983 15.7314 16.9523 16.678L16.9543 16.7121C17.0183 17.9223 16.7542 19.1404 16.1402 20.337L16.1332 20.3484L16.1432 20.3756C16.6152 21.6904 16.7632 23.0142 16.5812 24.3369L16.5752 24.3813C16.547 24.5744 16.4525 24.7472 16.3125 24.8612C16.1725 24.9753 15.9983 25.0219 15.8282 24.9903C15.744 24.9753 15.6632 24.9417 15.5904 24.8912C15.5177 24.8408 15.4544 24.7744 15.4042 24.696C15.3541 24.6178 15.318 24.529 15.2981 24.4347C15.2782 24.3406 15.2748 24.2428 15.2882 24.1472C15.4552 22.9733 15.2982 21.7961 14.8082 20.5984C14.7625 20.4871 14.7422 20.3645 14.7492 20.242C14.7562 20.1194 14.7902 20.0009 14.8482 19.8972L14.8522 19.8904C15.4562 18.8404 15.7062 17.8109 15.6522 16.7996C15.6062 15.9143 15.3272 15.045 14.8522 14.2166C14.7598 14.0556 14.7269 13.8597 14.7606 13.6713C14.7943 13.4829 14.8918 13.3171 15.0322 13.2098L15.0412 13.203C15.2842 13.0223 15.5082 12.561 15.6212 11.9303C15.7459 11.1846 15.7133 10.4159 15.5262 9.68716C15.3212 8.89171 14.9462 8.22809 14.4212 7.77468C13.8262 7.25878 13.0382 7.00992 12.0412 7.08151C11.9108 7.09115 11.7809 7.05613 11.6682 6.98097C11.5556 6.90581 11.4653 6.79399 11.4092 6.65993C11.0952 5.90426 10.6372 5.36336 10.0662 5.02814C9.51799 4.71723 8.90425 4.58657 8.29418 4.65087C7.04918 4.76337 5.95118 5.56108 5.62418 6.56675C5.57792 6.70829 5.4947 6.8304 5.38568 6.91672C5.27666 7.00301 5.14703 7.04942 5.01417 7.0497C3.94717 7.05197 3.12117 7.33606 2.51717 7.84855C1.99517 8.29172 1.63916 8.91103 1.45116 9.65307C1.28104 10.3515 1.25774 11.0857 1.38316 11.7962C1.49516 12.4303 1.71416 12.9553 1.96517 13.2382L1.97317 13.2462C2.18517 13.4814 2.23017 13.8485 2.08217 14.1382C1.72216 14.845 1.45316 15.8984 1.40916 16.9109C1.35916 18.0677 1.59516 19.0722 2.12817 19.7927L2.14417 19.8143C2.22461 19.9208 2.27633 20.0514 2.29319 20.1905C2.31003 20.3295 2.29127 20.4711 2.23917 20.5984C1.66316 22.0029 1.48616 23.1574 1.67716 24.0665C1.71148 24.2556 1.67954 24.4524 1.58812 24.6149C1.4967 24.7776 1.35302 24.8933 1.18766 24.9374C1.0223 24.9817 0.848322 24.9506 0.702741 24.8512C0.557141 24.7517 0.451463 24.5917 0.408163 24.4051C0.165162 23.2483 0.330162 21.9233 0.881162 20.4302L0.895162 20.3904L0.887162 20.3768C0.616341 19.9222 0.414243 19.4195 0.289162 18.8893L0.284162 18.8677C0.132362 18.2062 0.0726416 17.5218 0.107162 16.8393C0.151162 15.8052 0.385163 14.7462 0.729162 13.8962L0.741162 13.8666L0.739162 13.8644C0.446163 13.3894 0.229162 12.7814 0.109162 12.1087L0.104162 12.0814C-0.0611788 11.1431 -0.0293187 10.1737 0.197162 9.25194C0.459163 8.21218 0.974162 7.31901 1.73316 6.67356C1.79316 6.62243 1.85616 6.57129 1.91916 6.52357C1.76016 4.827 1.80016 3.42134 2.03117 2.35317C2.15817 1.76455 2.34517 1.27365 2.59317 0.890713C2.86317 0.472537 3.20717 0.183905 3.60817 0.0532252C3.87417 -0.0331371 4.14817 -0.0126829 4.40517 0.102088ZM8.52118 10.4315C9.45719 10.4315 10.3212 10.7871 10.9672 11.403C11.5972 12.0019 11.9722 12.8064 11.9722 13.6076C11.9722 14.6166 11.5662 15.403 10.8392 15.9052C10.2192 16.3314 9.38819 16.5382 8.43618 16.5382C7.42718 16.5382 6.56518 16.2439 5.94318 15.7041C5.32618 15.17 4.98017 14.42 4.98017 13.6076C4.98017 12.8042 5.37818 11.9973 6.03618 11.3962C6.70418 10.786 7.58618 10.4315 8.52118 10.4315ZM8.52118 11.4496C7.82742 11.4428 7.15204 11.7031 6.60518 12.1883C6.14418 12.6087 5.88318 13.1371 5.88318 13.6087C5.88318 14.095 6.09318 14.5507 6.49318 14.8973C6.94818 15.2916 7.61718 15.52 8.43618 15.52C9.23519 15.52 9.90919 15.353 10.3682 15.0359C10.8312 14.7178 11.0682 14.2564 11.0682 13.6076C11.0682 13.1269 10.8222 12.5962 10.3852 12.1803C9.90119 11.7201 9.24519 11.4496 8.52118 11.4496ZM9.18319 12.8246L9.18719 12.8292C9.30719 13.0007 9.28219 13.2496 9.13119 13.386L8.83919 13.6473V14.1541C8.83865 14.267 8.79877 14.375 8.72829 14.4544C8.6578 14.5339 8.56246 14.5783 8.46318 14.578C8.3639 14.5783 8.26856 14.5339 8.19808 14.4544C8.12758 14.375 8.0877 14.267 8.08718 14.1541V13.6314L7.81618 13.3837C7.78042 13.3511 7.7507 13.3109 7.72872 13.2652C7.70674 13.2195 7.69294 13.1694 7.6881 13.1176C7.68326 13.0658 7.6875 13.0135 7.70056 12.9636C7.71362 12.9137 7.73524 12.8672 7.76418 12.8269C7.8232 12.7452 7.9082 12.6934 8.0007 12.6825C8.09318 12.6717 8.18572 12.7027 8.25818 12.7689L8.47318 12.9644L8.69318 12.7667C8.76538 12.7018 8.85702 12.6716 8.94854 12.6825C9.04009 12.6933 9.12427 12.7443 9.18319 12.8246ZM4.14317 10.644C4.62117 10.644 5.01017 11.0871 5.01017 11.6337C5.01043 11.8957 4.91917 12.1471 4.75641 12.3327C4.59365 12.5183 4.37273 12.6229 4.14217 12.6235C3.91195 12.6226 3.69143 12.518 3.52893 12.3327C3.36641 12.1474 3.27517 11.8965 3.27517 11.6349C3.27463 11.3729 3.36565 11.1213 3.52821 10.9355C3.69079 10.7497 3.91261 10.6449 4.14317 10.644ZM12.8492 10.644C13.3292 10.644 13.7172 11.0871 13.7172 11.6337C13.7175 11.8957 13.6262 12.1471 13.4634 12.3327C13.3007 12.5183 13.0798 12.6229 12.8492 12.6235C12.619 12.6226 12.3985 12.518 12.236 12.3327C12.0734 12.1474 11.9822 11.8965 11.9822 11.6349C11.9817 11.3729 12.0727 11.1213 12.2352 10.9355C12.3978 10.7497 12.6186 10.6449 12.8492 10.644ZM3.94017 1.47705L3.93717 1.47932C3.82131 1.53657 3.72239 1.63046 3.65217 1.74977L3.64717 1.75659C3.50917 1.97136 3.38917 2.28727 3.29917 2.70203C3.12917 3.48839 3.08317 4.55541 3.17517 5.86335C3.60517 5.7179 4.07417 5.62699 4.57917 5.59404L4.58917 5.5929L4.60817 5.55426C4.65417 5.46108 4.70317 5.37131 4.75617 5.28268C4.87917 4.40655 4.77817 3.35998 4.50317 2.50545C4.36917 2.09182 4.20617 1.76682 4.05017 1.5816C4.01797 1.5431 3.98207 1.5088 3.94317 1.47932L3.94017 1.47705ZM13.1142 1.52251L13.1122 1.52364C13.0733 1.55312 13.0374 1.58741 13.0052 1.62591C12.8492 1.81114 12.6852 2.13727 12.5522 2.5509C12.2622 3.45316 12.1652 4.56905 12.3222 5.47358L12.3802 5.58381L12.3882 5.59972H12.4182C12.9145 5.59988 13.4082 5.68101 13.8842 5.84062C13.9702 4.56337 13.9222 3.51907 13.7562 2.74749C13.6662 2.33272 13.5462 2.01682 13.4072 1.80205L13.4032 1.79523C13.3331 1.67548 13.2342 1.58121 13.1182 1.52364L13.1142 1.52251Z"
      fill="currentColor"
    />
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
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
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
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
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
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
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
