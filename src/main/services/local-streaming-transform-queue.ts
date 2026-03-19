// Where: Main process service layer.
// What: Session-scoped bounded queue for local streaming chunk transformation work.
// Why: Ticket 8 needs concurrent chunk transforms without allowing one local session
//      to accumulate an unbounded backlog when finalized chunks arrive faster than
//      the LLM transformation path can drain them.

export interface LocalStreamingTransformQueueSnapshot {
  activeCount: number
  queuedCount: number
  maxConcurrent: number
  maxQueued: number
}

export type LocalStreamingTransformQueueEnqueueResult =
  | {
      accepted: true
      promise: Promise<void>
      snapshot: LocalStreamingTransformQueueSnapshot
    }
  | {
      accepted: false
      promise: Promise<void>
      snapshot: LocalStreamingTransformQueueSnapshot
    }

interface LocalStreamingTransformQueueEntry {
  run: () => Promise<void>
  resolve: () => void
}

export class LocalStreamingTransformQueue {
  private readonly maxConcurrent: number
  private readonly maxQueued: number
  private activeCount = 0
  private cancelled = false
  private readonly queue: LocalStreamingTransformQueueEntry[] = []

  constructor(options: { maxConcurrent: number; maxQueued: number }) {
    this.maxConcurrent = options.maxConcurrent
    this.maxQueued = options.maxQueued
  }

  enqueue(run: () => Promise<void>): LocalStreamingTransformQueueEnqueueResult {
    if (this.cancelled) {
      return {
        accepted: false,
        promise: Promise.resolve(),
        snapshot: this.getSnapshot()
      }
    }

    if (this.activeCount >= this.maxConcurrent && this.queue.length >= this.maxQueued) {
      return {
        accepted: false,
        promise: Promise.resolve(),
        snapshot: this.getSnapshot()
      }
    }

    let resolvePromise: () => void = () => {}
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve
    })

    const entry: LocalStreamingTransformQueueEntry = {
      run,
      resolve: resolvePromise
    }

    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1
      void this.runEntry(entry)
    } else {
      this.queue.push(entry)
    }

    return {
      accepted: true,
      promise,
      snapshot: this.getSnapshot()
    }
  }

  cancel(): void {
    this.cancelled = true
    while (this.queue.length > 0) {
      const entry = this.queue.shift()
      entry?.resolve()
    }
  }

  private async runEntry(entry: LocalStreamingTransformQueueEntry): Promise<void> {
    try {
      if (!this.cancelled) {
        await entry.run()
      }
    } finally {
      entry.resolve()
      this.activeCount = Math.max(0, this.activeCount - 1)
      this.drain()
    }
  }

  private drain(): void {
    while (!this.cancelled && this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextEntry = this.queue.shift()
      if (!nextEntry) {
        return
      }
      this.activeCount += 1
      void this.runEntry(nextEntry)
    }
  }

  private getSnapshot(): LocalStreamingTransformQueueSnapshot {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued
    }
  }
}
