// Where: src/main/orchestrators/transformation-execution.ts
// What:  Shared helper for executing one LLM transformation attempt.
// Why:   Capture and standalone transform pipelines must enforce the same
//        prompt-safety, preflight, empty-result, and adapter-error rules.

import type { FailureCategory, TransformModel, TransformProvider } from '../../shared/domain'
import type { LlmProviderStatusSnapshot } from '../../shared/ipc'
import { validateSafeUserPromptTemplate } from '../../shared/prompt-template-safety'
import type { SecretStore } from '../services/secret-store'
import type { TransformationService } from '../services/transformation-service'
import type { OpenAiSubscriptionAuthService } from '../services/openai-subscription-auth-service'
import { logStructured } from '../../shared/error-logging'
import { checkLlmPreflight, classifyAdapterError } from './preflight-guard'
import { hasUsableTransformText } from './usable-transform-text'

interface TransformationExecutionParams {
  secretStore: Pick<SecretStore, 'getApiKey'>
  transformationService: Pick<TransformationService, 'transform'>
  llmProviderReadinessService?: {
    getSnapshot: () => Promise<LlmProviderStatusSnapshot>
  }
  openAiSubscriptionAuthService?: Pick<OpenAiSubscriptionAuthService, 'getCredential'>
  text: string
  provider: TransformProvider
  model: TransformModel
  baseUrlOverride: string | null
  systemPrompt: string
  userPrompt: string
  logEvent: string
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

  const providerReadinessFailure = await resolveProviderReadinessFailure(params)
  if (providerReadinessFailure) {
    return {
      ok: false,
      failureDetail: providerReadinessFailure,
      failureCategory: 'preflight'
    }
  }

  try {
    const credential = await resolveTransformationCredential(params, preflight.apiKey)
    const result = await params.transformationService.transform({
      text: params.text,
      provider: params.provider,
      credential,
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
        model: params.model
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

const resolveProviderReadinessFailure = async (
  params: Pick<TransformationExecutionParams, 'llmProviderReadinessService' | 'provider' | 'model'>
): Promise<string | null> => {
  if (!params.llmProviderReadinessService) {
    return null
  }

  const snapshot = await params.llmProviderReadinessService.getSnapshot()
  const providerStatus = snapshot[params.provider]
  if (!providerStatus || providerStatus.status.kind !== 'ready') {
    return providerStatus?.status.message ?? `Provider ${params.provider} is not ready.`
  }

  const selectedModel = providerStatus.models.find((model) => model.id === params.model)
  if (!selectedModel?.available) {
    if (params.provider === 'ollama') {
      return `Selected Ollama model ${params.model} is not installed. Install it in Ollama or choose an available model.`
    }
    return `Selected ${params.provider} model ${params.model} is not available.`
  }

  return null
}

const resolveTransformationCredential = async (
  params: Pick<TransformationExecutionParams, 'provider' | 'openAiSubscriptionAuthService'>,
  apiKey: string
): Promise<
  | { kind: 'api_key'; value: string }
  | { kind: 'oauth'; accessToken: string; accountId: string | null }
  | { kind: 'local' }
> => {
  if (params.provider === 'ollama') {
    return { kind: 'local' }
  }

  if (params.provider === 'openai-subscription') {
    const credential = await params.openAiSubscriptionAuthService?.getCredential()
    if (!credential) {
      throw new Error('Browser sign-in is required before ChatGPT subscription models can be used.')
    }
    return {
      kind: 'oauth',
      accessToken: credential.accessToken,
      accountId: credential.accountId
    }
  }

  return { kind: 'api_key', value: apiKey }
}
