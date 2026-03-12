/**
 * Where: src/main/services/streaming/segment-assembler.test.ts
 * What:  Tests for canonical streaming final-segment normalization.
 * Why:   Lock delimiter resolution and blank-segment rejection before provider
 *        adapters begin emitting finalized segments into the runtime.
 */

import { describe, expect, it } from 'vitest'
import { SegmentAssembler, resolveStreamingDelimiter } from './segment-assembler'

describe('resolveStreamingDelimiter', () => {
  it.each([
    [{ mode: 'none', value: null }, ''],
    [{ mode: 'space', value: null }, ' '],
    [{ mode: 'newline', value: null }, '\n'],
    [{ mode: 'custom', value: ' | ' }, ' | ']
  ])('resolves %j to %j', (policy, expected) => {
    expect(resolveStreamingDelimiter(policy as any)).toBe(expected)
  })
})

describe('SegmentAssembler', () => {
  it('canonicalizes finalized provider text with delimiter metadata', () => {
    const assembler = new SegmentAssembler({
      mode: 'space',
      value: null
    })

    expect(
      assembler.finalize({
        sessionId: 'session-1',
        sequence: 0,
        text: '  hello world  ',
        startedAt: '2026-03-07T00:00:00.000Z',
        endedAt: '2026-03-07T00:00:01.000Z'
      })
    ).toEqual({
      sessionId: 'session-1',
      sequence: 0,
      sourceText: 'hello world',
      delimiter: ' ',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:00:01.000Z'
    })
  })

  it('drops empty finalized segments', () => {
    const assembler = new SegmentAssembler({
      mode: 'newline',
      value: null
    })

    expect(
      assembler.finalize({
        sessionId: 'session-1',
        sequence: 1,
        text: '   ',
        startedAt: '2026-03-07T00:00:00.000Z',
        endedAt: '2026-03-07T00:00:01.000Z'
      })
    ).toBeNull()
  })
})
