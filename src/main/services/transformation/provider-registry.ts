// Where: src/main/services/transformation/provider-registry.ts
// What:  Default transformation adapter registry keyed by LLM provider id.
// Why:   Keeps provider dispatch centralized so later provider tickets can
//        register new adapters without rewriting the service seam.

import type { TransformProvider } from '../../../shared/domain'
import { CodexCliService } from '../codex-cli-service'
import { GeminiTransformationAdapter } from './gemini-transformation-adapter'
import { OllamaTransformationAdapter } from './ollama-transformation-adapter'
import { OpenAiSubscriptionTransformationAdapter } from './openai-subscription-transformation-adapter'
import type { TransformationAdapter } from './types'

export type TransformationAdapterRegistry = Partial<Record<TransformProvider, TransformationAdapter>>

export const createDefaultTransformationAdapterRegistry = (
  codexCliService: Pick<CodexCliService, 'runTransformation'> = new CodexCliService()
): TransformationAdapterRegistry => ({
  google: new GeminiTransformationAdapter(),
  ollama: new OllamaTransformationAdapter(),
  'openai-subscription': new OpenAiSubscriptionTransformationAdapter({ codexCliService })
})
