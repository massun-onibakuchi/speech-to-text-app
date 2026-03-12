/**
 * Where: src/main/services/streaming/chunk-window-policy.test.ts
 * What:  Tests Groq upload retry policy defaults.
 * Why:   T440-04 removes overlap/stride helpers from the adapter, so the
 *        remaining shared policy surface should stay explicit and stable.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_GROQ_CHUNK_WINDOW_POLICY } from './chunk-window-policy'

describe('chunk-window-policy', () => {
  it('keeps Groq retry defaults small and explicit', () => {
    expect(DEFAULT_GROQ_CHUNK_WINDOW_POLICY).toEqual({
      maxRetryCount: 1,
      retryBackoffMs: 250,
      maxQueuedUtterances: 2
    })
  })
})
