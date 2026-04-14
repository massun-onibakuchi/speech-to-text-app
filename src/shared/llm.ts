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
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-mini'
] as const
export type KnownLlmModel = (typeof LLM_MODEL_IDS)[number]
export type LlmModel = string
export const LlmModelSchema = v.pipe(v.string(), v.minLength(1))

export const LLM_MODEL_ALLOWLIST: Record<LlmProvider, readonly string[]> = {
  google: ['gemini-2.5-flash'],
  ollama: [],
  'openai-subscription': ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-mini']
}

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: 'Google',
  ollama: 'Ollama',
  'openai-subscription': 'Codex CLI'
}

const LLM_MODEL_LABEL_OVERRIDES: Record<KnownLlmModel, string> = {
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5.2-codex': 'gpt-5.2-codex',
  'gpt-5.2': 'gpt-5.2',
  'gpt-5.1-codex-mini': 'gpt-5.1-codex-mini'
}

export const getLlmModelLabel = (model: string): string =>
  LLM_MODEL_LABEL_OVERRIDES[model as KnownLlmModel] ?? model

const KNOWN_HOSTED_LLM_MODELS = new Set<string>([
  ...LLM_MODEL_ALLOWLIST.google,
  ...LLM_MODEL_ALLOWLIST['openai-subscription']
])

export const isAllowedLlmModel = (provider: LlmProvider, model: string): boolean => {
  if (provider === 'ollama') {
    return model.trim().length > 0 && !KNOWN_HOSTED_LLM_MODELS.has(model)
  }

  return LLM_MODEL_ALLOWLIST[provider].includes(model)
}

// Current executable transformation support now covers all user-selectable LLM
// providers in the unified transformation flow.
export const IMPLEMENTED_TRANSFORM_PROVIDER_IDS = ['google', 'ollama', 'openai-subscription'] as const
export type ImplementedTransformProvider = (typeof IMPLEMENTED_TRANSFORM_PROVIDER_IDS)[number]
export const ImplementedTransformProviderSchema = v.picklist([...IMPLEMENTED_TRANSFORM_PROVIDER_IDS])

export const IMPLEMENTED_TRANSFORM_MODEL_IDS = [
  'gemini-2.5-flash',
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-mini'
] as const
export type KnownImplementedTransformModel = (typeof IMPLEMENTED_TRANSFORM_MODEL_IDS)[number]
export type ImplementedTransformModel = string
export const ImplementedTransformModelSchema = v.pipe(v.string(), v.minLength(1))

export const IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST: Record<
  ImplementedTransformProvider,
  readonly string[]
> = {
  google: ['gemini-2.5-flash'],
  ollama: [],
  'openai-subscription': ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-mini']
}

const KNOWN_HOSTED_IMPLEMENTED_TRANSFORM_MODELS = new Set<string>([
  ...IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST.google,
  ...IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST['openai-subscription']
])

export const isAllowedImplementedTransformModel = (
  provider: ImplementedTransformProvider,
  model: string
): boolean => {
  if (provider === 'ollama') {
    return model.trim().length > 0 && !KNOWN_HOSTED_IMPLEMENTED_TRANSFORM_MODELS.has(model)
  }

  return IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST[provider].includes(model)
}
