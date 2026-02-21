// src/main/coordination/ordered-output-coordinator.test.ts
// Tests for SerialOutputCoordinator hold-back behavior.
// Verifies in-order commits, out-of-order hold-back, release/drain, error handling,
// and starvation-protection timeout (parked entries force-resolved when predecessor never arrives).

import { describe, expect, it, vi } from 'vitest'
import { SerialOutputCoordinator } from './ordered-output-coordinator'
import type { TerminalJobStatus } from '../../shared/domain'

// Short timeout used in starvation tests so they run fast with fake timers.
const TEST_PARK_TIMEOUT_MS = 100

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

  it('times out parked entries when predecessor never completes', async () => {
    // Starvation scenario: seq1 parks waiting for seq0, but seq0 never arrives.
    // The park timeout must force-resolve seq1 as output_failed_partial.
    vi.useFakeTimers()
    try {
      const coordinator = new SerialOutputCoordinator({ parkTimeoutMs: TEST_PARK_TIMEOUT_MS })

      const seq0 = coordinator.nextSequence()
      const seq1 = coordinator.nextSequence()

      // Park seq1 — seq0 will never arrive.
      const promise1 = coordinator.submit(seq1, async () => 'succeeded' as TerminalJobStatus)

      // Advance past the timeout; seq1 must be force-resolved.
      await vi.advanceTimersByTimeAsync(TEST_PARK_TIMEOUT_MS + 10)

      const result1 = await promise1
      expect(result1).toBe('output_failed_partial')

      // After the timeout advanced committedUpTo past seq1, a new successor
      // submitted at seq2 should commit immediately (not park).
      const seq2 = coordinator.nextSequence()
      const result2 = await coordinator.submit(seq2, async () => 'succeeded' as TerminalJobStatus)
      expect(result2).toBe('succeeded')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels starvation timer when predecessor arrives before timeout', async () => {
    // Happy path: seq1 parks, seq0 arrives before the timeout fires.
    // seq1 must commit normally (not via forced timeout resolution).
    vi.useFakeTimers()
    try {
      const coordinator = new SerialOutputCoordinator({ parkTimeoutMs: TEST_PARK_TIMEOUT_MS })

      const seq0 = coordinator.nextSequence()
      const seq1 = coordinator.nextSequence()

      // Park seq1
      const promise1 = coordinator.submit(seq1, async () => 'succeeded' as TerminalJobStatus)

      // Advance to just before the timeout — seq1 still parked.
      await vi.advanceTimersByTimeAsync(TEST_PARK_TIMEOUT_MS - 10)

      // seq0 arrives in time — unblocks seq1 before the timer fires.
      const result0 = await coordinator.submit(seq0, async () => 'succeeded' as TerminalJobStatus)
      expect(result0).toBe('succeeded')

      const result1 = await promise1
      // seq1 must commit its own commitFn (not forced to output_failed_partial).
      expect(result1).toBe('succeeded')

      // Advance past where the timeout would have fired — must not corrupt state.
      await vi.advanceTimersByTimeAsync(TEST_PARK_TIMEOUT_MS + 50)

      const seq2 = coordinator.nextSequence()
      const result2 = await coordinator.submit(seq2, async () => 'succeeded' as TerminalJobStatus)
      expect(result2).toBe('succeeded')
    } finally {
      vi.useRealTimers()
    }
  })

  it('drains successor chain after starvation timeout on intermediate entry', async () => {
    // seq0 never arrives; seq1 and seq2 are both parked.
    // When seq1 times out, committedUpTo advances to seq1, triggering seq2 to drain.
    vi.useFakeTimers()
    try {
      const coordinator = new SerialOutputCoordinator({ parkTimeoutMs: TEST_PARK_TIMEOUT_MS })

      const seq0 = coordinator.nextSequence()
      const seq1 = coordinator.nextSequence()
      const seq2 = coordinator.nextSequence()

      // seq0 never arrives — park seq1 and seq2.
      const promise1 = coordinator.submit(seq1, async () => 'succeeded' as TerminalJobStatus)
      const promise2 = coordinator.submit(seq2, async () => 'succeeded' as TerminalJobStatus)

      // Advance past timeout — seq1 times out and its drain should unblock seq2.
      await vi.advanceTimersByTimeAsync(TEST_PARK_TIMEOUT_MS + 10)

      const result1 = await promise1
      expect(result1).toBe('output_failed_partial')

      const result2 = await promise2
      // seq2 commits its own commitFn because seq1's timeout triggered the drain.
      expect(result2).toBe('succeeded')

      // seq0 arriving late (after seq1 and seq2 already resolved) must not
      // corrupt state; it has already been superseded.
      void seq0 // suppress unused-variable lint
    } finally {
      vi.useRealTimers()
    }
  })
})
