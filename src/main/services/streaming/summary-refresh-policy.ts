/*
Where: src/main/services/streaming/summary-refresh-policy.ts
What: Pure refresh decision helper for rolling transformed-stream summaries.
Why: PR-9 needs explicit refresh rules before any worker pool can depend on summary state.
*/

import type { TransformationContextSummary } from '../transformation/types'

export interface RollingSummaryRefreshPolicy {
  minSegmentsBeforeFirstSummary: number
  maxSegmentsSinceRefresh: number
  maxMillisecondsSinceRefresh: number
}

export interface ShouldRefreshRollingSummaryInput {
  latestCommittedSequence: number | null
  rollingSummary: TransformationContextSummary
  nowIso: string
}

export const shouldRefreshRollingSummary = (
  input: ShouldRefreshRollingSummaryInput,
  policy: RollingSummaryRefreshPolicy
): boolean => {
  if (input.latestCommittedSequence === null) {
    return false
  }

  if (input.rollingSummary.sourceThroughSequence === null) {
    return input.latestCommittedSequence + 1 >= policy.minSegmentsBeforeFirstSummary
  }

  if (
    input.latestCommittedSequence - input.rollingSummary.sourceThroughSequence >=
    policy.maxSegmentsSinceRefresh
  ) {
    return true
  }

  if (!input.rollingSummary.refreshedAt) {
    return false
  }

  const elapsedMs = new Date(input.nowIso).getTime() - new Date(input.rollingSummary.refreshedAt).getTime()
  return elapsedMs >= policy.maxMillisecondsSinceRefresh &&
    input.latestCommittedSequence > input.rollingSummary.sourceThroughSequence
}
