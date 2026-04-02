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
import { OllamaLocalLlmRuntime } from './local-llm/ollama-local-llm-runtime'
import { LocalLlmRuntimeError } from './local-llm/types'
import { OpenAiSubscriptionAuthService } from './openai-subscription-auth-service'

export class LlmProviderReadinessService {
  private readonly secretStore: SecretStore
  private readonly localLlmRuntime: Pick<OllamaLocalLlmRuntime, 'healthcheck' | 'listModels'>
  private readonly openAiSubscriptionAuthService: Pick<OpenAiSubscriptionAuthService, 'hasStoredSession'>

  constructor(deps: {
    secretStore: SecretStore
    localLlmRuntime: Pick<OllamaLocalLlmRuntime, 'healthcheck' | 'listModels'>
    openAiSubscriptionAuthService: Pick<OpenAiSubscriptionAuthService, 'hasStoredSession'>
  }) {
    this.secretStore = deps.secretStore
    this.localLlmRuntime = deps.localLlmRuntime
    this.openAiSubscriptionAuthService = deps.openAiSubscriptionAuthService
  }

  async getSnapshot(): Promise<LlmProviderStatusSnapshot> {
    const ollama = await this.buildOllamaSnapshot()

    return {
      google: this.buildGoogleSnapshot(),
      ollama,
      'openai-subscription': this.buildOpenAiSubscriptionSnapshot()
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

  private buildOpenAiSubscriptionSnapshot(): LlmProviderStatusSnapshot['openai-subscription'] {
    const configured = this.openAiSubscriptionAuthService.hasStoredSession()
    return {
      provider: 'openai-subscription',
      credential: { kind: 'oauth', configured },
      status: configured
        ? { kind: 'ready', message: 'ChatGPT subscription sign-in is configured.' }
        : {
            kind: 'oauth_required',
            message: 'Browser sign-in is required before ChatGPT subscription models can be used.'
          },
      models: LLM_MODEL_ALLOWLIST['openai-subscription'].map((id) => ({
        id,
        label: LLM_MODEL_LABELS[id],
        available: configured
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
