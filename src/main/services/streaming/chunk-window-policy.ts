/**
 * Where: src/main/services/streaming/chunk-window-policy.ts
 * What:  Central retry policy defaults for Groq utterance uploads.
 * Why:   Once Groq becomes utterance-only, the remaining shared tunables are
 *        retry count and retry backoff rather than frame overlap or strides.
 */

export interface ChunkWindowPolicy {
  maxRetryCount: number
  retryBackoffMs: number
}

export const DEFAULT_GROQ_CHUNK_WINDOW_POLICY: ChunkWindowPolicy = {
  maxRetryCount: 1,
  retryBackoffMs: 250
}
