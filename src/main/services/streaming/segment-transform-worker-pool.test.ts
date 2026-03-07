/**
 * Where: src/main/services/streaming/segment-transform-worker-pool.test.ts
 * What:  Unit tests for bounded transform worker concurrency.
 * Why:   PR-10 must prove transformed streaming cannot exceed the configured
 *        in-flight segment transform limit.
 */

import { describe, expect, it } from 'vitest'
import { SegmentTransformWorkerPool } from './segment-transform-worker-pool'

const PROFILE = {
  profileId: 'default',
  provider: 'google' as const,
  model: 'gemini-2.5-flash' as const,
  baseUrlOverride: null,
  systemPrompt: 'system',
  userPrompt: '<input_text>{{text}}</input_text>'
}

const createTask = (sequence: number) => ({
  segment: {
    sessionId: 'session-1',
    sequence,
    sourceText: `segment-${sequence}`,
    delimiter: ' ',
    startedAt: `2026-03-07T00:00:0${sequence}.000Z`,
    endedAt: `2026-03-07T00:00:0${sequence + 1}.000Z`
  },
  profile: PROFILE,
  contextPayload: {
    version: 'v1' as const,
    metadata: {
      sessionId: 'session-1',
      language: 'en' as const,
      currentSequence: sequence
    },
    currentSegment: {
      sequence,
      text: `segment-${sequence}`,
      startedAt: `2026-03-07T00:00:0${sequence}.000Z`,
      endedAt: `2026-03-07T00:00:0${sequence + 1}.000Z`
    },
    recentWindow: [],
    rollingSummary: {
      text: '',
      refreshedAt: null,
      sourceThroughSequence: null
    }
  }
})

describe('SegmentTransformWorkerPool', () => {
  it('limits the number of active workers to maxInFlight', async () => {
    let activeCount = 0
    let maxObserved = 0
    const releaseQueue: Array<() => void> = []
    const pool = new SegmentTransformWorkerPool({
      maxInFlight: 2,
      worker: async (task) => {
        activeCount += 1
        maxObserved = Math.max(maxObserved, activeCount)
        await new Promise<void>((resolve) => {
          releaseQueue.push(resolve)
        })
        activeCount -= 1
        return {
          segment: task.segment,
          committedText: task.segment.sourceText.toUpperCase()
        }
      }
    })

    const first = pool.submit(createTask(0))
    const second = pool.submit(createTask(1))
    const third = pool.submit(createTask(2))

    await Promise.resolve()
    expect(maxObserved).toBe(2)

    releaseQueue.shift()?.()
    releaseQueue.shift()?.()
    await Promise.all([first, second])
    releaseQueue.shift()?.()

    await expect(first).resolves.toMatchObject({ committedText: 'SEGMENT-0' })
    await expect(second).resolves.toMatchObject({ committedText: 'SEGMENT-1' })
    await expect(third).resolves.toMatchObject({ committedText: 'SEGMENT-2' })
    expect(maxObserved).toBe(2)
  })
})
