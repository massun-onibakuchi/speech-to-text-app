// src/main/queues/capture-queue.ts
// FIFO queue for capture processing jobs.
// Processes one job at a time in enqueue order (serial drain).
// Does not own persistence — that stays with JobQueueService for now.
// Wired to the production path in Phase 2A.

import type { CaptureRequestSnapshot } from '../routing/capture-request-snapshot'
import type { TerminalJobStatus } from '../../shared/domain'

/** Processes one capture snapshot and returns its terminal status. */
export type CaptureProcessor = (
  snapshot: Readonly<CaptureRequestSnapshot>
) => Promise<TerminalJobStatus>

export interface CaptureQueueEntry {
  readonly snapshot: Readonly<CaptureRequestSnapshot>
  readonly enqueuedAt: string
}

export class CaptureQueue {
  private readonly processor: CaptureProcessor
  private readonly pending: CaptureQueueEntry[] = []
  private isProcessing = false

  constructor(options: { processor: CaptureProcessor }) {
    this.processor = options.processor
  }

  enqueue(snapshot: Readonly<CaptureRequestSnapshot>): void {
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
          // Processor is responsible for its own error mapping.
          // Queue continues to next entry regardless.
        }
      }
    } finally {
      this.isProcessing = false
    }
  }
}
