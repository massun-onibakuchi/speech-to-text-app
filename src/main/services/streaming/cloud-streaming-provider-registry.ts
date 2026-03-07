/**
 * Where: src/main/services/streaming/cloud-streaming-provider-registry.ts
 * What:  Factory for cloud streaming runtimes keyed by transport-aware provider config.
 * Why:   Keep Groq rolling-upload explicit today while leaving room for future
 *        native cloud streaming providers behind the same controller seam.
 */

import type { SecretStore } from '../secret-store'
import { GroqRollingUploadAdapter } from './groq-rolling-upload-adapter'
import type { CreateStreamingProviderRuntime } from './types'

export interface CloudStreamingProviderRegistryDependencies {
  secretStore: Pick<SecretStore, 'getApiKey'>
  fetchFn?: typeof fetch
}

export class CloudStreamingProviderRegistry {
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly fetchFn?: typeof fetch

  constructor(dependencies: CloudStreamingProviderRegistryDependencies) {
    this.secretStore = dependencies.secretStore
    this.fetchFn = dependencies.fetchFn
  }

  readonly createRuntime: CreateStreamingProviderRuntime = ({ sessionId, config, callbacks }) => {
    if (config.provider !== 'groq_whisper_large_v3_turbo') {
      return null
    }

    return new GroqRollingUploadAdapter({
      sessionId,
      config,
      callbacks
    }, {
      secretStore: this.secretStore,
      fetchFn: this.fetchFn
    })
  }
}
