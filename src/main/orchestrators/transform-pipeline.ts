// Where: src/main/orchestrators/transform-pipeline.ts
// What:  Factory that creates a TransformProcessor for the TransformQueue.
// Why:   Phase 2A pipeline with Phase 2B preflight guards and error classification.
//        Stages: Preflight → Transform → Output.
//        Pre-network vs post-network failures typed via FailureCategory (spec 5.2).

import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'
import type { TransformProcessor, TransformResult } from '../queues/transform-queue'
import type { SecretStore } from '../services/secret-store'
import type { LlmProviderReadinessService } from '../services/llm-provider-readiness-service'
import type { TransformationService } from '../services/transformation-service'
import type { OutputService } from '../services/output-service'
import { logStructured } from '../../shared/error-logging'
import { executeTransformation } from './transformation-execution'
import { formatTransformOutputFailureMessage } from './output-failure-formatting'

export interface TransformPipelineDeps {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  llmProviderReadinessService?: Pick<LlmProviderReadinessService, 'getSnapshot'>
  outputService: Pick<OutputService, 'applyOutputWithDetail'>
}

/**
 * Creates a TransformProcessor that runs the standalone transformation pipeline:
 * 1. Preflight check (API key present)
 * 2. Transform source text via LLM adapter
 * 3. Apply output (copy/paste per output rule)
 */
export function createTransformProcessor(deps: TransformPipelineDeps): TransformProcessor {
  return async (snapshot: Readonly<TransformationRequestSnapshot>): Promise<TransformResult> => {
    const transformationResult = await executeTransformation({
      secretStore: deps.secretStore,
      transformationService: deps.transformationService,
      llmProviderReadinessService: deps.llmProviderReadinessService,
      text: snapshot.sourceText,
      provider: snapshot.provider,
      model: snapshot.model,
      baseUrlOverride: snapshot.baseUrlOverride,
      systemPrompt: snapshot.systemPrompt,
      userPrompt: snapshot.userPrompt,
      logEvent: 'transform_pipeline.transformation_failed',
      unknownFailureDetail: 'Unknown error',
      trimErrorMessage: true
    })
    if (!transformationResult.ok) {
      return {
        status: 'error',
        message: formatTransformFailureMessage(
          transformationResult.failureDetail,
          transformationResult.failureCategory
        ),
        failureCategory: transformationResult.failureCategory
      }
    }
    const transformedText = transformationResult.text

    // --- Stage 2: Output ---
    // Output failures intentionally omit failureCategory — they are not
    // adapter or preflight errors, so the pre-network/post-network distinction
    // does not apply.
    try {
      const outputResult = await deps.outputService.applyOutputWithDetail(transformedText, snapshot.outputRule)
      if (outputResult.status === 'output_failed_partial') {
        return {
          status: 'error',
          message: formatTransformOutputFailureMessage(outputResult.message)
        }
      }
    } catch (error) {
      logStructured({
        level: 'error',
        scope: 'main',
        event: 'transform_pipeline.output_failed',
        error
      })
      return { status: 'error', message: 'Transformation succeeded but output application failed.' }
    }

    return { status: 'ok', message: transformedText }
  }
}

function formatTransformFailureMessage(detail: string, failureCategory: TransformResult['failureCategory']): string {
  if (failureCategory === 'preflight') {
    return detail.startsWith('Unsafe user prompt template:')
      ? `Transformation blocked: ${detail}`
      : detail
  }

  return `Transformation failed: ${detail}`
}
