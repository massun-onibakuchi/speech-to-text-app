/**
 * Where: src/main/services/streaming/cloud-streaming-provider-registry.test.ts
 * What:  Tests the transport-aware cloud runtime registry.
 * Why:   PR-7 should add Groq through the shared runtime seam without letting
 *        local providers or future cloud providers leak into controller wiring.
 */

import { describe, expect, it, vi } from 'vitest'
import { CloudStreamingProviderRegistry } from './cloud-streaming-provider-registry'

const CALLBACKS = {
  onFinalSegment: vi.fn(),
  onFailure: vi.fn()
}

describe('CloudStreamingProviderRegistry', () => {
  it('creates a Groq rolling-upload runtime for the canonical cloud streaming provider', () => {
    const registry = new CloudStreamingProviderRegistry({
      secretStore: {
        getApiKey: vi.fn(() => 'test-key')
      }
    })

    const runtime = registry.createRuntime({
      sessionId: 'session-1',
      config: {
        provider: 'groq_whisper_large_v3_turbo',
        transport: 'rolling_upload',
        model: 'whisper-large-v3-turbo',
        outputMode: 'stream_raw_dictation',
        maxInFlightTransforms: 2,
        apiKeyRef: 'groq',
        language: 'auto',
        delimiterPolicy: { mode: 'space', value: null },
        transformationProfile: null
      },
      callbacks: CALLBACKS
    })

    expect(runtime).not.toBeNull()
  })

  it('returns null for non-cloud providers', () => {
    const registry = new CloudStreamingProviderRegistry({
      secretStore: {
        getApiKey: vi.fn(() => 'test-key')
      }
    })

    const runtime = registry.createRuntime({
      sessionId: 'session-1',
      config: {
        provider: 'local_whispercpp_coreml',
        transport: 'native_stream',
        model: 'ggml-large-v3-turbo-q5_0',
        outputMode: 'stream_raw_dictation',
        maxInFlightTransforms: 2,
        delimiterPolicy: { mode: 'space', value: null },
        transformationProfile: null
      },
      callbacks: CALLBACKS
    })

    expect(runtime).toBeNull()
  })
})
