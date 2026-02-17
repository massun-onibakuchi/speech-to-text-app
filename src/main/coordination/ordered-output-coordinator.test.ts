// src/main/coordination/ordered-output-coordinator.test.ts
// Tests for SerialOutputCoordinator hold-back behavior.
// Verifies in-order commits, out-of-order hold-back, release/drain, and error handling.

import { describe, expect, it, vi } from 'vitest'
import { SerialOutputCoordinator } from './ordered-output-coordinator'
import type { TerminalJobStatus } from '../../shared/domain'

describe('SerialOutputCoordinator', () => {
  it('commits in-order submissions immediately', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()
    const seq1 = coordinator.nextSequence()

    expect(seq0).toBe(0)
    expect(seq1).toBe(1)

    const result0 = await coordinator.submit(seq0, async () => 'succeeded')
    expect(result0).toBe('succeeded')

    const result1 = await coordinator.submit(seq1, async () => 'succeeded')
    expect(result1).toBe('succeeded')
  })

  it('holds back out-of-order submission until predecessor completes', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()
    const seq1 = coordinator.nextSequence()

    const log: string[] = []

    // Submit seq1 first (out of order) — should park
    const promise1 = coordinator.submit(seq1, async () => {
      log.push('commit-1')
      return 'succeeded'
    })

    // seq1 should not have committed yet
    expect(log).toEqual([])

    // Now submit seq0 — should commit immediately and unblock seq1
    const result0 = await coordinator.submit(seq0, async () => {
      log.push('commit-0')
      return 'succeeded'
    })

    expect(result0).toBe('succeeded')

    const result1 = await promise1
    expect(result1).toBe('succeeded')
    expect(log).toEqual(['commit-0', 'commit-1'])
  })

  it('release on failed predecessor unblocks successors', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()
    const seq1 = coordinator.nextSequence()

    // Submit seq1 first — parks
    const promise1 = coordinator.submit(seq1, async () => 'succeeded')

    // Release seq0 (marking it as failed/skipped)
    coordinator.release(seq0)

    const result1 = await promise1
    expect(result1).toBe('succeeded')
  })

  it('drains multiple queued submissions in sequence order', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()
    const seq1 = coordinator.nextSequence()
    const seq2 = coordinator.nextSequence()

    const log: number[] = []

    // Submit out of order: 2, 1, then 0
    const promise2 = coordinator.submit(seq2, async () => {
      log.push(2)
      return 'succeeded'
    })
    const promise1 = coordinator.submit(seq1, async () => {
      log.push(1)
      return 'succeeded'
    })

    // Nothing committed yet
    expect(log).toEqual([])

    // Submit seq0 — triggers drain of all three
    const result0 = await coordinator.submit(seq0, async () => {
      log.push(0)
      return 'succeeded'
    })

    expect(result0).toBe('succeeded')
    const result1 = await promise1
    const result2 = await promise2
    expect(result1).toBe('succeeded')
    expect(result2).toBe('succeeded')
    expect(log).toEqual([0, 1, 2])
  })

  it('returns output_failed_partial when commitFn throws', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()

    const result = await coordinator.submit(seq0, async () => {
      throw new Error('commit failed')
    })

    expect(result).toBe('output_failed_partial')
  })

  it('returns output_failed_partial for parked entry whose commitFn throws', async () => {
    const coordinator = new SerialOutputCoordinator()
    const seq0 = coordinator.nextSequence()
    const seq1 = coordinator.nextSequence()

    // Park seq1 with a failing commitFn
    const promise1 = coordinator.submit(seq1, async () => {
      throw new Error('parked commit failed')
    })

    // Commit seq0 to unblock
    await coordinator.submit(seq0, async () => 'succeeded')

    const result1 = await promise1
    expect(result1).toBe('output_failed_partial')
  })

  it('sequence numbers are monotonically increasing', () => {
    const coordinator = new SerialOutputCoordinator()
    const seqs = Array.from({ length: 5 }, () => coordinator.nextSequence())
    expect(seqs).toEqual([0, 1, 2, 3, 4])
  })

  // Known gap: no starvation timeout mechanism yet.
  // If sequence N is never submitted/released, all successors park forever.
  // Phase 2A or Phase 6 should add a configurable timeout with forced release.
  it.todo('times out parked entries when predecessor never completes')
})
