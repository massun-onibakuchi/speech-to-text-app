// Where: Main process service tests.
// What: Verifies the bounded local streaming transform queue enforces concurrency and backlog limits.
// Why: Ticket 8 relies on this queue to keep local transformed streaming responsive under pressure.

import { describe, expect, it, vi } from 'vitest'
import { LocalStreamingTransformQueue } from './local-streaming-transform-queue'

describe('LocalStreamingTransformQueue', () => {
  it('runs work up to the configured concurrency and then queues later work', async () => {
    const queue = new LocalStreamingTransformQueue({ maxConcurrent: 1, maxQueued: 1 })
    let releaseFirst: (() => void) | null = null
    const log: string[] = []

    const first = queue.enqueue(async () => {
      log.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      log.push('first:end')
    })
    const second = queue.enqueue(async () => {
      log.push('second')
    })

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(true)
    expect(log).toEqual(['first:start'])

    if (!releaseFirst) {
      throw new Error('Expected first task to remain pending.')
    }
    const release = releaseFirst as unknown as () => void
    release()

    await first.promise
    await second.promise
    expect(log).toEqual(['first:start', 'first:end', 'second'])
  })

  it('rejects new work when both concurrency and queue capacity are exhausted', async () => {
    const queue = new LocalStreamingTransformQueue({ maxConcurrent: 1, maxQueued: 0 })
    const blocker = vi.fn(async () => {
      await new Promise(() => {})
    })

    const first = queue.enqueue(blocker)
    const second = queue.enqueue(async () => {})

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(false)
  })

  it('resolves queued work immediately on cancel and does not start it later', async () => {
    const queue = new LocalStreamingTransformQueue({ maxConcurrent: 1, maxQueued: 1 })
    let releaseFirst: (() => void) | null = null
    const log: string[] = []

    const first = queue.enqueue(async () => {
      log.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      log.push('first:end')
    })
    const secondRun = vi.fn(async () => {
      log.push('second:start')
    })
    const second = queue.enqueue(secondRun)

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(true)
    expect(log).toEqual(['first:start'])

    let secondSettled = false
    void second.promise.then(() => {
      secondSettled = true
    })

    queue.cancel()

    await vi.waitFor(() => expect(secondSettled).toBe(true))
    expect(secondRun).not.toHaveBeenCalled()

    if (!releaseFirst) {
      throw new Error('Expected first task to remain pending.')
    }
    const release = releaseFirst as unknown as () => void
    release()

    await first.promise
    expect(log).toEqual(['first:start', 'first:end'])
    expect(queue.enqueue(async () => {})).toMatchObject({ accepted: false })
  })
})
