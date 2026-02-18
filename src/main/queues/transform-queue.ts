// src/main/queues/transform-queue.ts
// Concurrent queue for standalone transformation jobs.
// Each enqueued job starts processing immediately — multiple jobs run in parallel.
// This ensures one slow LLM call doesn't block other transformation shortcuts.
// Wired to the production path in Phase 2A; made concurrent in Phase 3A.

import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'

import type { FailureCategory } from '../../shared/domain'

export interface TransformResult {
  readonly status: 'ok' | 'error'
  readonly message: string
  /** Present on error; distinguishes preflight from post-network failures. */
  readonly failureCategory?: FailureCategory
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
  private activeCount = 0

  constructor(options: { processor: TransformProcessor; onResult?: TransformResultCallback }) {
    this.processor = options.processor
    this.onResult = options.onResult
  }

  enqueue(snapshot: Readonly<TransformationRequestSnapshot>): void {
    const entry: TransformQueueEntry = {
      snapshot,
      enqueuedAt: new Date().toISOString()
    }
    void this.process(entry)
  }

  /** Number of jobs currently in-flight. */
  getActiveCount(): number {
    return this.activeCount
  }

  /** Process a single entry immediately (fire-and-forget). */
  private async process(entry: TransformQueueEntry): Promise<void> {
    this.activeCount++
    try {
      const result = await this.processor(entry.snapshot)
      this.onResult?.(result)
    } catch {
      this.onResult?.({ status: 'error', message: 'Unexpected transform queue error.' })
    } finally {
      this.activeCount--
    }
  }
}
