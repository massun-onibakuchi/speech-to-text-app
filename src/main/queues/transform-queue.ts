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

export class TransformQueue {
  private readonly processor: TransformProcessor
  private readonly pending: TransformQueueEntry[] = []
  private isProcessing = false

  constructor(options: { processor: TransformProcessor }) {
    this.processor = options.processor
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
          await this.processor(entry.snapshot)
        } catch {
          // Processor handles its own errors.
          // Queue continues to next entry regardless.
        }
      }
    } finally {
      this.isProcessing = false
    }
  }
}
