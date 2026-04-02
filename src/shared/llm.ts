// Where: Shared LLM contract module.
// What:  Central provider/model identifiers and allowlists for transformation presets.
// Why:   Replace the Google-only singleton contract with one shared catalog that
//        future renderer and main-process provider work can build on.

import * as v from 'valibot'

export const LLM_PROVIDER_IDS = ['google', 'ollama', 'openai-subscription'] as const
export type LlmProvider = (typeof LLM_PROVIDER_IDS)[number]
export const LlmProviderSchema = v.picklist([...LLM_PROVIDER_IDS])

export const LLM_MODEL_IDS = [
  'gemini-2.5-flash',
  'qwen3.5:2b',
  'qwen3.5:4b',
  'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b',
  'gpt-5.4-mini'
] as const
export type LlmModel = (typeof LLM_MODEL_IDS)[number]
export const LlmModelSchema = v.picklist([...LLM_MODEL_IDS])

export const LLM_MODEL_ALLOWLIST: Record<LlmProvider, readonly LlmModel[]> = {
  google: ['gemini-2.5-flash'],
  ollama: [
    'qwen3.5:2b',
    'qwen3.5:4b',
    'sorc/qwen3.5-instruct:0.8b',
    'sorc/qwen3.5-instruct-uncensored:2b'
  ],
  'openai-subscription': ['gpt-5.4-mini']
}

// Current executable transformation support remains narrower than the full
// catalog. Later tickets can widen this subset once renderer and runtime
// paths are ready for each provider.
export const IMPLEMENTED_TRANSFORM_PROVIDER_IDS = ['google'] as const
export type ImplementedTransformProvider = (typeof IMPLEMENTED_TRANSFORM_PROVIDER_IDS)[number]
export const ImplementedTransformProviderSchema = v.picklist([...IMPLEMENTED_TRANSFORM_PROVIDER_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_IDS = ['gemini-2.5-flash'] as const
export type ImplementedTransformModel = (typeof IMPLEMENTED_TRANSFORM_MODEL_IDS)[number]
export const ImplementedTransformModelSchema = v.picklist([...IMPLEMENTED_TRANSFORM_MODEL_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST: Record<
  ImplementedTransformProvider,
  readonly ImplementedTransformModel[]
> = {
  google: ['gemini-2.5-flash']
}
