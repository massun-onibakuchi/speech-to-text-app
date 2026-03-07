/*
Where: src/main/services/streaming/context-budget.test.ts
What: Focused tests for transformed-stream payload truncation rules.
Why: PR-9 must prove exact truncation ordering before `stream_transformed` can be enabled.
*/

import { describe, expect, it } from 'vitest'
import {
  applyTransformationContextBudget,
  estimateTransformationContextUtf8Bytes
} from './context-budget'

const basePayload = {
  version: 'v1' as const,
  metadata: {
    sessionId: 'session-1',
    language: 'en' as const,
    currentSequence: 4
  },
  currentSegment: {
    sequence: 4,
    text: 'current segment is always retained',
    startedAt: '2026-03-07T00:00:04.000Z',
    endedAt: '2026-03-07T00:00:05.000Z'
  },
  recentWindow: [
    {
      sequence: 1,
      text: 'oldest window segment',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    },
    {
      sequence: 2,
      text: 'middle window segment',
      startedAt: '2026-03-07T00:00:02.000Z',
      endedAt: '2026-03-07T00:00:03.000Z'
    },
    {
      sequence: 3,
      text: 'newest window segment',
      startedAt: '2026-03-07T00:00:03.000Z',
      endedAt: '2026-03-07T00:00:04.000Z'
    }
  ],
  rollingSummary: {
    text: 'summary text that can be trimmed before the recent window is reduced',
    refreshedAt: '2026-03-07T00:00:03.500Z',
    sourceThroughSequence: 0
  }
}

describe('applyTransformationContextBudget', () => {
  it('caps the window length before total-byte truncation runs', () => {
    const budgeted = applyTransformationContextBudget(basePayload, {
      maxTotalUtf8Bytes: 500,
      maxRollingSummaryUtf8Bytes: 200,
      maxWindowSegments: 2
    })

    expect(budgeted.recentWindow.map((segment) => segment.sequence)).toEqual([2, 3])
  })

  it('trims rolling summary before dropping recent window segments', () => {
    const budgeted = applyTransformationContextBudget(basePayload, {
      maxTotalUtf8Bytes: 95,
      maxRollingSummaryUtf8Bytes: 20,
      maxWindowSegments: 3
    })

    expect(budgeted.rollingSummary.text.length).toBeLessThan(basePayload.rollingSummary.text.length)
    expect(budgeted.recentWindow.map((segment) => segment.sequence)).toEqual([2, 3])
    expect(estimateTransformationContextUtf8Bytes(budgeted)).toBeLessThanOrEqual(120)
  })

  it('keeps the current segment even when the total budget is smaller than the raw payload', () => {
    const budgeted = applyTransformationContextBudget(basePayload, {
      maxTotalUtf8Bytes: 20,
      maxRollingSummaryUtf8Bytes: 0,
      maxWindowSegments: 0
    })

    expect(budgeted.currentSegment.text).toBe(basePayload.currentSegment.text)
    expect(budgeted.recentWindow).toEqual([])
    expect(budgeted.rollingSummary.text).toBe('')
  })
})
