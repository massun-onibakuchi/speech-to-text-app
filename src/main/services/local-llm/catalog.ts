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
  family: 'plamo-2-translate' | 'qwen3.5' | 'qwen3.5-instruct'
  size: '0.8b' | '2b' | '4b' | '8b'
  quantization?: 'IQ2_M' | 'IQ2_S' | 'IQ2_XS' | 'IQ2_XXS' | 'Q2_K' | 'Q3_K_M' | 'Q4_K_M'
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
    id: 'mitmul/plamo-2-translate',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate',
    family: 'plamo-2-translate',
    size: '8b'
  },
  {
    id: 'mitmul/plamo-2-translate:Q2_K',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:Q2_K',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'Q2_K'
  },
  {
    id: 'mitmul/plamo-2-translate:Q3_K_M',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:Q3_K_M',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'Q3_K_M'
  },
  {
    id: 'mitmul/plamo-2-translate:Q4_K_M',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:Q4_K_M',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'Q4_K_M'
  },
  {
    id: 'mitmul/plamo-2-translate:IQ2_M',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:IQ2_M',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'IQ2_M'
  },
  {
    id: 'mitmul/plamo-2-translate:IQ2_S',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:IQ2_S',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'IQ2_S'
  },
  {
    id: 'mitmul/plamo-2-translate:IQ2_XS',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:IQ2_XS',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'IQ2_XS'
  },
  {
    id: 'mitmul/plamo-2-translate:IQ2_XXS',
    runtime: 'ollama',
    label: 'mitmul/plamo-2-translate:IQ2_XXS',
    family: 'plamo-2-translate',
    size: '8b',
    quantization: 'IQ2_XXS'
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
