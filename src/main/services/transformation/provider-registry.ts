// Where: src/main/services/transformation/provider-registry.ts
// What:  Default transformation adapter registry keyed by LLM provider id.
// Why:   Keeps provider dispatch centralized so later provider tickets can
//        register new adapters without rewriting the service seam.

import type { TransformProvider } from '../../../shared/domain'
import { GeminiTransformationAdapter } from './gemini-transformation-adapter'
import type { TransformationAdapter } from './types'

export type TransformationAdapterRegistry = Partial<Record<TransformProvider, TransformationAdapter>>

export const createDefaultTransformationAdapterRegistry = (): TransformationAdapterRegistry => ({
  google: new GeminiTransformationAdapter()
})
