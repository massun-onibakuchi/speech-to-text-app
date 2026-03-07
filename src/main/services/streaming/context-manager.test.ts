/*
Where: src/main/services/streaming/context-manager.test.ts
What: Tests for deterministic transformed-stream context payload composition.
Why: PR-9 must prove exact `segment + window + summary` payload behavior before PR-10 uses it.
*/

import { describe, expect, it } from 'vitest'
import { ContextManager } from './context-manager'

const createManager = () =>
  new ContextManager({
    sessionId: 'session-1',
    language: 'en',
    budget: {
      maxTotalUtf8Bytes: 800,
      maxRollingSummaryUtf8Bytes: 200,
      maxWindowSegments: 2
    },
    summaryRefreshPolicy: {
      minSegmentsBeforeFirstSummary: 3,
      maxSegmentsSinceRefresh: 4,
      maxMillisecondsSinceRefresh: 60_000
    }
  })

describe('ContextManager', () => {
  it('builds a v1 payload with current segment, bounded window, and rolling summary', () => {
    const manager = createManager()
    manager.appendFinalizedSegment({
      sequence: 1,
      text: 'alpha',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    })
    manager.appendFinalizedSegment({
      sequence: 2,
      text: 'beta',
      startedAt: '2026-03-07T00:00:02.000Z',
      endedAt: '2026-03-07T00:00:03.000Z'
    })
    manager.appendFinalizedSegment({
      sequence: 3,
      text: 'gamma',
      startedAt: '2026-03-07T00:00:03.000Z',
      endedAt: '2026-03-07T00:00:04.000Z'
    })
    manager.replaceRollingSummary({
      text: 'summary text',
      refreshedAt: '2026-03-07T00:00:03.500Z',
      sourceThroughSequence: 1
    })

    expect(manager.buildPayloadForSequence(3)).toEqual({
      version: 'v1',
      metadata: {
        sessionId: 'session-1',
        language: 'en',
        currentSequence: 3
      },
      currentSegment: {
        sequence: 3,
        text: 'gamma',
        startedAt: '2026-03-07T00:00:03.000Z',
        endedAt: '2026-03-07T00:00:04.000Z'
      },
      recentWindow: [
        {
          sequence: 1,
          text: 'alpha',
          startedAt: '2026-03-07T00:00:01.000Z',
          endedAt: '2026-03-07T00:00:02.000Z'
        },
        {
          sequence: 2,
          text: 'beta',
          startedAt: '2026-03-07T00:00:02.000Z',
          endedAt: '2026-03-07T00:00:03.000Z'
        }
      ],
      rollingSummary: {
        text: 'summary text',
        refreshedAt: '2026-03-07T00:00:03.500Z',
        sourceThroughSequence: 1
      }
    })
  })

  it('throws if a segment is appended out of source order', () => {
    const manager = createManager()
    manager.appendFinalizedSegment({
      sequence: 2,
      text: 'beta',
      startedAt: '2026-03-07T00:00:02.000Z',
      endedAt: '2026-03-07T00:00:03.000Z'
    })

    expect(() =>
      manager.appendFinalizedSegment({
        sequence: 2,
        text: 'duplicate',
        startedAt: '2026-03-07T00:00:02.100Z',
        endedAt: '2026-03-07T00:00:03.100Z'
      })
    ).toThrow('strict source order')
  })

  it('delegates summary refresh decisions to the configured policy against the committed segment log', () => {
    const manager = createManager()
    manager.appendFinalizedSegment({
      sequence: 0,
      text: 'alpha',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
    manager.appendFinalizedSegment({
      sequence: 1,
      text: 'beta',
      startedAt: '2026-03-07T00:00:01.000Z',
      endedAt: '2026-03-07T00:00:02.000Z'
    })
    manager.appendFinalizedSegment({
      sequence: 2,
      text: 'gamma',
      startedAt: '2026-03-07T00:00:02.000Z',
      endedAt: '2026-03-07T00:00:03.000Z'
    })

    expect(manager.shouldRefreshSummary('2026-03-07T00:03:00.000Z')).toBe(true)
  })
})
