// Where: Shared local-LLM contract module.
// What:  Shared runtime/model identifiers for local Ollama-backed LLM execution.
// Why:   Keep local-LLM policy out of the broad domain module while sharing the
//        curated local model catalog needed by main and renderer code.

import * as v from 'valibot'

export const MAX_SUPPORTED_LOCAL_MODELS = 20

export const LOCAL_LLM_RUNTIME_IDS = ['ollama'] as const
export type LocalLlmRuntimeId = (typeof LOCAL_LLM_RUNTIME_IDS)[number]
export const LocalLlmRuntimeIdSchema = v.picklist([...LOCAL_LLM_RUNTIME_IDS])

export const LOCAL_LLM_MODEL_IDS = [
  'qwen3.5:2b',
  'qwen3.5:4b',
  'mitmul/plamo-2-translate',
  'mitmul/plamo-2-translate:Q2_K',
  'mitmul/plamo-2-translate:Q3_K_M',
  'mitmul/plamo-2-translate:Q4_K_M',
  'mitmul/plamo-2-translate:IQ2_M',
  'mitmul/plamo-2-translate:IQ2_S',
  'mitmul/plamo-2-translate:IQ2_XS',
  'mitmul/plamo-2-translate:IQ2_XXS',
  'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b',
  'gemma4:e2b-it-q4_K_M:think',
  'gemma4:e2b-it-q4_K_M:no-think',
  'gemma4:e4b-it-q4_K_M:think',
  'gemma4:e4b-it-q4_K_M:no-think'
] as const
export type KnownLocalLlmModelId = (typeof LOCAL_LLM_MODEL_IDS)[number]
export type LocalLlmModelId = string
export const LocalLlmModelIdSchema = v.pipe(v.string(), v.minLength(1))
