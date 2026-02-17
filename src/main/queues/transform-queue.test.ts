// src/main/queues/transform-queue.test.ts
// Tests for TransformQueue lane: FIFO ordering, serial processing, error resilience.

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

  it('processes multiple snapshots in FIFO order', async () => {
    const order: string[] = []
    const processor = vi.fn(async (snap: any) => {
      order.push(snap.snapshotId)
      return ok()
    })
    const queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'first' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'second' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'third' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(3))
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('continues processing after processor error', async () => {
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

  it('reports correct pending count', () => {
    const processor = vi.fn(() => new Promise<TransformResult>(() => {}))
    const queue = new TransformQueue({ processor })

    expect(queue.getPendingCount()).toBe(0)

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'a' }))
    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'b' }))

    // First item shifted out for processing, second stays pending
    expect(queue.getPendingCount()).toBe(1)
  })

  it('drains to zero pending after all items complete', async () => {
    const processor = vi.fn(async () => ok())
    const queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'x' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1))
    expect(queue.getPendingCount()).toBe(0)
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

  it('handles re-entrancy: enqueue during processing drains new item', async () => {
    const order: string[] = []
    let queue: TransformQueue
    const processor = vi.fn(async (snap: any) => {
      order.push(snap.snapshotId)
      if (snap.snapshotId === 'first') {
        queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'reentrant' }))
      }
      return ok()
    })
    queue = new TransformQueue({ processor })

    queue.enqueue(buildTransformationRequestSnapshot({ snapshotId: 'first' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(2))
    expect(order).toEqual(['first', 'reentrant'])
  })
})
