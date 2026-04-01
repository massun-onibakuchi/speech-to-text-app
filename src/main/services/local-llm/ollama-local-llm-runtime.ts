// Where: Main-process Ollama local-LLM runtime adapter.
// What:  Discovers supported models, runs health checks, and performs cleanup
//        requests against Ollama's localhost HTTP API.
// Why:   Ship the first local cleanup runtime without bundling native inference
//        dependencies into Dicta itself.

import { validateBaseUrlOverride } from '../endpoint-resolver'
import type { LocalCleanupModelId } from '../../../shared/local-llm'
import { SUPPORTED_LOCAL_CLEANUP_MODELS, type SupportedLocalCleanupModel } from './catalog'
import { LOCAL_LLM_DISCOVERY_TIMEOUT_MS } from './config'
import {
  type LocalLlmFailureCode,
  LocalLlmRuntimeError,
  type LocalCleanupRequest,
  type LocalCleanupResponse,
  type LocalLlmHealthcheckResult,
  type LocalLlmRuntime
} from './types'

interface OllamaTagsResponse {
  models?: Array<{
    name?: string
    model?: string
  }>
}

interface OllamaGenerateResponse {
  response?: string
  done?: boolean
  done_reason?: string
}

interface OllamaCleanupPayload {
  cleaned_text?: string
}

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434'
const OLLAMA_TAGS_PATH = '/api/tags'
const OLLAMA_GENERATE_PATH = '/api/generate'
const OLLAMA_CLEANUP_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    cleaned_text: { type: 'string' }
  },
  required: ['cleaned_text']
} as const

export class OllamaLocalLlmRuntime implements LocalLlmRuntime {
  readonly kind = 'ollama' as const
  private readonly baseUrl: string

  constructor(baseUrl?: string | null) {
    this.baseUrl = validateBaseUrlOverride(baseUrl) ?? OLLAMA_DEFAULT_BASE_URL
  }

  async healthcheck(): Promise<LocalLlmHealthcheckResult> {
    const { signal, cleanup } = createTimeoutSignal(LOCAL_LLM_DISCOVERY_TIMEOUT_MS)
    try {
      const response = await fetch(this.resolveUrl(OLLAMA_TAGS_PATH), { method: 'GET', signal })
      if (!response.ok) {
        return {
          ok: false,
          code: 'server_unreachable',
          message: `Ollama healthcheck failed with status ${response.status}`
        }
      }
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        code: classifyHealthcheckFailure(error),
        message: this.getFetchErrorMessage(error, 'Ollama healthcheck failed')
      }
    } finally {
      cleanup()
    }
  }

  async listModels(): Promise<readonly SupportedLocalCleanupModel[]> {
    const response = await this.fetchJson<OllamaTagsResponse>(
      this.resolveUrl(OLLAMA_TAGS_PATH),
      { method: 'GET' },
      LOCAL_LLM_DISCOVERY_TIMEOUT_MS
    )
    const installedModelIds = new Set(
      (response.models ?? [])
        .map((model) => model.model ?? model.name ?? '')
        .filter((modelId) => modelId.length > 0)
    )

    return SUPPORTED_LOCAL_CLEANUP_MODELS.filter((model) => installedModelIds.has(model.id))
  }

  async cleanup(request: LocalCleanupRequest, modelId: LocalCleanupModelId): Promise<LocalCleanupResponse> {
    if (!SUPPORTED_LOCAL_CLEANUP_MODELS.some((model) => model.id === modelId)) {
      throw new LocalLlmRuntimeError('unsupported_model', `Model ${modelId} is not in the supported local catalog`)
    }

    const response = await this.fetchJson<OllamaGenerateResponse>(
      this.resolveUrl(OLLAMA_GENERATE_PATH),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          system: this.buildCleanupSystemPrompt(),
          prompt: this.buildCleanupPrompt(request),
          format: OLLAMA_CLEANUP_RESPONSE_SCHEMA,
          stream: false,
          options: {
            temperature: 0
          }
        })
      },
      request.timeoutMs,
      'model_missing'
    )

    if (typeof response.response !== 'string') {
      throw new LocalLlmRuntimeError('invalid_response', 'Ollama cleanup response did not include a text payload')
    }
    if (response.done !== true) {
      throw new LocalLlmRuntimeError('invalid_response', 'Ollama cleanup response did not finish')
    }
    if (response.done_reason === 'length' || response.done_reason === 'context_length') {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama cleanup response was truncated (${response.done_reason})`
      )
    }

    let payload: OllamaCleanupPayload
    try {
      payload = JSON.parse(response.response) as OllamaCleanupPayload
    } catch {
      throw new LocalLlmRuntimeError('invalid_response', 'Ollama cleanup response was not valid JSON')
    }

    if (typeof payload.cleaned_text !== 'string') {
      throw new LocalLlmRuntimeError('invalid_response', 'Ollama cleanup JSON did not include cleaned_text')
    }

    return {
      cleanedText: payload.cleaned_text,
      modelId
    }
  }

  private buildCleanupSystemPrompt(): string {
    return [
      'You clean transcript text.',
      'Return JSON only.',
      'Use the exact schema field cleaned_text.',
      'Preserve meaning and do not add information.'
    ].join(' ')
  }

  private buildCleanupPrompt(request: LocalCleanupRequest): string {
    const languageLine = request.language?.trim() ? `Language: ${request.language.trim()}` : 'Language: auto'
    const protectedTermsLine =
      request.protectedTerms.length > 0
        ? `Protected terms: ${JSON.stringify([...request.protectedTerms])}`
        : 'Protected terms: []'

    return [
      languageLine,
      protectedTermsLine,
      'Clean obvious filler/disfluency while preserving the original meaning.',
      'Do not summarize. Do not add information. Do not omit protected terms.',
      `Transcript:\n<input_text>${request.text}</input_text>`
    ].join('\n')
  }

  private resolveUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit,
    timeoutMs?: number,
    notFoundCode: Extract<LocalLlmFailureCode, 'model_missing' | 'server_unreachable'> = 'server_unreachable'
  ): Promise<T> {
    const { signal, cleanup } = createTimeoutSignal(timeoutMs)
    try {
      const response = await fetch(url, {
        ...init,
        signal
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new LocalLlmRuntimeError(notFoundCode, `Ollama request failed with status ${response.status}`)
        }
        throw new LocalLlmRuntimeError('server_unreachable', `Ollama request failed with status ${response.status}`)
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof LocalLlmRuntimeError) {
        throw error
      }
      if (isAbortError(error)) {
        throw new LocalLlmRuntimeError('timeout', `Ollama request timed out after ${timeoutMs ?? 0}ms`)
      }
      const code = classifyHealthcheckFailure(error)
      throw new LocalLlmRuntimeError(
        code === 'server_unreachable' ? code : 'runtime_unavailable',
        this.getFetchErrorMessage(error, 'Ollama request failed')
      )
    } finally {
      cleanup()
    }
  }

  private getFetchErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
  }
}

const createTimeoutSignal = (timeoutMs?: number): { signal: AbortSignal | undefined; cleanup: () => void } => {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      signal: undefined,
      cleanup: () => {}
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  }
}

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

const classifyHealthcheckFailure = (
  error: unknown
): Extract<LocalLlmHealthcheckResult, { ok: false }>['code'] => {
  if (isAbortError(error)) {
    return 'server_unreachable'
  }

  if (!(error instanceof Error)) {
    return 'unknown'
  }

  const message = error.message.toLowerCase()
  if (
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('ehostunreach') ||
    message.includes('enetunreach') ||
    message.includes('timed out')
  ) {
    return 'server_unreachable'
  }

  return 'runtime_unavailable'
}
