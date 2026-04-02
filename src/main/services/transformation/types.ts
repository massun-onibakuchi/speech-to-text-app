import type { TransformModel, TransformProvider } from '../../../shared/domain'

export interface TransformationPromptInput {
  systemPrompt: string
  userPrompt: string
}

export interface TransformationInput {
  text: string
  provider: TransformProvider
  apiKey: string
  model: TransformModel
  baseUrlOverride?: string | null
  prompt: TransformationPromptInput
}

export interface TransformationResult {
  text: string
  provider: TransformProvider
  model: TransformModel
}

export interface TransformationAdapter {
  transform: (input: TransformationInput) => Promise<TransformationResult>
}
