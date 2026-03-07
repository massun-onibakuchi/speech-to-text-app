/**
 * Where: src/main/services/streaming/chunk-window-policy.ts
 * What:  Central policy helpers for rolling-upload chunk overlap and retry defaults.
 * Why:   Groq is near-realtime chunk upload rather than native session streaming,
 *        so chunk carryover and retry behavior must stay explicit and testable.
 */

import type { StreamingAudioChunkFlushReason, StreamingAudioFrame } from '../../../shared/ipc'

export interface ChunkWindowPolicy {
  continuationOverlapMs: number
  maxRetryCount: number
  retryBackoffMs: number
  sequenceStride: number
}

export const DEFAULT_GROQ_CHUNK_WINDOW_POLICY: ChunkWindowPolicy = {
  continuationOverlapMs: 800,
  maxRetryCount: 1,
  retryBackoffMs: 250,
  sequenceStride: 1000
}

export const resolveOverlapMsForFlushReason = (
  reason: StreamingAudioChunkFlushReason,
  policy: ChunkWindowPolicy = DEFAULT_GROQ_CHUNK_WINDOW_POLICY
): number => (reason === 'max_chunk' ? policy.continuationOverlapMs : 0)

export const tailFramesForOverlap = (
  frames: readonly StreamingAudioFrame[],
  sampleRateHz: number,
  overlapMs: number
): StreamingAudioFrame[] => {
  if (frames.length === 0 || sampleRateHz <= 0 || overlapMs <= 0) {
    return []
  }

  const requiredSamples = Math.ceil((overlapMs / 1000) * sampleRateHz)
  let collectedSamples = 0
  const selected: StreamingAudioFrame[] = []

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]
    selected.unshift({
      samples: frame.samples.slice(),
      timestampMs: frame.timestampMs
    })
    collectedSamples += frame.samples.length
    if (collectedSamples >= requiredSamples) {
      break
    }
  }

  return selected
}
