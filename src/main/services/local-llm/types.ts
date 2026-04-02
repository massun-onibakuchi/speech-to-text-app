// Where: Main-process local-LLM runtime contract.
// What:  Shared runtime-facing types for local cleanup and transformation execution.
// Why:   Keep the Ollama adapter replaceable while preserving a narrow contract
//        for future pipeline and UI integration work.

import type { LocalCleanupModelId, LocalCleanupRuntimeId } from '../../../shared/local-llm'
import type { SupportedLocalCleanupModel } from './catalog'

export type LocalLlmFailureCode =
  | 'runtime_unavailable'
  | 'server_unreachable'
  | 'model_missing'
  | 'timeout'
  | 'invalid_response'
  | 'unsupported_model'
  | 'unknown'

export type LocalLlmHealthcheckResult =
  | { ok: true }
  | {
      ok: false
      code: Extract<LocalLlmFailureCode, 'runtime_unavailable' | 'server_unreachable' | 'unknown'>
      message: string
    }

export interface LocalCleanupRequest {
  text: string
  protectedTerms: readonly string[]
  timeoutMs: number
  language?: string
}

export interface LocalCleanupResponse {
  cleanedText: string
  modelId: LocalCleanupModelId
}

export interface LocalLlmTransformationRequest {
  text: string
  systemPrompt: string
  userPrompt: string
  timeoutMs: number
}

export interface LocalLlmTransformationResponse {
  transformedText: string
  modelId: LocalCleanupModelId
}

export interface LocalLlmRuntime {
  kind: LocalCleanupRuntimeId
  healthcheck(): Promise<LocalLlmHealthcheckResult>
  listModels(): Promise<readonly SupportedLocalCleanupModel[]>
  cleanup(request: LocalCleanupRequest, modelId: LocalCleanupModelId): Promise<LocalCleanupResponse>
  transform(
    request: LocalLlmTransformationRequest,
    modelId: LocalCleanupModelId
  ): Promise<LocalLlmTransformationResponse>
}

export class LocalLlmRuntimeError extends Error {
  readonly code: LocalLlmFailureCode

  constructor(code: LocalLlmFailureCode, message: string) {
    super(message)
    this.name = 'LocalLlmRuntimeError'
    this.code = code
  }
}
