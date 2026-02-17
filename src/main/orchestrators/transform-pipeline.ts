// Where: src/main/orchestrators/transform-pipeline.ts
// What:  Factory that creates a TransformProcessor for the TransformQueue.
// Why:   Phase 2A replaces TransformationOrchestrator with a snapshot-driven
//        pipeline for standalone transformation shortcut requests.
//        Stages: Transform → Output.

import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'
import type { TransformProcessor, TransformResult } from '../queues/transform-queue'
import type { SecretStore } from '../services/secret-store'
import type { TransformationService } from '../services/transformation-service'
import type { OutputService } from '../services/output-service'

export interface TransformPipelineDeps {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  outputService: Pick<OutputService, 'applyOutput'>
}

/**
 * Creates a TransformProcessor that runs the standalone transformation pipeline:
 * 1. Transform source text via LLM adapter
 * 2. Apply output (copy/paste per output rule)
 */
export function createTransformProcessor(deps: TransformPipelineDeps): TransformProcessor {
  return async (snapshot: Readonly<TransformationRequestSnapshot>): Promise<TransformResult> => {
    // --- Stage 1: Transformation ---
    const apiKey = deps.secretStore.getApiKey(snapshot.provider)
    if (!apiKey) {
      return { status: 'error', message: `Missing ${snapshot.provider} API key.` }
    }

    let transformedText: string
    try {
      const result = await deps.transformationService.transform({
        text: snapshot.sourceText,
        apiKey,
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
      return { status: 'error', message: `Transformation failed: ${detail}` }
    }

    // --- Stage 2: Output ---
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
