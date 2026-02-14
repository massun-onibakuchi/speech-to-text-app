import type { TransformModel } from '../../../shared/domain'

export interface TransformationInput {
  text: string
  apiKey: string
  model: TransformModel
}

export interface TransformationResult {
  text: string
  model: TransformModel
}

export interface TransformationAdapter {
  transform: (input: TransformationInput) => Promise<TransformationResult>
}
