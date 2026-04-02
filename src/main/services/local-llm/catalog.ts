// Where: Main-process local-LLM catalog.
// What:  Curated supported Ollama models and their user-facing metadata.
// Why:   Keep Ollama support policy close to the runtime layer instead of
//        embedding it in the broad shared Settings domain module.

import {
  MAX_SUPPORTED_LOCAL_MODELS,
  type LocalLlmModelId,
  type LocalLlmRuntimeId
} from '../../../shared/local-llm'

export interface SupportedLocalLlmModel {
  id: LocalLlmModelId
  runtime: LocalLlmRuntimeId
  label: string
  family: 'qwen3.5' | 'qwen3.5-instruct'
  size: '0.8b' | '2b' | '4b'
}

export const SUPPORTED_LOCAL_LLM_MODELS: readonly SupportedLocalLlmModel[] = [
  {
    id: 'qwen3.5:2b',
    runtime: 'ollama',
    label: 'qwen3.5:2b',
    family: 'qwen3.5',
    size: '2b'
  },
  {
    id: 'qwen3.5:4b',
    runtime: 'ollama',
    label: 'qwen3.5:4b',
    family: 'qwen3.5',
    size: '4b'
  },
  {
    id: 'sorc/qwen3.5-instruct:0.8b',
    runtime: 'ollama',
    label: 'sorc/qwen3.5-instruct:0.8b',
    family: 'qwen3.5-instruct',
    size: '0.8b'
  },
  {
    id: 'sorc/qwen3.5-instruct-uncensored:2b',
    runtime: 'ollama',
    label: 'sorc/qwen3.5-instruct-uncensored:2b',
    family: 'qwen3.5-instruct',
    size: '2b'
  }
]

if (SUPPORTED_LOCAL_LLM_MODELS.length > MAX_SUPPORTED_LOCAL_MODELS) {
  throw new Error(`Supported local LLM model catalog exceeds the ${MAX_SUPPORTED_LOCAL_MODELS}-model cap.`)
}
