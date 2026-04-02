// Where: Main-process local-LLM runtime contract.
// What:  Shared runtime-facing types for local model discovery and transformation execution.
// Why:   Keep the Ollama adapter replaceable while preserving a narrow contract
//        for future pipeline and UI integration work.

import type { LocalLlmModelId, LocalLlmRuntimeId } from '../../../shared/local-llm'
import type { SupportedLocalLlmModel } from './catalog'

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

export interface LocalLlmTransformationRequest {
  text: string
  systemPrompt: string
  userPrompt: string
  timeoutMs: number
}

export interface LocalLlmTransformationResponse {
  transformedText: string
  modelId: LocalLlmModelId
}

export interface LocalLlmRuntime {
  kind: LocalLlmRuntimeId
  healthcheck(): Promise<LocalLlmHealthcheckResult>
  listModels(): Promise<readonly SupportedLocalLlmModel[]>
  transform(
    request: LocalLlmTransformationRequest,
    modelId: LocalLlmModelId
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
