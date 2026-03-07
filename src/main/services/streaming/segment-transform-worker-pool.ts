/**
 * Where: src/main/services/streaming/segment-transform-worker-pool.ts
 * What:  Bounded-concurrency executor for finalized streaming segment transforms.
 * Why:   Keep transform parallelism explicit and testable without coupling queue
 *        mechanics to the session controller or provider runtimes.
 */

import type { StreamingTransformResult, StreamingTransformTask } from './types'

export interface SegmentTransformWorkerPoolDependencies {
  maxInFlight: number
  worker: (task: StreamingTransformTask) => Promise<StreamingTransformResult>
}

interface PendingTask {
  task: StreamingTransformTask
  resolve: (result: StreamingTransformResult) => void
  reject: (error: unknown) => void
}

export class SegmentTransformWorkerPool {
  private readonly maxInFlight: number
  private readonly worker: (task: StreamingTransformTask) => Promise<StreamingTransformResult>
  private readonly queue: PendingTask[] = []
  private activeCount = 0
  private closed = false

  constructor(dependencies: SegmentTransformWorkerPoolDependencies) {
    this.maxInFlight = dependencies.maxInFlight
    this.worker = dependencies.worker
  }

  submit(task: StreamingTransformTask): Promise<StreamingTransformResult> {
    if (this.closed) {
      return Promise.reject(new Error('Segment transform worker pool is closed.'))
    }

    return new Promise<StreamingTransformResult>((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.pump()
    })
  }

  close(): void {
    this.closed = true
    while (this.queue.length > 0) {
      const pending = this.queue.shift()!
      pending.reject(new Error('Segment transform worker pool is closed.'))
    }
  }

  private pump(): void {
    while (!this.closed && this.activeCount < this.maxInFlight && this.queue.length > 0) {
      const next = this.queue.shift()!
      this.activeCount += 1
      void this.run(next)
    }
  }

  private async run(pending: PendingTask): Promise<void> {
    try {
      pending.resolve(await this.worker(pending.task))
    } catch (error) {
      pending.reject(error)
    } finally {
      this.activeCount -= 1
      this.pump()
    }
  }
}
