/*
Where: src/main/services/llm-provider-readiness-service.ts
What: Main-process authority for LLM provider credential and readiness snapshots.
Why: Replace renderer-side assumptions with one provider-scoped readiness contract
     that can cover API-key, OAuth, and local-runtime providers before all providers ship.
*/

import type { LlmProviderStatusSnapshot } from '../../shared/ipc'
import {
  LLM_MODEL_ALLOWLIST,
  LLM_MODEL_LABELS,
  type LlmProvider
} from '../../shared/llm'
import { SecretStore } from './secret-store'
import { CodexCliService } from './codex-cli-service'
import { OllamaLocalLlmRuntime } from './local-llm/ollama-local-llm-runtime'
import { LocalLlmRuntimeError } from './local-llm/types'

const GENERIC_CODEX_PROBE_FAILURE_PATTERN = /^Codex CLI readiness probe failed(?: with exit code ([^.]+))?\.$/

export class LlmProviderReadinessService {
  private readonly secretStore: SecretStore
  private readonly localLlmRuntime: Pick<OllamaLocalLlmRuntime, 'healthcheck' | 'listModels'>
  private readonly codexCliService: Pick<CodexCliService, 'getReadiness'>

  constructor(deps: {
    secretStore: SecretStore
    localLlmRuntime: Pick<OllamaLocalLlmRuntime, 'healthcheck' | 'listModels'>
    codexCliService: Pick<CodexCliService, 'getReadiness'>
  }) {
    this.secretStore = deps.secretStore
    this.localLlmRuntime = deps.localLlmRuntime
    this.codexCliService = deps.codexCliService
  }

  async getSnapshot(): Promise<LlmProviderStatusSnapshot> {
    const ollama = await this.buildOllamaSnapshot()
    const openAiSubscription = await this.buildOpenAiSubscriptionSnapshot()

    return {
      google: this.buildGoogleSnapshot(),
      ollama,
      'openai-subscription': openAiSubscription
    }
  }

  private buildGoogleSnapshot(): LlmProviderStatusSnapshot['google'] {
    const configured = this.secretStore.getApiKey('google') !== null
    return {
      provider: 'google',
      credential: { kind: 'api_key', configured },
      status: configured
        ? { kind: 'ready', message: 'Google API key is configured.' }
        : { kind: 'missing_credentials', message: 'Add a Google API key to enable Gemini transformation.' },
      models: LLM_MODEL_ALLOWLIST.google.map((id) => ({
        id,
        label: LLM_MODEL_LABELS[id],
        available: configured
      }))
    }
  }

  private async buildOllamaSnapshot(): Promise<LlmProviderStatusSnapshot['ollama']> {
    const base = {
      provider: 'ollama' as const,
      credential: { kind: 'local' as const }
    }
    const curatedModels = LLM_MODEL_ALLOWLIST.ollama.map((id) => ({
      id,
      label: LLM_MODEL_LABELS[id],
      available: false
    }))

    try {
      const health = await this.localLlmRuntime.healthcheck()
      if (!health.ok) {
        return {
          ...base,
          status: {
            kind: mapLocalRuntimeStatus(health.code),
            message: health.message
          },
          models: curatedModels
        }
      }
      const installedModels = await this.localLlmRuntime.listModels()
      const installedIds = new Set<string>(installedModels.map((model) => model.id))
      const models = LLM_MODEL_ALLOWLIST.ollama.map((id) => ({
        id,
        label: LLM_MODEL_LABELS[id],
        available: installedIds.has(id)
      }))
      const hasInstalledSupportedModel = models.some((model) => model.available)
      return {
        ...base,
        status: hasInstalledSupportedModel
          ? { kind: 'ready', message: 'Ollama is available.' }
          : { kind: 'no_supported_models', message: 'No curated Ollama LLM model is installed yet.' },
        models
      }
    } catch (error) {
      return {
        ...base,
        status: {
          kind: mapLocalRuntimeStatus(error),
          message: error instanceof Error ? error.message : 'Failed to query Ollama model availability.'
        },
        models: curatedModels
      }
    }
  }

  private async buildOpenAiSubscriptionSnapshot(): Promise<LlmProviderStatusSnapshot['openai-subscription']> {
    const readiness = await this.codexCliService.getReadiness()
    const installed = readiness.kind !== 'cli_not_installed'
    const ready = readiness.kind === 'ready'

    const status =
      readiness.kind === 'cli_not_installed'
        ? {
            kind: 'cli_not_installed' as const,
            message: 'Codex CLI is not installed. Install it to use ChatGPT subscription models.'
          }
        : readiness.kind === 'cli_login_required'
          ? {
              kind: 'cli_login_required' as const,
              message: 'Codex CLI is installed but not signed in. Run `codex login` in your terminal, then refresh.'
            }
        : readiness.kind === 'ready'
            ? {
                kind: 'ready' as const,
                message: readiness.version
                  ? `Codex CLI ${readiness.version} is installed and signed in.`
                  : 'Codex CLI is installed and signed in.'
              }
            : {
                kind: 'cli_probe_failed' as const,
                message: normalizeCodexProbeFailureMessage(readiness.message)
              }

    return {
      provider: 'openai-subscription',
      credential: {
        kind: 'cli',
        installed,
        ...(readiness.kind === 'ready' && readiness.version ? { version: readiness.version } : {})
      },
      status,
      models: LLM_MODEL_ALLOWLIST['openai-subscription'].map((id) => ({
        id,
        label: LLM_MODEL_LABELS[id],
        available: ready
      }))
    }
  }
}

const mapLocalRuntimeStatus = (value: unknown): 'runtime_unavailable' | 'server_unreachable' | 'unknown' => {
  if (value === 'runtime_unavailable' || value === 'server_unreachable' || value === 'unknown') {
    return value
  }

  if (value instanceof LocalLlmRuntimeError) {
    if (value.code === 'runtime_unavailable' || value.code === 'server_unreachable') {
      return value.code
    }
  }

  return 'unknown'
}

const normalizeCodexProbeFailureMessage = (message: string): string => {
  const trimmed = message.trim()
  const genericMatch = trimmed.match(GENERIC_CODEX_PROBE_FAILURE_PATTERN)
  if (genericMatch) {
    const exitCode = genericMatch[1]
    return exitCode
      ? `Codex CLI is installed, but Dicta could not confirm login state (exit code ${exitCode}). Run \`codex login\`, then refresh.`
      : 'Codex CLI is installed, but Dicta could not confirm login state. Run `codex login`, then refresh.'
  }

  return trimmed.length > 0 ? trimmed : 'Codex CLI is installed, but Dicta could not confirm login state. Run `codex login`, then refresh.'
}
