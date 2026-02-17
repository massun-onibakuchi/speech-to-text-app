// src/main/queues/transform-queue.test.ts
// Tests for TransformQueue: concurrent execution, error resilience, result callback.

import { describe, expect, it, vi } from 'vitest'
import { TransformQueue, type TransformResult } from './transform-queue'
import { buildTransformationRequestSnapshot } from '../test-support/factories'

const ok = (msg = 'done'): TransformResult => ({ status: 'ok', message: msg })

describe('TransformQueue', () => {
  it('processes a single enqueued snapshot', async () => {
    const processor = vi.fn(async () => ok())
    const queue = new TransformQueue({ processor })
    const snapshot = buildTransformationRequestSnapshot({ snapshotId: 'tsnap-1' })

    queue.enqueue(snapshot)

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1))
    expect(processor).toHaveBeenCalledWith(snapshot)
  })

  it('processes multiple snapshots concurrently', async () => {
    const activeCalls: string[] = []
    const completedCalls: string[] = []

    // Each job records when it starts and finishes.
    // A slow first job must NOT block the fast second job.
    const processor = vi.fn(async (snap: any) => {
      activeCalls.push(snap.snapshotId)
      const delayMs = snap.snapshotId === 'slow' ? 50 : 5
      await new Promise((r) => setTimeout(r, delayMs))
      completedCalls.push(snap.snapshotId)
      return ok()
    })
    const queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'slow' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'fast' }))

    // Both should start immediately (concurrent)
    await vi.waitFor(() => expect(activeCalls).toEqual(['slow', 'fast']))

    // Fast finishes before slow
    await vi.waitFor(() => expect(completedCalls).toContain('fast'))
    await vi.waitFor(() => expect(completedCalls).toContain('slow'))
    expect(completedCalls[0]).toBe('fast')
    expect(completedCalls[1]).toBe('slow')
  })

  it('continues processing other jobs when one throws', async () => {
    let callCount = 0
    const processor = vi.fn(async () => {
      callCount++
      if (callCount === 1) throw new Error('transform boom')
      return ok()
    })
    const queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'fail' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'pass' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(2))
  })

  it('tracks active count correctly', async () => {
    let resolveFirst!: () => void
    const firstPromise = new Promise<void>((r) => {
      resolveFirst = r
    })
    const processor = vi.fn(async (snap: any) => {
      if (snap.snapshotId === 'blocking') await firstPromise
      return ok()
    })
    const queue = new TransformQueue({ processor })

    expect(queue.getActiveCount()).toBe(0)

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'blocking' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'quick' }))

    // Both start immediately
    await vi.waitFor(() => expect(queue.getActiveCount()).toBeGreaterThanOrEqual(1))

    // Let blocking job finish
    resolveFirst()
    await vi.waitFor(() => expect(queue.getActiveCount()).toBe(0))
  })

  it('invokes onResult callback with processor result', async () => {
    const onResult = vi.fn()
    const processor = vi.fn(async () => ok('transformed text'))
    const queue = new TransformQueue({ processor, onResult })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'cb-1' }))

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1))
    expect(onResult).toHaveBeenCalledWith({ status: 'ok', message: 'transformed text' })
  })

  it('invokes onResult callback with error on processor throw', async () => {
    const onResult = vi.fn()
    const processor = vi.fn(async () => {
      throw new Error('boom')
    })
    const queue = new TransformQueue({ processor, onResult })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'cb-2' }))

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1))
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('invokes onResult for each concurrent job', async () => {
    const onResult = vi.fn()
    const processor = vi.fn(async () => ok())
    const queue = new TransformQueue({ processor, onResult })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'a' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'b' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'c' }))

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(3))
  })

  it('decrements active count even on error', async () => {
    const processor = vi.fn(async () => {
      throw new Error('fail')
    })
    const queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'err' }))

    await vi.waitFor(() => expect(queue.getActiveCount()).toBe(0))
  })
})
