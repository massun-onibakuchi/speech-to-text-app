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

export const GLOBAL_OUTPUT_ORDER_SCOPE = '__global__'

export interface OrderedOutputCoordinator {
  /** Acquire next sequence number. Called at enqueue time. */
  nextSequence(scopeKey?: string): number
  /** Submit output for ordered commit. Resolves when this job's turn arrives. */
  submit(
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>,
    scopeKey?: string
  ): Promise<TerminalJobStatus>
  /** Mark a sequence as failed/skipped so successors can proceed. */
  release(sequenceNumber: number, scopeKey?: string): void
  /** Resolve and discard all parked work for a scope during teardown. */
  clearScope(scopeKey?: string): void
}

interface WaitingEntry {
  resolve: (status: TerminalJobStatus) => void
  commitFn: () => Promise<TerminalJobStatus>
}

interface OrderingScopeState {
  nextSequenceNumber: number
  committedUpTo: number
  waiting: Map<number, WaitingEntry>
  released: Set<number>
}

export class SerialOutputCoordinator implements OrderedOutputCoordinator {
  private readonly scopes = new Map<string, OrderingScopeState>()

  nextSequence(scopeKey = GLOBAL_OUTPUT_ORDER_SCOPE): number {
    const scope = this.getScopeState(scopeKey)
    const next = scope.nextSequenceNumber
    scope.nextSequenceNumber += 1
    return next
  }

  async submit(
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>,
    scopeKey = GLOBAL_OUTPUT_ORDER_SCOPE
  ): Promise<TerminalJobStatus> {
    const scope = this.getScopeState(scopeKey)

    // If this is the next expected sequence, commit immediately
    if (sequenceNumber === scope.committedUpTo + 1) {
      return this.commitAndDrain(scopeKey, sequenceNumber, commitFn)
    }

    // Otherwise, park until predecessors complete
    return new Promise<TerminalJobStatus>((resolve) => {
      scope.waiting.set(sequenceNumber, { resolve, commitFn })
    })
  }

  release(sequenceNumber: number, scopeKey = GLOBAL_OUTPUT_ORDER_SCOPE): void {
    const scope = this.getScopeState(scopeKey)
    scope.waiting.delete(sequenceNumber)
    if (sequenceNumber === scope.committedUpTo + 1) {
      scope.committedUpTo = sequenceNumber
      void this.drainWaiting(scopeKey)
      return
    }

    if (sequenceNumber > scope.committedUpTo + 1) {
      scope.released.add(sequenceNumber)
    }
  }

  clearScope(scopeKey = GLOBAL_OUTPUT_ORDER_SCOPE): void {
    const scope = this.scopes.get(scopeKey)
    if (!scope) {
      return
    }

    for (const entry of scope.waiting.values()) {
      entry.resolve('output_failed_partial')
    }
    this.scopes.delete(scopeKey)
  }

  private async commitAndDrain(
    scopeKey: string,
    sequenceNumber: number,
    commitFn: () => Promise<TerminalJobStatus>
  ): Promise<TerminalJobStatus> {
    const scope = this.getScopeState(scopeKey)
    let status: TerminalJobStatus
    try {
      status = await commitFn()
    } catch {
      status = 'output_failed_partial'
    }
    scope.committedUpTo = sequenceNumber
    void this.drainWaiting(scopeKey)
    return status
  }

  private async drainWaiting(scopeKey: string): Promise<void> {
    const scope = this.getScopeState(scopeKey)
    while (true) {
      const next = scope.committedUpTo + 1
      if (scope.released.has(next)) {
        scope.released.delete(next)
        scope.committedUpTo = next
        continue
      }

      if (!scope.waiting.has(next)) {
        break
      }

      const entry = scope.waiting.get(next)!
      scope.waiting.delete(next)

      let status: TerminalJobStatus
      try {
        status = await entry.commitFn()
      } catch {
        status = 'output_failed_partial'
      }
      scope.committedUpTo = next
      entry.resolve(status)
    }
  }

  private getScopeState(scopeKey: string): OrderingScopeState {
    const existing = this.scopes.get(scopeKey)
    if (existing) {
      return existing
    }

    const created: OrderingScopeState = {
      nextSequenceNumber: 0,
      committedUpTo: -1,
      waiting: new Map<number, WaitingEntry>(),
      released: new Set<number>()
    }
    this.scopes.set(scopeKey, created)
    return created
  }
}
