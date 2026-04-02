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

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: 'Google',
  ollama: 'Ollama',
  'openai-subscription': 'OpenAI Subscription'
}

export const LLM_MODEL_LABELS: Record<LlmModel, string> = {
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'qwen3.5:2b': 'Qwen 3.5 2B',
  'qwen3.5:4b': 'Qwen 3.5 4B',
  'sorc/qwen3.5-instruct:0.8b': 'Sorc Qwen 3.5 Instruct 0.8B',
  'sorc/qwen3.5-instruct-uncensored:2b': 'Sorc Qwen 3.5 Instruct Uncensored 2B',
  'gpt-5.4-mini': 'GPT-5.4 Mini'
}

// Current executable transformation support is intentionally narrower than the
// full future-facing catalog. OpenAI subscription remains pending, while Google
// and Ollama are now wired end to end through the shared transformation path.
export const IMPLEMENTED_TRANSFORM_PROVIDER_IDS = ['google', 'ollama'] as const
export type ImplementedTransformProvider = (typeof IMPLEMENTED_TRANSFORM_PROVIDER_IDS)[number]
export const ImplementedTransformProviderSchema = v.picklist([...IMPLEMENTED_TRANSFORM_PROVIDER_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_IDS = [
  'gemini-2.5-flash',
  'qwen3.5:2b',
  'qwen3.5:4b',
  'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b'
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
    'sorc/qwen3.5-instruct:0.8b',
    'sorc/qwen3.5-instruct-uncensored:2b'
  ]
}
