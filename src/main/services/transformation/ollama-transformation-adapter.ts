// Where: src/main/services/transformation/ollama-transformation-adapter.ts
// What:  Transformation adapter that routes the shared prompt contract through
//        the local Ollama runtime with structured JSON output.
// Why:   Lets curated Ollama models participate in the same provider registry
//        and transformation pipeline as hosted LLM providers.

import { LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS } from '../local-llm/config'
import { OllamaLocalLlmRuntime } from '../local-llm/ollama-local-llm-runtime'
import type { LocalLlmModelId } from '../../../shared/local-llm'
import type { TransformationAdapter, TransformationInput, TransformationResult } from './types'

export class OllamaTransformationAdapter implements TransformationAdapter {
  private readonly runtime: Pick<OllamaLocalLlmRuntime, 'transform'>

  constructor(runtime?: Pick<OllamaLocalLlmRuntime, 'transform'>) {
    this.runtime = runtime ?? new OllamaLocalLlmRuntime()
  }

  async transform(input: TransformationInput): Promise<TransformationResult> {
    const model = input.model as LocalLlmModelId
    const result = await this.runtime.transform(
      {
        text: input.text,
        systemPrompt: input.prompt.systemPrompt,
        userPrompt: input.prompt.userPrompt,
        timeoutMs: LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS
      },
      model
    )

    return {
      text: result.transformedText,
      provider: 'ollama',
      model
    }
  }
}
