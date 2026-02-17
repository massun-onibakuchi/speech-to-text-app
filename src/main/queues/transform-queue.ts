// src/main/queues/transform-queue.ts
// Independent FIFO queue for standalone transformation jobs.
// Runs independently from the capture queue.
// Internally serial to avoid clipboard contention during output.
// Wired to the production path in Phase 2A.

import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'

export interface TransformResult {
  readonly status: 'ok' | 'error'
  readonly message: string
}

/** Processes one transformation snapshot and returns the result. */
export type TransformProcessor = (
  snapshot: Readonly<TransformationRequestSnapshot>
) => Promise<TransformResult>

export interface TransformQueueEntry {
  readonly snapshot: Readonly<TransformationRequestSnapshot>
  readonly enqueuedAt: string
}

/** Optional callback invoked after each job completes (success or failure). */
export type TransformResultCallback = (result: TransformResult) => void

export class TransformQueue {
  private readonly processor: TransformProcessor
  private readonly onResult?: TransformResultCallback
  private readonly pending: TransformQueueEntry[] = []
  private isProcessing = false

  constructor(options: { processor: TransformProcessor; onResult?: TransformResultCallback }) {
    this.processor = options.processor
    this.onResult = options.onResult
  }

  enqueue(snapshot: Readonly<TransformationRequestSnapshot>): void {
    this.pending.push({
      snapshot,
      enqueuedAt: new Date().toISOString()
    })
    void this.drain()
  }

  getPendingCount(): number {
    return this.pending.length
  }

  private async drain(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true
    try {
      while (this.pending.length > 0) {
        const entry = this.pending.shift()
        if (!entry) continue
        try {
          const result = await this.processor(entry.snapshot)
          this.onResult?.(result)
        } catch {
          // Processor handles its own errors.
          // Queue continues to next entry regardless.
          this.onResult?.({ status: 'error', message: 'Unexpected transform queue error.' })
        }
      }
    } finally {
      this.isProcessing = false
    }
  }
}
