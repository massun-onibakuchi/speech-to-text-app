// Where: Main-process Ollama local-LLM runtime adapter.
// What:  Discovers supported models, runs health checks, and performs
//        transformation requests against Ollama's localhost HTTP API.
// Why:   Ship local transformation support without bundling native inference
//        dependencies into Dicta itself.

import { validateBaseUrlOverride } from '../endpoint-resolver'
import type { LocalLlmModelId } from '../../../shared/local-llm'
import { SUPPORTED_LOCAL_LLM_MODELS, type SupportedLocalLlmModel } from './catalog'
import { LOCAL_LLM_DISCOVERY_TIMEOUT_MS } from './config'
import { buildPromptBlocks } from '../transformation/prompt-format'
import {
  type LocalLlmFailureCode,
  LocalLlmRuntimeError,
  type LocalLlmHealthcheckResult,
  type LocalLlmRuntime,
  type LocalLlmTransformationRequest,
  type LocalLlmTransformationResponse
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
  // thinking: returned when think:true is sent; unused in the transformation path
  thinking?: string
}

interface OllamaTransformationPayload {
  transformed_text?: string
}

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434'
const OLLAMA_TAGS_PATH = '/api/tags'
const OLLAMA_GENERATE_PATH = '/api/generate'
const OLLAMA_TRANSFORMATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    transformed_text: { type: 'string' }
  },
  required: ['transformed_text']
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

  async listModels(): Promise<readonly SupportedLocalLlmModel[]> {
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

    // Match against ollamaId when present — think/no-think variants share
    // the same underlying Ollama model name so both appear when one is installed.
    return SUPPORTED_LOCAL_LLM_MODELS.filter((model) => installedModelIds.has(model.ollamaId ?? model.id))
  }

  async transform(
    request: LocalLlmTransformationRequest,
    modelId: LocalLlmModelId
  ): Promise<LocalLlmTransformationResponse> {
    const catalogEntry = this.requireCatalogEntry(modelId)

    // ollamaId may differ from the catalog id (e.g. think/no-think variants
    // share the same underlying Ollama model name). Guard against empty strings
    // which would reach Ollama and be misdiagnosed as model_missing.
    if (catalogEntry.ollamaId !== undefined && catalogEntry.ollamaId.trim().length === 0) {
      throw new LocalLlmRuntimeError('unsupported_model', `Catalog entry for ${modelId} has an empty ollamaId`)
    }
    const ollamaModelId = catalogEntry.ollamaId ?? modelId

    // think must be a top-level field — placing it inside `options` is
    // silently ignored by /api/generate (Ollama issue #14793).
    const thinkField = catalogEntry.think !== undefined ? { think: catalogEntry.think } : {}

    const response = await this.fetchJson<OllamaGenerateResponse>(
      this.resolveUrl(OLLAMA_GENERATE_PATH),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: ollamaModelId,
          ...thinkField,
          system: request.systemPrompt.trim(),
          prompt: buildPromptBlocks({
            sourceText: request.text,
            userPrompt: request.userPrompt
          }).join('\n\n'),
          format: OLLAMA_TRANSFORMATION_RESPONSE_SCHEMA,
          stream: false,
          options: {
            temperature: 0
          }
        })
      },
      request.timeoutMs,
      'model_missing'
    )

    const payload = this.parseStructuredResponse<OllamaTransformationPayload>({
      response,
      fieldName: 'transformed_text',
      context: 'transformation'
    })

    if (typeof payload.transformed_text !== 'string') {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        'Ollama transformation JSON did not include transformed_text'
      )
    }

    return {
      transformedText: payload.transformed_text,
      modelId
    }
  }

  private resolveUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private requireCatalogEntry(modelId: LocalLlmModelId): (typeof SUPPORTED_LOCAL_LLM_MODELS)[number] {
    const entry = SUPPORTED_LOCAL_LLM_MODELS.find((m) => m.id === modelId)
    if (!entry) {
      throw new LocalLlmRuntimeError('unsupported_model', `Model ${modelId} is not in the supported local catalog`)
    }
    return entry
  }

  private parseStructuredResponse<T extends object>(input: {
    response: OllamaGenerateResponse
    fieldName: string
    context: 'transformation'
  }): T {
    if (typeof input.response.response !== 'string') {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama ${input.context} response did not include a text payload`
      )
    }
    if (input.response.done !== true) {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama ${input.context} response did not finish`
      )
    }
    if (input.response.done_reason === 'length' || input.response.done_reason === 'context_length') {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama ${input.context} response was truncated (${input.response.done_reason})`
      )
    }

    let payload: T
    try {
      payload = JSON.parse(input.response.response) as T
    } catch {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama ${input.context} response was not valid JSON`
      )
    }

    if (!(input.fieldName in payload)) {
      throw new LocalLlmRuntimeError(
        'invalid_response',
        `Ollama ${input.context} JSON did not include ${input.fieldName}`
      )
    }

    return payload
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
