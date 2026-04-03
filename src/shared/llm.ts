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
  'gpt-5.4-mini'
] as const
export type LlmModel = (typeof LLM_MODEL_IDS)[number]
export const LlmModelSchema = v.picklist([...LLM_MODEL_IDS])

export const LLM_MODEL_ALLOWLIST: Record<LlmProvider, readonly LlmModel[]> = {
  google: ['gemini-2.5-flash'],
  ollama: [
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
    'sorc/qwen3.5-instruct-uncensored:2b'
  ],
  'openai-subscription': ['gpt-5.4-mini']
}

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: 'Google',
  ollama: 'Ollama',
  'openai-subscription': 'OpenAI Subscription'
}

export const LLM_MODEL_LABELS: Record<LlmModel, string> = {
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'qwen3.5:2b': 'qwen3.5:2b',
  'qwen3.5:4b': 'qwen3.5:4b',
  'mitmul/plamo-2-translate': 'mitmul/plamo-2-translate',
  'mitmul/plamo-2-translate:Q2_K': 'mitmul/plamo-2-translate:Q2_K',
  'mitmul/plamo-2-translate:Q3_K_M': 'mitmul/plamo-2-translate:Q3_K_M',
  'mitmul/plamo-2-translate:Q4_K_M': 'mitmul/plamo-2-translate:Q4_K_M',
  'mitmul/plamo-2-translate:IQ2_M': 'mitmul/plamo-2-translate:IQ2_M',
  'mitmul/plamo-2-translate:IQ2_S': 'mitmul/plamo-2-translate:IQ2_S',
  'mitmul/plamo-2-translate:IQ2_XS': 'mitmul/plamo-2-translate:IQ2_XS',
  'mitmul/plamo-2-translate:IQ2_XXS': 'mitmul/plamo-2-translate:IQ2_XXS',
  'sorc/qwen3.5-instruct:0.8b': 'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b': 'sorc/qwen3.5-instruct-uncensored:2b',
  'gpt-5.4-mini': 'gpt-5.4-mini'
}

// Current executable transformation support now covers all user-selectable LLM
// providers in the unified transformation flow.
export const IMPLEMENTED_TRANSFORM_PROVIDER_IDS = ['google', 'ollama', 'openai-subscription'] as const
export type ImplementedTransformProvider = (typeof IMPLEMENTED_TRANSFORM_PROVIDER_IDS)[number]
export const ImplementedTransformProviderSchema = v.picklist([...IMPLEMENTED_TRANSFORM_PROVIDER_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_IDS = [
  'gemini-2.5-flash',
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
  'gpt-5.4-mini'
] as const
export type ImplementedTransformModel = (typeof IMPLEMENTED_TRANSFORM_MODEL_IDS)[number]
export const ImplementedTransformModelSchema = v.picklist([...IMPLEMENTED_TRANSFORM_MODEL_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST: Record<
  ImplementedTransformProvider,
  readonly ImplementedTransformModel[]
> = {
  google: ['gemini-2.5-flash'],
  ollama: [
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
    'sorc/qwen3.5-instruct-uncensored:2b'
  ],
  'openai-subscription': ['gpt-5.4-mini']
}
