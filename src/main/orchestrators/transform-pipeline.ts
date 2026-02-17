// Where: src/main/orchestrators/transform-pipeline.ts
// What:  Factory that creates a TransformProcessor for the TransformQueue.
// Why:   Phase 2A pipeline with Phase 2B preflight guards and error classification.
//        Stages: Preflight → Transform → Output.
//        Pre-network vs post-network failures typed via FailureCategory (spec 5.2).

import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'
import type { TransformProcessor, TransformResult } from '../queues/transform-queue'
import type { SecretStore } from '../services/secret-store'
import type { TransformationService } from '../services/transformation-service'
import type { OutputService } from '../services/output-service'
import { checkLlmPreflight, classifyAdapterError } from './preflight-guard'

export interface TransformPipelineDeps {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
}

/**
 * Creates a TransformProcessor that runs the standalone transformation pipeline:
 * 1. Preflight check (API key present)
 * 2. Transform source text via LLM adapter
 * 3. Apply output (copy/paste per output rule)
 */
export function createTransformProcessor(deps: TransformPipelineDeps): TransformProcessor {
  return async (snapshot: Readonly<TransformationRequestSnapshot>): Promise<TransformResult> => {
    // --- Preflight: check API key before network call ---
    const preflight = checkLlmPreflight(deps.secretStore, snapshot.provider)
    if (!preflight.ok) {
      return { status: 'error', message: preflight.reason, failureCategory: 'preflight' }
    }

    // --- Stage 1: Transformation ---
    let transformedText: string
    try {
      const result = await deps.transformationService.transform({
        text: snapshot.sourceText,
        apiKey: preflight.apiKey,
        model: snapshot.model,
        prompt: {
          systemPrompt: snapshot.systemPrompt,
          userPrompt: snapshot.userPrompt
        }
      })
      transformedText = result.text
    } catch (error) {
      const detail = error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : 'Unknown error'
      return {
        status: 'error',
        message: `Transformation failed: ${detail}`,
        failureCategory: classifyAdapterError(error)
      }
    }

    // --- Stage 2: Output ---
    // Output failures intentionally omit failureCategory — they are not
    // adapter or preflight errors, so the pre-network/post-network distinction
    // does not apply.
    try {
      const outputStatus = await deps.outputService.applyOutput(transformedText, snapshot.outputRule)
      if (outputStatus === 'output_failed_partial') {
        return { status: 'error', message: 'Transformation succeeded but output application partially failed.' }
      }
    } catch {
      return { status: 'error', message: 'Transformation succeeded but output application failed.' }
    }

    return { status: 'ok', message: transformedText }
  }
}
