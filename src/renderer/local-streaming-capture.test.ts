// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLocalStreamingCaptureSession,
  interleaveFloat32ChannelsToPcm16,
  LocalPcmBatchAccumulator
} from './local-streaming-capture'

class FakeMediaStreamTrack {
  private readonly listeners = new Map<string, Set<() => void>>()

  getSettings(): MediaTrackSettings {
    return { channelCount: 1 }
  }

  addEventListener(event: string, listener: () => void): void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  removeEventListener(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  stop(): void {
    // No-op for tests.
  }

  emitEnded(): void {
    for (const listener of this.listeners.get('ended') ?? []) {
      listener()
    }
  }
}

class FakeMediaStream {
  constructor(private readonly track: FakeMediaStreamTrack) {}

  getAudioTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack]
  }

  getTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack]
  }
}

class FakeSourceNode {
  connect(): void {}
  disconnect(): void {}
}

class FakeGainNode {
  gain = { value: 1 }
  connect(): void {}
  disconnect(): void {}
}

class FakeProcessorNode {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (channelIndex: number) => Float32Array } }) => void) | null = null

  connect(): void {}
  disconnect(): void {}

  emitMonoPcm(samples: number[]): void {
    this.onaudioprocess?.({
      inputBuffer: {
        getChannelData: (_channelIndex: number) => new Float32Array(samples)
      }
    })
  }
}

class FakeAudioContext {
  readonly sampleRate = 16_000
  readonly destination = {}
  readonly processor = new FakeProcessorNode()

  createMediaStreamSource(_mediaStream: MediaStream): FakeSourceNode {
    return new FakeSourceNode()
  }

  createScriptProcessor(): FakeProcessorNode {
    return this.processor
  }

  createGain(): FakeGainNode {
    return new FakeGainNode()
  }

  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

afterEach(() => {
  vi.useRealTimers()
})

describe('interleaveFloat32ChannelsToPcm16', () => {
  it('clamps and interleaves multi-channel float samples into signed 16-bit PCM', () => {
    const pcm = interleaveFloat32ChannelsToPcm16([
      new Float32Array([-1, 0, 1]),
      new Float32Array([0.5, -0.5, 2])
    ])

    expect(Array.from(pcm)).toEqual([
      -32768, 16384,
      0, -16384,
      32767, 32767
    ])
  })
})

describe('LocalPcmBatchAccumulator', () => {
  it('holds small chunks until the target frame count is met, then flushes them together', () => {
    const batcher = new LocalPcmBatchAccumulator(1, 4)

    expect(batcher.append(new Int16Array([1, 2]))).toBeNull()
    const flushed = batcher.append(new Int16Array([3, 4]))

    expect(Array.from(flushed ?? [])).toEqual([1, 2, 3, 4])
    expect(batcher.flush()).toBeNull()
  })

  it('flushes trailing PCM when recording stops before the target batch size is reached', () => {
    const batcher = new LocalPcmBatchAccumulator(2, 4)
    batcher.append(new Int16Array([1, 2, 3, 4, 5, 6]))

    const trailing = batcher.flush()

    expect(Array.from(trailing ?? [])).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('preserves a trailing partial PCM batch when a local capture session stops', async () => {
    const fakeAudioContext = new FakeAudioContext()
    const fakeTrack = new FakeMediaStreamTrack()
    const fakeWindowTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    const appendAudio = vi.fn(async () => {})
    const stopSession = vi.fn(async () => {})

    const session = await createLocalStreamingCaptureSession({
      mediaStream: new FakeMediaStream(fakeTrack) as unknown as MediaStream,
      startedAt: '2026-03-19T00:00:00.000Z',
      startSession: vi.fn(async () => ({ sessionId: 'local-session-1' })),
      appendAudio,
      stopSession,
      cancelSession: vi.fn(async () => {}),
      createAudioContext: () => fakeAudioContext as unknown as AudioContext,
      batchDurationMs: 1_000,
      windowTarget: fakeWindowTarget
    })

    fakeAudioContext.processor.emitMonoPcm([0.5, -0.5])
    expect(appendAudio).not.toHaveBeenCalled()

    await session.stop()

    expect(appendAudio).toHaveBeenCalledTimes(1)
    const appendCalls = appendAudio.mock.calls as unknown as Array<[{ pcmFrames: Int16Array }]>
    const appendPayload = appendCalls[0][0]
    expect(Array.from(appendPayload.pcmFrames)).toEqual([16384, -16384])
    expect(stopSession).toHaveBeenCalledWith({ sessionId: 'local-session-1' })
  })

  it('fails a stuck append so stopping local capture stays responsive', async () => {
    vi.useFakeTimers()

    const fakeAudioContext = new FakeAudioContext()
    const fakeTrack = new FakeMediaStreamTrack()
    const cancelSession = vi.fn(async () => {})
    const onFatalError = vi.fn(async () => {})

    const session = await createLocalStreamingCaptureSession({
      mediaStream: new FakeMediaStream(fakeTrack) as unknown as MediaStream,
      startedAt: '2026-03-19T00:00:00.000Z',
      startSession: vi.fn(async () => ({ sessionId: 'local-session-1' })),
      appendAudio: vi.fn(() => new Promise<void>(() => {})),
      stopSession: vi.fn(async () => {}),
      cancelSession,
      onFatalError,
      createAudioContext: () => fakeAudioContext as unknown as AudioContext,
      batchDurationMs: 1_000,
      appendTimeoutMs: 5,
      windowTarget: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    })

    fakeAudioContext.processor.emitMonoPcm([0.25])
    const stopPromise = expect(session.stop()).rejects.toThrow(/append timed out/i)

    await vi.advanceTimersByTimeAsync(5)

    await stopPromise
    expect(cancelSession).toHaveBeenCalledWith({ sessionId: 'local-session-1' })
    expect(onFatalError).toHaveBeenCalledOnce()
  })

  it('cancels the active local capture session when the page hides', async () => {
    const fakeAudioContext = new FakeAudioContext()
    const fakeTrack = new FakeMediaStreamTrack()
    const cancelSession = vi.fn(async () => {})
    let pageHideListener: (() => void) | null = null
    const windowTarget = {
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === 'pagehide') {
          pageHideListener = listener
        }
      }),
      removeEventListener: vi.fn()
    }

    await createLocalStreamingCaptureSession({
      mediaStream: new FakeMediaStream(fakeTrack) as unknown as MediaStream,
      startedAt: '2026-03-19T00:00:00.000Z',
      startSession: vi.fn(async () => ({ sessionId: 'local-session-1' })),
      appendAudio: vi.fn(async () => {}),
      stopSession: vi.fn(async () => {}),
      cancelSession,
      createAudioContext: () => fakeAudioContext as unknown as AudioContext,
      windowTarget
    })

    if (!pageHideListener) {
      throw new Error('Missing pagehide listener.')
    }
    const onPageHide = pageHideListener as unknown as () => void
    onPageHide()
    await Promise.resolve()
    await Promise.resolve()

    expect(cancelSession).toHaveBeenCalledWith({ sessionId: 'local-session-1' })
    expect(windowTarget.removeEventListener).toHaveBeenCalledWith('pagehide', onPageHide)
  })

  it('cancels and reports a fatal error when the microphone track ends unexpectedly', async () => {
    const fakeAudioContext = new FakeAudioContext()
    const fakeTrack = new FakeMediaStreamTrack()
    const cancelSession = vi.fn(async () => {})
    const onFatalError = vi.fn(async () => {})

    await createLocalStreamingCaptureSession({
      mediaStream: new FakeMediaStream(fakeTrack) as unknown as MediaStream,
      startedAt: '2026-03-19T00:00:00.000Z',
      startSession: vi.fn(async () => ({ sessionId: 'local-session-1' })),
      appendAudio: vi.fn(async () => {}),
      stopSession: vi.fn(async () => {}),
      cancelSession,
      onFatalError,
      createAudioContext: () => fakeAudioContext as unknown as AudioContext,
      windowTarget: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    })

    fakeTrack.emitEnded()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(cancelSession).toHaveBeenCalledWith({ sessionId: 'local-session-1' })
    expect(onFatalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Microphone capture ended unexpectedly.' })
    )
  })
})
