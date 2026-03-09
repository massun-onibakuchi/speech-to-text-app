/*
Where: src/renderer/streaming-live-capture.test.ts
What: Focused lifecycle tests for browser-side streaming PCM capture wiring.
Why: Cover the AudioWorklet-based graph directly instead of relying only on higher-
     level native-recording tests around the same capture path.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STREAMING_AUDIO_CAPTURE_WORKLET_NAME,
  startStreamingLiveCapture
} from './streaming-live-capture'

type WorkletPortMessage = {
  data:
  | { type: 'audio_frame'; samples: Float32Array; timestampMs: number }
  | { type: 'flush_complete' }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = []
  static flushStrategy: 'complete' | 'stall' = 'complete'

  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
  readonly addEventListener = vi.fn((event: string, listener: () => void) => {
    if (event === 'processorerror') {
      this.processorErrorListener = listener
    }
  })
  readonly removeEventListener = vi.fn((event: string, listener: () => void) => {
    if (event === 'processorerror' && this.processorErrorListener === listener) {
      this.processorErrorListener = null
    }
  })
  readonly port = {
    onmessage: null as ((event: WorkletPortMessage) => void) | null,
    postMessage: vi.fn((message: { type: 'flush' }) => {
      if (message.type === 'flush' && FakeAudioWorkletNode.flushStrategy === 'complete') {
        this.emitMessage({ type: 'flush_complete' })
      }
    })
  }

  private processorErrorListener: (() => void) | null = null

  constructor(
    readonly context: AudioContext,
    readonly name: string,
    readonly options?: AudioWorkletNodeOptions
  ) {
    FakeAudioWorkletNode.instances.push(this)
  }

  emitMessage(message: WorkletPortMessage['data']): void {
    this.port.onmessage?.({ data: message })
  }

  emitProcessorError(): void {
    this.processorErrorListener?.()
  }
}

const installAudioWorkletNode = (): void => {
  FakeAudioWorkletNode.instances = []
  FakeAudioWorkletNode.flushStrategy = 'complete'
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    value: FakeAudioWorkletNode,
    configurable: true
  })
}

const createTrack = () => ({
  stop: vi.fn()
})

const flushAsyncWork = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
}

describe('startStreamingLiveCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    installAudioWorkletNode()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('pushes timestamped worklet frames and flushes them on stop', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const sourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    }
    const gainNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 0 }
    }
    const resume = vi.fn(async () => {})
    const close = vi.fn(async () => {})
    const addModule = vi.fn(async (_url: string) => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule },
      createMediaStreamSource: vi.fn(() => sourceNode),
      createGain: vi.fn(() => gainNode),
      resume,
      close
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    expect(captureNode?.name).toBe(STREAMING_AUDIO_CAPTURE_WORKLET_NAME)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 1250
    })

    await capture.stop()

    expect(addModule).toHaveBeenCalledOnce()
    expect(String(addModule.mock.calls[0]?.[0])).toContain('streaming-audio-capture-worklet')
    expect(resume).toHaveBeenCalledOnce()
    expect(captureNode?.port.postMessage).toHaveBeenCalledWith({ type: 'flush' })
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledWith({
      sampleRateHz: 16000,
      channels: 1,
      flushReason: 'session_stop',
      frames: [
        {
          samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
          timestampMs: 1250
        }
      ]
    })
    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('cancels without flushing pending frames back through the sink', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }
    const addModule = vi.fn(async (_url: string) => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 400
    })

    await capture.cancel()

    expect(captureNode?.port.postMessage).not.toHaveBeenCalled()
    expect(sink.pushStreamingAudioFrameBatch).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('discards a below-threshold blip before the next real utterance flushes', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 10
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array(1600).fill(0.2),
      timestampMs: 0
    })
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array(1600).fill(0),
      timestampMs: 700
    })
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array(1600).fill(0.2),
      timestampMs: 1200
    })
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array(1600).fill(0.2),
      timestampMs: 1300
    })
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array(1600).fill(0),
      timestampMs: 1900
    })

    await flushAsyncWork()
    await capture.cancel()

    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenNthCalledWith(1, {
      sampleRateHz: 16000,
      channels: 1,
      flushReason: 'discard_pending',
      frames: []
    })
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      flushReason: 'speech_pause',
      frames: expect.arrayContaining([
        expect.objectContaining({ timestampMs: 1200 }),
        expect.objectContaining({ timestampMs: 1300 }),
        expect.objectContaining({ timestampMs: 1900 })
      ])
    }))
  })

  it('routes auto-batch drain failures into fatal cleanup', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockRejectedValue(new Error('push failed'))
    }
    const onFatalError = vi.fn()

    const sourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn()
    }
    const gainNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 0 }
    }
    const close = vi.fn(async () => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => sourceNode),
      createGain: vi.fn(() => gainNode),
      resume: vi.fn(async () => {}),
      close
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError,
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 1
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 1000
    })

    await flushAsyncWork()
    await flushAsyncWork()

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'push failed' }))
    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(capture).toBeDefined()
  })

  it('cleans up resources when audio worklets are unsupported', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const close = vi.fn(async () => {})

    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      value: undefined,
      configurable: true
    })

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      close
    } as unknown as AudioContext

    await expect(
      startStreamingLiveCapture({
        deviceConstraints: { channelCount: { ideal: 1 } },
        requestedSampleRateHz: 16000,
        channels: 1,
        sink: {
          pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
        },
        onFatalError: vi.fn(),
        getUserMedia: vi.fn(async () => mediaStream),
        createAudioContext: () => audioContext
      })
    ).rejects.toThrow('does not support live PCM streaming capture')

    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('cleans up the media stream and audio context if startup fails after resources are acquired', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const resumeError = new Error('resume failed')
    const close = vi.fn(async () => {})

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {
        throw resumeError
      }),
      close
    } as unknown as AudioContext

    await expect(startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink: {
        pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
      },
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })).rejects.toThrow('resume failed')

    expect(track.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not hang or surface a fatal error when the worklet errors during explicit stop', async () => {
    FakeAudioWorkletNode.flushStrategy = 'stall'

    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const onFatalError = vi.fn()

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink: {
        pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
      },
      onFatalError,
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    const stopPromise = capture.stop()
    captureNode?.emitProcessorError()

    await stopPromise
    await Promise.resolve()

    expect(onFatalError).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('times out a stalled flush and still tears down cleanly on explicit stop', async () => {
    FakeAudioWorkletNode.flushStrategy = 'stall'

    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 500
    })

    let stopResolved = false
    const stopPromise = capture.stop().then(() => {
      stopResolved = true
    })

    await Promise.resolve()
    expect(stopResolved).toBe(false)

    await vi.advanceTimersByTimeAsync(250)
    await stopPromise

    expect(captureNode?.port.postMessage).toHaveBeenCalledWith({ type: 'flush' })
    expect(sink.pushStreamingAudioFrameBatch).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(audioContext.close).toHaveBeenCalledOnce()
  })

  it('ignores late worklet frames after explicit stop begins', async () => {
    FakeAudioWorkletNode.flushStrategy = 'stall'

    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockResolvedValue(undefined)
    }

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext,
      maxFramesPerBatch: 2
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    const stopPromise = capture.stop()

    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 750
    })

    await vi.advanceTimersByTimeAsync(250)
    await stopPromise

    expect(sink.pushStreamingAudioFrameBatch).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('still tears down tracks and audio context if stop-time transport fails', async () => {
    const track = createTrack()
    const mediaStream = {
      getTracks: () => [track]
    } as unknown as MediaStream
    const sink = {
      pushStreamingAudioFrameBatch: vi.fn().mockRejectedValue(new Error('push failed during stop'))
    }

    const audioContext = {
      sampleRate: 16000,
      state: 'running',
      destination: {} as AudioDestinationNode,
      audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn()
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 }
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {})
    } as unknown as AudioContext

    const capture = await startStreamingLiveCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      requestedSampleRateHz: 16000,
      channels: 1,
      sink,
      onFatalError: vi.fn(),
      getUserMedia: vi.fn(async () => mediaStream),
      createAudioContext: () => audioContext
    })

    const captureNode = FakeAudioWorkletNode.instances.at(-1)
    captureNode?.emitMessage({
      type: 'audio_frame',
      samples: new Float32Array([0.2, 0.2, 0.2, 0.2]),
      timestampMs: 500
    })

    await capture.stop()

    expect(track.stop).toHaveBeenCalledOnce()
    expect(audioContext.close).toHaveBeenCalledOnce()
  })
})
