import type { TransformModel } from '../../../shared/domain'

export interface TransformationPromptInput {
  systemPrompt: string
  userPrompt: string
}

export interface TransformationContextSegment {
  sequence: number
  text: string
  startedAt: string
  endedAt: string
}

export interface TransformationContextSummary {
  text: string
  refreshedAt: string | null
  sourceThroughSequence: number | null
}

export interface TransformationContextMetadata {
  sessionId: string
  language: 'auto' | 'en' | 'ja'
  currentSequence: number
}

export interface TransformationContextPayloadV1 {
  version: 'v1'
  metadata: TransformationContextMetadata
  currentSegment: TransformationContextSegment
  recentWindow: TransformationContextSegment[]
  rollingSummary: TransformationContextSummary
}

export type TransformationContextPayload = TransformationContextPayloadV1

export interface TransformationInput {
  text: string
  apiKey: string
  model: TransformModel
  baseUrlOverride?: string | null
  prompt: TransformationPromptInput
  contextPayload?: TransformationContextPayload
}

export interface TransformationResult {
  text: string
  model: TransformModel
}

export interface TransformationAdapter {
  transform: (input: TransformationInput) => Promise<TransformationResult>
}
