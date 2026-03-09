/*
Where: src/renderer/streaming-audio-ingress.test.ts
What: Tests for renderer-side streaming frame batching and transport behavior.
Why: Lock the chosen structured-clone batching semantics and fail-fast backpressure policy before
     wiring browser audio extraction into the ingress path.
*/

import { describe, expect, it, vi } from 'vitest'
import { StreamingAudioIngress } from './streaming-audio-ingress'

const makeFrame = (timestampMs: number, values: number[]) => ({
  samples: new Float32Array(values),
  timestampMs
})

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('StreamingAudioIngress', () => {
  it('batches frames before pushing them to the sink', async () => {
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 2
    })

    ingress.pushFrame(makeFrame(1, [0, 0.1]))
    ingress.pushFrame(makeFrame(2, [0.2, 0.3]))
    await ingress.flush('session_stop')

    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: null,
      frames: [
        { samples: new Float32Array([0, 0.1]), timestampMs: 1 },
        { samples: new Float32Array([0.2, 0.3]), timestampMs: 2 }
      ]
    })
  })

  it('flushes pending frames on stop without requiring a final blob', async () => {
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 4
    })

    ingress.pushFrame(makeFrame(1, [0, 0.1]))
    await ingress.stop()

    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioFrameBatch.mock.calls[0]?.[0].flushReason).toBe('session_stop')
    expect(sink.pushStreamingAudioFrameBatch.mock.calls[0]?.[0].frames).toHaveLength(1)
  })

  it('drops pending work on cancel and rejects future pushes', () => {
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 2
    })

    ingress.pushFrame(makeFrame(1, [0, 0.1]))
    ingress.cancel()

    expect(() => ingress.pushFrame(makeFrame(2, [0.2, 0.3]))).toThrow('stopped')
    expect(sink.pushStreamingAudioFrameBatch).not.toHaveBeenCalled()
  })

  it('fails fast when queued batch backpressure exceeds the configured bound', async () => {
    const releasePushes: Array<() => void> = []
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            releasePushes.push(resolve)
          })
      )
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 1,
      maxQueuedBatches: 1
    })

    ingress.pushFrame(makeFrame(1, [0, 0.1]))
    ingress.pushFrame(makeFrame(2, [0.2, 0.3]))

    expect(() => ingress.pushFrame(makeFrame(3, [0.4, 0.5]))).toThrow('backpressure limit exceeded')

    const stopPromise = ingress.stop()
    releasePushes.shift()?.()
    await flushMicrotasks()
    releasePushes.shift()?.()
    await stopPromise
  })

  it('waits for an in-flight drain and queued follow-up batches before stop resolves', async () => {
    let releaseFirstPush: (() => void) | null = null
    let releaseSecondPush: (() => void) | null = null
    const sink = {
      pushStreamingAudioFrameBatch: vi
        .fn()
        .mockImplementationOnce(
          async () =>
            await new Promise<void>((resolve) => {
              releaseFirstPush = resolve
            })
        )
        .mockImplementationOnce(
          async () =>
            await new Promise<void>((resolve) => {
              releaseSecondPush = resolve
            })
        )
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 1,
      maxQueuedBatches: 3
    })

    ingress.pushFrame(makeFrame(1, [0.1, 0.2]))
    ingress.pushFrame(makeFrame(2, [0.3, 0.4]))

    let stopResolved = false
    const stopPromise = ingress.stop().then(() => {
      stopResolved = true
    })

    await Promise.resolve()
    expect(stopResolved).toBe(false)
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledTimes(1)

    ;(releaseFirstPush as (() => void) | null)?.()
    await flushMicrotasks()
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledTimes(2)
    expect(stopResolved).toBe(false)

    ;(releaseSecondPush as (() => void) | null)?.()
    await stopPromise

    expect(stopResolved).toBe(true)
  })

  it('makes flush join an in-flight drain and reject on transport failure', async () => {
    let releaseFirstPush: (() => void) | null = null
    const sink = {
      pushStreamingAudioFrameBatch: vi
        .fn()
        .mockImplementationOnce(
          async () =>
            await new Promise<void>((resolve) => {
              releaseFirstPush = resolve
            })
        )
        .mockRejectedValueOnce(new Error('push failed'))
    }
    const ingress = new StreamingAudioIngress(sink, {
      sampleRateHz: 16000,
      channels: 1,
      maxFramesPerBatch: 1,
      maxQueuedBatches: 3
    })

    ingress.pushFrame(makeFrame(1, [0.1, 0.2]))
    ingress.pushFrame(makeFrame(2, [0.3, 0.4]))

    let flushResolved = false
    const flushPromise = ingress.flush('speech_pause').then(() => {
      flushResolved = true
    })

    await Promise.resolve()
    expect(flushResolved).toBe(false)
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledTimes(1)

    ;(releaseFirstPush as (() => void) | null)?.()
    await expect(flushPromise).rejects.toThrow('push failed')
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledTimes(2)
  })
})
