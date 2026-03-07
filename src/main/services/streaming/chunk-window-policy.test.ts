/**
 * Where: src/main/services/streaming/chunk-window-policy.test.ts
 * What:  Tests chunk overlap policy helpers for rolling-upload providers.
 * Why:   PR-7 depends on explicit max-chunk continuation overlap without
 *        smearing that behavior across normal speech-pause chunk boundaries.
 */

import { describe, expect, it } from 'vitest'
import { resolveOverlapMsForFlushReason, tailFramesForOverlap } from './chunk-window-policy'

describe('chunk-window-policy', () => {
  it('uses overlap only for max_chunk continuation uploads', () => {
    expect(resolveOverlapMsForFlushReason('speech_pause')).toBe(0)
    expect(resolveOverlapMsForFlushReason('session_stop')).toBe(0)
    expect(resolveOverlapMsForFlushReason('max_chunk')).toBeGreaterThan(0)
  })

  it('selects the tail frames needed for continuation overlap', () => {
    const frames = [
      { timestampMs: 0, samples: new Float32Array(4000) },
      { timestampMs: 250, samples: new Float32Array(4000) },
      { timestampMs: 500, samples: new Float32Array(4000) },
      { timestampMs: 750, samples: new Float32Array(4000) }
    ]

    const overlap = tailFramesForOverlap(frames, 16000, 400)

    expect(overlap.map((frame) => frame.timestampMs)).toEqual([500, 750])
  })
})
