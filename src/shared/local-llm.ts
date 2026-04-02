// Where: Shared local-LLM contract module.
// What:  Shared runtime/model identifiers for local Ollama-backed LLM execution.
// Why:   Keep local-LLM policy out of the broad domain module while sharing the
//        curated local model catalog needed by main and renderer code.

import * as v from 'valibot'

export const MAX_SUPPORTED_LOCAL_MODELS = 5

export const LOCAL_LLM_RUNTIME_IDS = ['ollama'] as const
export type LocalLlmRuntimeId = (typeof LOCAL_LLM_RUNTIME_IDS)[number]
export const LocalLlmRuntimeIdSchema = v.picklist([...LOCAL_LLM_RUNTIME_IDS])

export const LOCAL_LLM_MODEL_IDS = [
  'qwen3.5:2b',
  'qwen3.5:4b',
  'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b'
] as const
export type LocalLlmModelId = (typeof LOCAL_LLM_MODEL_IDS)[number]
export const LocalLlmModelIdSchema = v.picklist([...LOCAL_LLM_MODEL_IDS])
