/**
 * Where: src/main/services/streaming/chunk-window-policy.ts
 * What:  Central retry and queue policy defaults for Groq utterance uploads.
 * Why:   The utterance-native Groq path still needs explicit retry and bounded
 *        queue tunables so upload backpressure remains predictable and testable.
 */

export interface ChunkWindowPolicy {
  maxRetryCount: number
  retryBackoffMs: number
  maxQueuedUtterances: number
}

export const DEFAULT_GROQ_CHUNK_WINDOW_POLICY: ChunkWindowPolicy = {
  maxRetryCount: 1,
  retryBackoffMs: 250,
  maxQueuedUtterances: 2
}
