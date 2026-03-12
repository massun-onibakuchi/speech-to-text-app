/*
Where: src/renderer/streaming-audio-ingress.ts
What: Provider-neutral renderer-side batching and transport helper for streaming audio frames.
Why: Separate frame batching/backpressure behavior from browser audio extraction so PR-4 can lock transport
     semantics before wiring browser audio extraction into the ingress path.
*/

import type { StreamingAudioChunkFlushReason, StreamingAudioFrame, StreamingAudioFrameBatch } from '../shared/ipc'

type RendererStreamingAudioFrameBatch = Omit<StreamingAudioFrameBatch, 'sessionId'>

export interface StreamingAudioIngressSink {
  pushStreamingAudioFrameBatch(batch: RendererStreamingAudioFrameBatch): Promise<void>
}

export interface StreamingAudioIngressOptions {
  sampleRateHz: number
  channels: number
  maxFramesPerBatch?: number
  maxQueuedBatches?: number
}

export const DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS = {
  maxFramesPerBatch: 6,
  maxQueuedBatches: 3
} as const

export class StreamingAudioIngress {
  private readonly sink: StreamingAudioIngressSink
  private readonly sampleRateHz: number
  private readonly channels: number
  private readonly maxFramesPerBatch: number
  private readonly maxQueuedBatches: number
  private readonly queuedBatches: RendererStreamingAudioFrameBatch[] = []
  private pendingFrames: StreamingAudioFrame[] = []
  private activeDrain: Promise<void> | null = null
  private stopped = false
  private overflowed = false

  constructor(sink: StreamingAudioIngressSink, options: StreamingAudioIngressOptions) {
    this.sink = sink
    this.sampleRateHz = options.sampleRateHz
    this.channels = options.channels
    this.maxFramesPerBatch = options.maxFramesPerBatch ?? DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS.maxFramesPerBatch
    this.maxQueuedBatches = options.maxQueuedBatches ?? DEFAULT_STREAMING_AUDIO_INGRESS_LIMITS.maxQueuedBatches
  }

  pushFrame(frame: StreamingAudioFrame): Promise<void> | null {
    if (this.stopped) {
      throw new Error('Streaming audio ingress is stopped.')
    }

    this.pendingFrames.push({
      samples: frame.samples.slice(),
      timestampMs: frame.timestampMs
    })

    if (this.pendingFrames.length >= this.maxFramesPerBatch) {
      this.enqueuePendingBatch(null)
      return this.ensureDrain()
    }

    return null
  }

  async flush(reason: StreamingAudioChunkFlushReason): Promise<void> {
    if (this.pendingFrames.length > 0) {
      this.enqueuePendingBatch(reason)
    }
    await this.ensureDrain()
  }

  async stop(): Promise<void> {
    if (this.stopped && !this.overflowed) {
      await this.activeDrain
      return
    }
    this.stopped = true
    this.overflowed = false
    if (this.pendingFrames.length > 0) {
      this.enqueuePendingBatch('session_stop')
    }
    await this.ensureDrain()
  }

  cancel(): void {
    this.pendingFrames = []
    this.queuedBatches.length = 0
    this.stopped = true
  }

  async discardPendingChunk(): Promise<void> {
    if (this.stopped) {
      throw new Error('Streaming audio ingress is stopped.')
    }

    this.pendingFrames = []
    this.enqueueControlBatch('discard_pending')
    await this.ensureDrain()
  }

  private enqueuePendingBatch(flushReason: StreamingAudioChunkFlushReason | null): void {
    if (this.queuedBatches.length >= this.maxQueuedBatches) {
      this.pendingFrames = []
      this.stopped = true
      this.overflowed = true
      throw new Error('Streaming audio backpressure limit exceeded.')
    }

    this.queuedBatches.push({
      sampleRateHz: this.sampleRateHz,
      channels: this.channels,
      frames: this.pendingFrames,
      flushReason
    })
    this.pendingFrames = []
  }

  private enqueueControlBatch(flushReason: StreamingAudioChunkFlushReason): void {
    if (this.queuedBatches.length >= this.maxQueuedBatches) {
      this.pendingFrames = []
      this.stopped = true
      this.overflowed = true
      throw new Error('Streaming audio backpressure limit exceeded.')
    }

    this.queuedBatches.push({
      sampleRateHz: this.sampleRateHz,
      channels: this.channels,
      frames: [],
      flushReason
    })
  }

  private ensureDrain(): Promise<void> {
    if (this.activeDrain) {
      return this.activeDrain
    }
    if (this.queuedBatches.length === 0) {
      return Promise.resolve()
    }

    // One shared drain promise lets stop/flush await in-flight transport work
    // and also lets the capture loop observe auto-batch push failures.
    this.activeDrain = this.drainQueue().finally(() => {
      this.activeDrain = null
    })
    return this.activeDrain
  }

  private async drainQueue(): Promise<void> {
    while (this.queuedBatches.length > 0) {
      const nextBatch = this.queuedBatches.shift()
      if (!nextBatch) {
        continue
      }
      await this.sink.pushStreamingAudioFrameBatch(nextBatch)
    }
  }
}
