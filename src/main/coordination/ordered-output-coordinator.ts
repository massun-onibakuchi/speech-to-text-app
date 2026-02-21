// src/main/coordination/ordered-output-coordinator.ts
// Ensures output commits happen in source-sequence order.
// Serial implementation: holds back job N+1 output until job N commits or fails.
// Used in Phase 2A to wrap OutputService with ordered guarantees.
//
// Hold-back algorithm:
// - Jobs receive monotonically increasing sequence numbers at enqueue time.
// - submit(seq, commitFn) resolves immediately if seq is next in line.
// - Otherwise, the promise parks in a waiting map until predecessors complete.
// - release(seq) marks a sequence as done without committing (for failures/skips).
//
// Starvation protection:
// - Each parked entry has a configurable timeout (parkTimeoutMs).
// - If the timeout fires before a predecessor completes/releases, the parked
//   entry is force-resolved as output_failed_partial and committedUpTo advances
//   past it, unblocking any subsequent parked entries.

import type { TerminalJobStatus } from '../../shared/domain'

// Default park timeout: 30 seconds. Long enough for normal STT/LLM latency,
// short enough to avoid indefinite hangs when a predecessor job is lost.
const DEFAULT_PARK_TIMEOUT_MS = 30_000

export interface OrderedOutputCoordinator {
  /** Acquire next sequence number. Called at enqueue time. */
  nextSequence(): number
  /** Submit output for ordered commit. Resolves when this job's turn arrives. */
  submit(
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>
  ): Promise<TerminalJobStatus>
  /** Mark a sequence as failed/skipped so successors can proceed. */
  release(sequenceNumber: number): void
}

interface WaitingEntry {
  resolve: (status: TerminalJobStatus) => void
  commitFn: () => Promise<TerminalJobStatus>
  // Timer handle cleared when the entry is committed normally; fires to force-release on starvation.
  timeoutHandle: ReturnType<typeof setTimeout>
}

export class SerialOutputCoordinator implements OrderedOutputCoordinator {
  private nextSeq = 0
  private committedUpTo = -1
  private readonly waiting = new Map<number, WaitingEntry>()
  private readonly parkTimeoutMs: number

  constructor(options?: { parkTimeoutMs?: number }) {
    this.parkTimeoutMs = options?.parkTimeoutMs ?? DEFAULT_PARK_TIMEOUT_MS
  }

  nextSequence(): number {
    return this.nextSeq++
  }

  async submit(
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>
  ): Promise<TerminalJobStatus> {
    // If this is the next expected sequence, commit immediately
    if (sequenceNumber === this.committedUpTo + 1) {
      return this.commitAndDrain(sequenceNumber, commitFn)
    }

    // Otherwise, park until predecessors complete.
    // Start a starvation-protection timer so successors are never blocked forever
    // if a predecessor is lost (never submitted or released).
    return new Promise<TerminalJobStatus>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        // Predecessor never arrived — force-resolve this entry as failed and
        // advance committedUpTo so any further parked successors can drain.
        if (this.waiting.has(sequenceNumber)) {
          this.waiting.delete(sequenceNumber)
          this.committedUpTo = sequenceNumber
          resolve('output_failed_partial')
          void this.drainWaiting()
        }
      }, this.parkTimeoutMs)

      this.waiting.set(sequenceNumber, { resolve, commitFn, timeoutHandle })
    })
  }

  release(sequenceNumber: number): void {
    const entry = this.waiting.get(sequenceNumber)
    if (entry) {
      clearTimeout(entry.timeoutHandle)
      this.waiting.delete(sequenceNumber)
    }
    if (sequenceNumber === this.committedUpTo + 1) {
      this.committedUpTo = sequenceNumber
      void this.drainWaiting()
    }
  }

  private async commitAndDrain(
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>
  ): Promise<TerminalJobStatus> {
    let status: TerminalJobStatus
    try {
      status = await commitFn()
    } catch {
      status = 'output_failed_partial'
    }
    this.committedUpTo = sequenceNumber
    void this.drainWaiting()
    return status
  }

  private async drainWaiting(): Promise<void> {
    while (this.waiting.has(this.committedUpTo + 1)) {
      const next = this.committedUpTo + 1
      const entry = this.waiting.get(next)!
      // Cancel the starvation timer — predecessor arrived in time.
      clearTimeout(entry.timeoutHandle)
      this.waiting.delete(next)

      let status: TerminalJobStatus
      try {
        status = await entry.commitFn()
      } catch {
        status = 'output_failed_partial'
      }
      this.committedUpTo = next
      entry.resolve(status)
    }
  }
}
