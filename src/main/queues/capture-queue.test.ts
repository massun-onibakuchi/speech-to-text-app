// src/main/queues/capture-queue.test.ts
// Tests for CaptureQueue lane: FIFO ordering, serial processing, error resilience.

import { describe, expect, it, vi } from 'vitest'
import { CaptureQueue } from './capture-queue'
import { buildCaptureRequestSnapshot } from '../test-support/factories'
import type { TerminalJobStatus } from '../../shared/domain'

describe('CaptureQueue', () => {
  it('processes a single enqueued snapshot', async () => {
    const processor = vi.fn(async () => 'succeeded' as TerminalJobStatus)
    const queue = new CaptureQueue({ processor })
    const snapshot = buildCaptureRequestSnapshot({ snapshotId: 'snap-1' })

    queue.enqueue(snapshot)

    // Allow microtask drain
    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1))
    expect(processor).toHaveBeenCalledWith(snapshot)
  })

  it('processes multiple snapshots in FIFO order', async () => {
    const order: string[] = []
    const processor = vi.fn(async (snap: any) => {
      order.push(snap.snapshotId)
      return 'succeeded' as TerminalJobStatus
    })
    const queue = new CaptureQueue({ processor })

    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'first' }))
    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'second' }))
    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'third' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(3))
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('continues processing after processor error', async () => {
    let callCount = 0
    const processor = vi.fn(async () => {
      callCount++
      if (callCount === 1) throw new Error('boom')
      return 'succeeded' as TerminalJobStatus
    })
    const queue = new CaptureQueue({ processor })

    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'fail' }))
    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'pass' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(2))
  })

  it('reports correct pending count', () => {
    // Processor that never resolves — keeps items pending
    const processor = vi.fn(() => new Promise<TerminalJobStatus>(() => {}))
    const queue = new CaptureQueue({ processor })

    expect(queue.getPendingCount()).toBe(0)

    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'a' }))
    // First item is being processed (shifted out), second stays pending
    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'b' }))

    expect(queue.getPendingCount()).toBe(1)
  })

  it('drains to zero pending after all items complete', async () => {
    const processor = vi.fn(async () => 'succeeded' as TerminalJobStatus)
    const queue = new CaptureQueue({ processor })

    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'x' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1))
    expect(queue.getPendingCount()).toBe(0)
  })

  it('handles re-entrancy: enqueue during processing drains new item', async () => {
    const order: string[] = []
    let queue: CaptureQueue
    const processor = vi.fn(async (snap: any) => {
      order.push(snap.snapshotId)
      // Re-entrant enqueue during first processing
      if (snap.snapshotId === 'first') {
        queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'reentrant' }))
      }
      return 'succeeded' as TerminalJobStatus
    })
    queue = new CaptureQueue({ processor })

    queue.enqueue(buildCaptureRequestSnapshot({ snapshotId: 'first' }))

    await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(2))
    expect(order).toEqual(['first', 'reentrant'])
  })
})
