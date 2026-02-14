import { TRANSFORM_MODEL_ALLOWLIST } from '../../shared/domain'
import { GeminiTransformationAdapter } from './transformation/gemini-transformation-adapter'
import type { TransformationAdapter, TransformationInput, TransformationResult } from './transformation/types'

export class TransformationService {
  private readonly adapter: TransformationAdapter

  constructor(adapter?: TransformationAdapter) {
    this.adapter = adapter ?? new GeminiTransformationAdapter()
  }

  async transform(input: TransformationInput): Promise<TransformationResult> {
    const allowedModels = TRANSFORM_MODEL_ALLOWLIST.google
    if (!allowedModels.includes(input.model)) {
      throw new Error(`Model ${input.model} is not allowed for Gemini transformation`)
    }

    return this.adapter.transform(input)
  }
}
