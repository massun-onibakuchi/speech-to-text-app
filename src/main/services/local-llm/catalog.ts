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
  family: 'qwen3.5'
  size: '2b' | '4b'
  supportedTasks: readonly ['cleanup']
}

export const SUPPORTED_LOCAL_CLEANUP_MODELS: readonly SupportedLocalCleanupModel[] = [
  {
    id: 'qwen3.5:2b',
    runtime: 'ollama',
    label: 'Qwen 3.5 2B',
    family: 'qwen3.5',
    size: '2b',
    supportedTasks: ['cleanup']
  },
  {
    id: 'qwen3.5:4b',
    runtime: 'ollama',
    label: 'Qwen 3.5 4B',
    family: 'qwen3.5',
    size: '4b',
    supportedTasks: ['cleanup']
  }
]

if (SUPPORTED_LOCAL_CLEANUP_MODELS.length > MAX_SUPPORTED_LOCAL_MODELS) {
  throw new Error(`Supported local cleanup model catalog exceeds the ${MAX_SUPPORTED_LOCAL_MODELS}-model cap.`)
}
