import type { TransformModel } from '../../../shared/domain'

export interface TransformationPromptInput {
  systemPrompt: string
  userPrompt: string
}

export interface TransformationInput {
  text: string
  apiKey: string
  model: TransformModel
  prompt: TransformationPromptInput
}

export interface TransformationResult {
  text: string
  model: TransformModel
}

export interface TransformationAdapter {
  transform: (input: TransformationInput) => Promise<TransformationResult>
}
