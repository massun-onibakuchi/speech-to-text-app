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

const DEFAULT_SCOPE_ID = '__default__'

export interface OrderedStreamCommitResult<T> {
  committed: boolean
  value: T | null
}

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
  /** Submit a stream-scoped output commit using the runtime-provided sequence number. */
  submitStream<T>(
    streamId: string,
    sequenceNumber: number,
    commitFn: () => Promise<T>
  ): Promise<OrderedStreamCommitResult<T>>
  /** Mark a stream sequence as skipped/failed so later chunk commits can continue. */
  releaseStream(streamId: string, sequenceNumber: number): void
  /** Prevent future stream commits and skip unreachable parked entries once terminalized. */
  sealStream(streamId: string): void
  /** Cancel a stream and resolve any waiting future chunk commits as skipped. */
  cancelStream(streamId: string): void
  /** Drop all retained state for a completed stream. */
  clearStream(streamId: string): void
}

interface BatchWaitingEntry {
  resolve: (status: TerminalJobStatus) => void
  commitFn: () => Promise<TerminalJobStatus>
}

interface StreamWaitingEntry {
  kind: 'commit' | 'release'
  resolve?: (result: OrderedStreamCommitResult<unknown>) => void
  commitFn?: () => Promise<unknown>
  promise?: Promise<OrderedStreamCommitResult<unknown>>
}

interface StreamScopeState {
  expectedSequence: number
  cancelled: boolean
  sealed: boolean
  activeSequence: number | null
  readonly waiting: Map<number, StreamWaitingEntry>
  readonly results: Map<number, OrderedStreamCommitResult<unknown>>
}

export class SerialOutputCoordinator implements OrderedOutputCoordinator {
  private nextSeq = 0
  private committedUpTo = -1
  private readonly waiting = new Map<number, BatchWaitingEntry>()
  private readonly streamScopes = new Map<string, StreamScopeState>()

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

  submitStream<T>(
    streamId: string,
    sequenceNumber: number,
    commitFn: () => Promise<T>
  ): Promise<OrderedStreamCommitResult<T>> {
    const scope = this.getStreamScope(streamId)
    const existingResult = scope.results.get(sequenceNumber) as OrderedStreamCommitResult<T> | undefined
    if (existingResult) {
      return Promise.resolve(existingResult)
    }
    if (scope.cancelled || scope.sealed) {
      const skippedResult: OrderedStreamCommitResult<T> = { committed: false, value: null }
      scope.results.set(sequenceNumber, skippedResult)
      return Promise.resolve(skippedResult)
    }
    if (sequenceNumber === scope.expectedSequence && scope.activeSequence === null) {
      return this.commitStreamEntry(scope, sequenceNumber, commitFn)
    }

    const existingEntry = scope.waiting.get(sequenceNumber)
    if (existingEntry?.kind === 'release') {
      return Promise.resolve({ committed: false, value: null })
    }
    if (existingEntry?.promise) {
      return existingEntry.promise as Promise<OrderedStreamCommitResult<T>>
    }

    let resolveEntry: (result: OrderedStreamCommitResult<T>) => void = () => {}
    const promise = new Promise<OrderedStreamCommitResult<T>>((resolve) => {
      resolveEntry = resolve
    })

    scope.waiting.set(sequenceNumber, {
      kind: 'commit',
      resolve: resolveEntry as (result: OrderedStreamCommitResult<unknown>) => void,
      commitFn: commitFn as () => Promise<unknown>,
      promise: promise as Promise<OrderedStreamCommitResult<unknown>>
    })

    return promise
  }

  releaseStream(streamId: string, sequenceNumber: number): void {
    const scope = this.getStreamScope(streamId)
    if (scope.results.has(sequenceNumber)) {
      return
    }
    if (scope.cancelled) {
      scope.results.set(sequenceNumber, { committed: false, value: null })
      return
    }

    const existingEntry = scope.waiting.get(sequenceNumber)
    if (existingEntry?.kind === 'commit') {
      scope.waiting.set(sequenceNumber, {
        kind: 'release',
        resolve: existingEntry.resolve,
        promise: existingEntry.promise
      })
    } else if (!existingEntry) {
      scope.waiting.set(sequenceNumber, { kind: 'release' })
    }

    if (sequenceNumber === scope.expectedSequence) {
      void this.drainStreamScope(scope)
    }
  }

  sealStream(streamId: string): void {
    const scope = this.getStreamScope(streamId)
    scope.sealed = true
    if (scope.activeSequence === null) {
      void this.drainStreamScope(scope)
    }
  }

  cancelStream(streamId: string): void {
    const scope = this.getStreamScope(streamId)
    scope.cancelled = true

    for (const [sequenceNumber, entry] of scope.waiting.entries()) {
      const skippedResult = { committed: false, value: null }
      scope.results.set(sequenceNumber, skippedResult)
      entry.resolve?.(skippedResult)
    }
    scope.waiting.clear()
  }

  clearStream(streamId: string): void {
    const scopeId = this.normalizeStreamId(streamId)
    const scope = this.streamScopes.get(scopeId)
    if (!scope) {
      return
    }

    for (const [sequenceNumber, entry] of scope.waiting.entries()) {
      const skippedResult = { committed: false, value: null }
      scope.results.set(sequenceNumber, skippedResult)
      entry.resolve?.(skippedResult)
    }

    this.streamScopes.delete(scopeId)
  }

  private getStreamScope(streamId: string): StreamScopeState {
    const scopeId = this.normalizeStreamId(streamId)
    let scope = this.streamScopes.get(scopeId)
    if (!scope) {
      scope = {
        expectedSequence: 0,
        cancelled: false,
        sealed: false,
        activeSequence: null,
        waiting: new Map<number, StreamWaitingEntry>(),
        results: new Map<number, OrderedStreamCommitResult<unknown>>()
      }
      this.streamScopes.set(scopeId, scope)
    }
    return scope
  }

  private normalizeStreamId(streamId: string): string {
    return streamId.trim().length > 0 ? streamId : DEFAULT_SCOPE_ID
  }

  private async commitStreamEntry<T>(
    scope: StreamScopeState,
    sequenceNumber: number,
    commitFn: () => Promise<T>
  ): Promise<OrderedStreamCommitResult<T>> {
    if (scope.cancelled) {
      const skippedResult: OrderedStreamCommitResult<T> = { committed: false, value: null }
      scope.results.set(sequenceNumber, skippedResult)
      scope.expectedSequence = Math.max(scope.expectedSequence, sequenceNumber + 1)
      return skippedResult
    }

    scope.activeSequence = sequenceNumber
    try {
      const committedValue = await commitFn()
      const committedResult: OrderedStreamCommitResult<T> = {
        committed: true,
        value: committedValue
      }
      scope.results.set(sequenceNumber, committedResult)
      scope.expectedSequence = Math.max(scope.expectedSequence, sequenceNumber + 1)
      return committedResult
    } catch {
      const skippedResult: OrderedStreamCommitResult<T> = { committed: false, value: null }
      scope.results.set(sequenceNumber, skippedResult)
      scope.expectedSequence = Math.max(scope.expectedSequence, sequenceNumber + 1)
      return skippedResult
    } finally {
      scope.activeSequence = null
      await this.drainStreamScope(scope)
    }
  }

  private async drainStreamScope(scope: StreamScopeState): Promise<void> {
    if (scope.activeSequence !== null) {
      return
    }

    while (scope.waiting.has(scope.expectedSequence)) {
      const sequenceNumber = scope.expectedSequence
      const entry = scope.waiting.get(sequenceNumber)
      if (!entry) {
        break
      }
      scope.waiting.delete(sequenceNumber)

      if (scope.cancelled || entry.kind === 'release') {
        const skippedResult = { committed: false, value: null }
        scope.results.set(sequenceNumber, skippedResult)
        entry.resolve?.(skippedResult)
        scope.expectedSequence += 1
        continue
      }

      scope.activeSequence = sequenceNumber
      try {
        const committedValue = await entry.commitFn!()
        const committedResult = {
          committed: true,
          value: committedValue
        }
        scope.results.set(sequenceNumber, committedResult)
        entry.resolve?.(committedResult)
      } catch {
        const skippedResult = { committed: false, value: null }
        scope.results.set(sequenceNumber, skippedResult)
        entry.resolve?.(skippedResult)
      } finally {
        scope.activeSequence = null
        scope.expectedSequence += 1
      }
    }

    if (scope.sealed && scope.activeSequence === null && !scope.waiting.has(scope.expectedSequence)) {
      for (const [sequenceNumber, entry] of scope.waiting.entries()) {
        const skippedResult = { committed: false, value: null }
        scope.results.set(sequenceNumber, skippedResult)
        if (entry.kind === 'commit') {
          entry.resolve?.(skippedResult)
        }
        scope.waiting.delete(sequenceNumber)
      }
    }
  }
}
