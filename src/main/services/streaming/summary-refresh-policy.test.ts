/*
Where: src/main/services/streaming/summary-refresh-policy.test.ts
What: Tests for rolling summary refresh rules.
Why: PR-9 must document and prove when a transformed-stream summary should be rebuilt.
*/

import { describe, expect, it } from 'vitest'
import { shouldRefreshRollingSummary } from './summary-refresh-policy'

const policy = {
  minSegmentsBeforeFirstSummary: 3,
  maxSegmentsSinceRefresh: 4,
  maxMillisecondsSinceRefresh: 60_000
}

describe('shouldRefreshRollingSummary', () => {
  it('requests the first summary only after the minimum committed segment count is reached', () => {
    expect(
      shouldRefreshRollingSummary({
        latestCommittedSequence: 1,
        nowIso: '2026-03-07T00:01:00.000Z',
        rollingSummary: {
          text: '',
          refreshedAt: null,
          sourceThroughSequence: null
        }
      }, policy)
    ).toBe(false)

    expect(
      shouldRefreshRollingSummary({
        latestCommittedSequence: 2,
        nowIso: '2026-03-07T00:01:00.000Z',
        rollingSummary: {
          text: '',
          refreshedAt: null,
          sourceThroughSequence: null
        }
      }, policy)
    ).toBe(true)
  })

  it('refreshes when too many new segments have accumulated since the last summary', () => {
    expect(
      shouldRefreshRollingSummary({
        latestCommittedSequence: 9,
        nowIso: '2026-03-07T00:01:00.000Z',
        rollingSummary: {
          text: 'summary',
          refreshedAt: '2026-03-07T00:00:30.000Z',
          sourceThroughSequence: 5
        }
      }, policy)
    ).toBe(true)
  })

  it('refreshes on age only when new source segments exist beyond the summary coverage', () => {
    expect(
      shouldRefreshRollingSummary({
        latestCommittedSequence: 5,
        nowIso: '2026-03-07T00:02:00.000Z',
        rollingSummary: {
          text: 'summary',
          refreshedAt: '2026-03-07T00:00:00.000Z',
          sourceThroughSequence: 5
        }
      }, policy)
    ).toBe(false)

    expect(
      shouldRefreshRollingSummary({
        latestCommittedSequence: 6,
        nowIso: '2026-03-07T00:02:00.000Z',
        rollingSummary: {
          text: 'summary',
          refreshedAt: '2026-03-07T00:00:00.000Z',
          sourceThroughSequence: 5
        }
      }, policy)
    ).toBe(true)
  })
})
