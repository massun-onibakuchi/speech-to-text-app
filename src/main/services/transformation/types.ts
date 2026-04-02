import type { TransformModel, TransformProvider } from '../../../shared/domain'

export interface TransformationPromptInput {
  systemPrompt: string
  userPrompt: string
}

export interface TransformationInput {
  text: string
  provider: TransformProvider
  credential:
    | { kind: 'api_key'; value: string }
    | { kind: 'cli' }
    | { kind: 'oauth'; accessToken: string; accountId: string | null }
    | { kind: 'local' }
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
