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

import type { TerminalJobStatus } from '../../shared/domain'

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
}

export class SerialOutputCoordinator implements OrderedOutputCoordinator {
  private nextSeq = 0
  private committedUpTo = -1
  private readonly waiting = new Map<number, WaitingEntry>()

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

    // Otherwise, park until predecessors complete
    return new Promise<TerminalJobStatus>((resolve) => {
      this.waiting.set(sequenceNumber, { resolve, commitFn })
    })
  }

  release(sequenceNumber: number): void {
    this.waiting.delete(sequenceNumber)
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
