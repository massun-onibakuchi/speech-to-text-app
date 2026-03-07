/*
Where: src/renderer/streaming-audio-ingress.ts
What: Provider-neutral renderer-side batching and transport helper for streaming audio frames.
Why: Separate frame batching/backpressure behavior from browser audio extraction so PR-4 can lock transport
     semantics before wiring a real AudioWorklet or equivalent capture source.
*/

import type { StreamingAudioFrame, StreamingAudioFrameBatch } from '../shared/ipc'

export interface StreamingAudioIngressSink {
  pushStreamingAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void>
}

export interface StreamingAudioIngressOptions {
  sampleRateHz: number
  channels: number
  maxFramesPerBatch?: number
  maxQueuedBatches?: number
}

const DEFAULT_MAX_FRAMES_PER_BATCH = 4
const DEFAULT_MAX_QUEUED_BATCHES = 2

export class StreamingAudioIngress {
  private readonly sink: StreamingAudioIngressSink
  private readonly sampleRateHz: number
  private readonly channels: number
  private readonly maxFramesPerBatch: number
  private readonly maxQueuedBatches: number
  private readonly queuedBatches: StreamingAudioFrameBatch[] = []
  private pendingFrames: StreamingAudioFrame[] = []
  private pushing = false
  private stopped = false
  private overflowed = false

  constructor(sink: StreamingAudioIngressSink, options: StreamingAudioIngressOptions) {
    this.sink = sink
    this.sampleRateHz = options.sampleRateHz
    this.channels = options.channels
    this.maxFramesPerBatch = options.maxFramesPerBatch ?? DEFAULT_MAX_FRAMES_PER_BATCH
    this.maxQueuedBatches = options.maxQueuedBatches ?? DEFAULT_MAX_QUEUED_BATCHES
  }

  pushFrame(frame: StreamingAudioFrame): void {
    if (this.stopped) {
      throw new Error('Streaming audio ingress is stopped.')
    }

    this.pendingFrames.push({
      samples: frame.samples.slice(),
      timestampMs: frame.timestampMs
    })

    if (this.pendingFrames.length >= this.maxFramesPerBatch) {
      this.enqueuePendingBatch()
      void this.drainQueue()
    }
  }

  async flush(): Promise<void> {
    if (this.pendingFrames.length > 0) {
      this.enqueuePendingBatch()
    }
    await this.drainQueue()
  }

  async stop(): Promise<void> {
    if (this.stopped && !this.overflowed) {
      return
    }
    this.stopped = true
    this.overflowed = false
    await this.flush()
  }

  cancel(): void {
    this.pendingFrames = []
    this.queuedBatches.length = 0
    this.stopped = true
  }

  private enqueuePendingBatch(): void {
    if (this.queuedBatches.length >= this.maxQueuedBatches) {
      this.pendingFrames = []
      this.stopped = true
      this.overflowed = true
      throw new Error('Streaming audio backpressure limit exceeded.')
    }

    this.queuedBatches.push({
      sampleRateHz: this.sampleRateHz,
      channels: this.channels,
      frames: this.pendingFrames
    })
    this.pendingFrames = []
  }

  private async drainQueue(): Promise<void> {
    if (this.pushing) {
      return
    }

    this.pushing = true
    try {
      while (this.queuedBatches.length > 0) {
        const nextBatch = this.queuedBatches.shift()
        if (!nextBatch) {
          continue
        }
        await this.sink.pushStreamingAudioFrameBatch(nextBatch)
      }
    } finally {
      this.pushing = false
    }
  }
}
