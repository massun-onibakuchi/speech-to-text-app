// Where: Main-process local-LLM catalog.
// What:  Curated supported local cleanup models and their user-facing metadata.
// Why:   Keep runtime-specific support policy close to the runtime layer instead
//        of embedding it in the shared Settings domain module.

import {
  MAX_SUPPORTED_LOCAL_MODELS,
  type LocalCleanupModelId,
  type LocalCleanupRuntimeId
} from '../../../shared/local-llm'

export interface SupportedLocalCleanupModel {
  id: LocalCleanupModelId
  runtime: LocalCleanupRuntimeId
  label: string
  family: 'qwen3.5' | 'qwen3.5-instruct'
  size: '0.8b' | '2b' | '4b'
  supportedTasks: readonly ['cleanup']
}

export const SUPPORTED_LOCAL_CLEANUP_MODELS: readonly SupportedLocalCleanupModel[] = [
  {
    id: 'qwen3.5:2b',
    runtime: 'ollama',
    label: 'qwen3.5:2b',
    family: 'qwen3.5',
    size: '2b',
    supportedTasks: ['cleanup']
  },
  {
    id: 'qwen3.5:4b',
    runtime: 'ollama',
    label: 'qwen3.5:4b',
    family: 'qwen3.5',
    size: '4b',
    supportedTasks: ['cleanup']
  },
  {
    id: 'sorc/qwen3.5-instruct:0.8b',
    runtime: 'ollama',
    label: 'sorc/qwen3.5-instruct:0.8b',
    family: 'qwen3.5-instruct',
    size: '0.8b',
    supportedTasks: ['cleanup']
  },
  {
    id: 'sorc/qwen3.5-instruct-uncensored:2b',
    runtime: 'ollama',
    label: 'sorc/qwen3.5-instruct-uncensored:2b',
    family: 'qwen3.5-instruct',
    size: '2b',
    supportedTasks: ['cleanup']
  }
]

if (SUPPORTED_LOCAL_CLEANUP_MODELS.length > MAX_SUPPORTED_LOCAL_MODELS) {
  throw new Error(`Supported local cleanup model catalog exceeds the ${MAX_SUPPORTED_LOCAL_MODELS}-model cap.`)
}
