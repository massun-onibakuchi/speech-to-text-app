import { TRANSFORM_MODEL_ALLOWLIST } from '../../shared/domain'
import type { TransformationInput, TransformationResult } from './transformation/types'
import {
  createDefaultTransformationAdapterRegistry,
  type TransformationAdapterRegistry
} from './transformation/provider-registry'

export class TransformationService {
  private readonly adapters: TransformationAdapterRegistry

  constructor(adapters?: TransformationAdapterRegistry) {
    this.adapters = adapters ?? createDefaultTransformationAdapterRegistry()
  }

  async transform(input: TransformationInput): Promise<TransformationResult> {
    const allowedModels = TRANSFORM_MODEL_ALLOWLIST[input.provider]
    if (!allowedModels) {
      throw new Error(`Unsupported LLM provider: ${input.provider}`)
    }
    if (!allowedModels.includes(input.model)) {
      throw new Error(`Unsupported LLM model ${input.model} for provider ${input.provider}`)
    }

    const adapter = this.adapters[input.provider]
    if (!adapter) {
      throw new Error(`No transformation adapter registered for provider ${input.provider}`)
    }

    return adapter.transform(input)
  }
}
