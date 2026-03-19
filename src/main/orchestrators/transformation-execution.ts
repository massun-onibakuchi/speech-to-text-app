// Where: src/main/orchestrators/transformation-execution.ts
// What:  Shared helper for executing one LLM transformation attempt.
// Why:   Capture and standalone transform pipelines must enforce the same
//        prompt-safety, preflight, empty-result, and adapter-error rules.

import type { FailureCategory, TransformModel, TransformProvider } from '../../shared/domain'
import { validateSafeUserPromptTemplate } from '../../shared/prompt-template-safety'
import type { SecretStore } from '../services/secret-store'
import type { TransformationService } from '../services/transformation-service'
import { logStructured } from '../../shared/error-logging'
import { checkLlmPreflight, classifyAdapterError } from './preflight-guard'
import { hasUsableTransformText } from './usable-transform-text'

interface TransformationExecutionParams {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  text: string
  provider: TransformProvider
  model: TransformModel
  baseUrlOverride: string | null
  systemPrompt: string
  userPrompt: string
  logEvent: string
  logContext?: Record<string, unknown>
  unknownFailureDetail: string
  trimErrorMessage: boolean
}

export type TransformationExecutionResult =
  | { ok: true; text: string }
  | { ok: false; failureDetail: string; failureCategory: FailureCategory }

export async function executeTransformation(
  params: TransformationExecutionParams
): Promise<TransformationExecutionResult> {
  const promptSafetyError = validateSafeUserPromptTemplate(params.userPrompt)
  if (promptSafetyError) {
    return {
      ok: false,
      failureDetail: `Unsafe user prompt template: ${promptSafetyError}`,
      failureCategory: 'preflight'
    }
  }

  const preflight = checkLlmPreflight(params.secretStore, params.provider, params.model)
  if (!preflight.ok) {
    return {
      ok: false,
      failureDetail: preflight.reason,
      failureCategory: 'preflight'
    }
  }

  try {
    const result = await params.transformationService.transform({
      text: params.text,
      apiKey: preflight.apiKey,
      model: params.model,
      baseUrlOverride: params.baseUrlOverride,
      prompt: {
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt
      }
    })
    if (!hasUsableTransformText(result.text)) {
      return {
        ok: false,
        failureDetail: 'Transformation returned empty text.',
        failureCategory: 'unknown'
      }
    }
    return { ok: true, text: result.text }
  } catch (error) {
    logStructured({
      level: 'error',
      scope: 'main',
      event: params.logEvent,
      error,
      context: {
        provider: params.provider,
        model: params.model,
        ...(params.logContext ?? {})
      }
    })
    const failureDetail =
      error instanceof Error
        ? params.trimErrorMessage
          ? error.message.trim() || params.unknownFailureDetail
          : error.message
        : params.unknownFailureDetail
    return {
      ok: false,
      failureDetail,
      failureCategory: classifyAdapterError(error)
    }
  }
}
