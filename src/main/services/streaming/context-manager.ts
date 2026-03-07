/*
Where: src/main/services/streaming/context-manager.ts
What: In-memory builder for versioned transformed-stream context payloads.
Why: PR-9 turns the approved `window + rolling summary` strategy into a concrete,
     deterministic contract without implementing the execution lane yet.
*/

import type { StreamingLanguage } from '../../../shared/domain'
import type {
  TransformationContextPayload,
  TransformationContextSegment,
  TransformationContextSummary
} from '../transformation/types'
import {
  applyTransformationContextBudget,
  type TransformationContextBudgetConfig
} from './context-budget'
import {
  shouldRefreshRollingSummary,
  type RollingSummaryRefreshPolicy
} from './summary-refresh-policy'

export interface ContextManagerConfig {
  sessionId: string
  language: StreamingLanguage
  budget: TransformationContextBudgetConfig
  summaryRefreshPolicy: RollingSummaryRefreshPolicy
}

export class ContextManager {
  private readonly sessionId: string
  private readonly language: StreamingLanguage
  private readonly budget: TransformationContextBudgetConfig
  private readonly summaryRefreshPolicy: RollingSummaryRefreshPolicy
  private readonly finalizedSegments: TransformationContextSegment[] = []
  private rollingSummary: TransformationContextSummary = {
    text: '',
    refreshedAt: null,
    sourceThroughSequence: null
  }

  constructor(config: ContextManagerConfig) {
    this.sessionId = config.sessionId
    this.language = config.language
    this.budget = config.budget
    this.summaryRefreshPolicy = config.summaryRefreshPolicy
  }

  appendFinalizedSegment(segment: TransformationContextSegment): void {
    const lastSequence = this.finalizedSegments.at(-1)?.sequence
    if (lastSequence !== undefined && segment.sequence <= lastSequence) {
      throw new Error(`Finalized segments must be appended in strict source order. Received ${segment.sequence} after ${lastSequence}.`)
    }
    this.finalizedSegments.push(segment)
  }

  replaceRollingSummary(summary: TransformationContextSummary): void {
    this.rollingSummary = { ...summary }
  }

  buildPayloadForSequence(sequence: number): TransformationContextPayload {
    const currentSegment = this.finalizedSegments.find((segment) => segment.sequence === sequence)
    if (!currentSegment) {
      throw new Error(`Cannot build transformation context for unknown sequence ${sequence}.`)
    }

    const recentWindow = this.finalizedSegments
      .filter((segment) => segment.sequence < sequence)
      .slice(-this.budget.maxWindowSegments)

    return applyTransformationContextBudget({
      version: 'v1',
      metadata: {
        sessionId: this.sessionId,
        language: this.language,
        currentSequence: sequence
      },
      currentSegment,
      recentWindow,
      rollingSummary: this.rollingSummary
    }, this.budget)
  }

  shouldRefreshSummary(nowIso: string): boolean {
    return shouldRefreshRollingSummary({
      latestCommittedSequence: this.finalizedSegments.at(-1)?.sequence ?? null,
      rollingSummary: this.rollingSummary,
      nowIso
    }, this.summaryRefreshPolicy)
  }
}
