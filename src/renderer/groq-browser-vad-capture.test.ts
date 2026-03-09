/*
Where: src/renderer/groq-browser-vad-capture.test.ts
What: Focused lifecycle tests for the renderer-only Groq browser VAD capture scaffold.
Why: Lock down startup, natural utterance emission, stop flush, cancel cleanup, and
     fatal-sink handling before the renderer-main transport ticket lands.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type GroqBrowserVadCapture,
  startGroqBrowserVadCapture
} from './groq-browser-vad-capture'

type SpeechProbabilities = {
  isSpeech: number
  notSpeech: number
}

type FakeVadOptions = {
  baseAssetPath?: string
  onnxWASMBasePath?: string
  startOnLoad?: boolean
  onFrameProcessed?: (probabilities: SpeechProbabilities, frame: Float32Array) => Promise<void> | void
  onSpeechStart?: () => Promise<void> | void
  onSpeechRealStart?: () => Promise<void> | void
  onSpeechEnd?: (audio: Float32Array) => Promise<void> | void
  onVADMisfire?: () => Promise<void> | void
}

class FakeMicVad {
  static instances: FakeMicVad[] = []

  static create = vi.fn(async (options: FakeVadOptions = {}) => {
    const instance = new FakeMicVad(options)
    FakeMicVad.instances.push(instance)
    return instance
  })

  readonly start = vi.fn(async () => {})
  readonly pause = vi.fn(async () => {})
  readonly destroy = vi.fn(async () => {})

  constructor(readonly options: FakeVadOptions) {}

  async emitFrame(probabilities: SpeechProbabilities, frame: Float32Array): Promise<void> {
    await this.options.onFrameProcessed?.(probabilities, frame)
  }

  async emitSpeechStart(): Promise<void> {
    await this.options.onSpeechStart?.()
  }

  async emitSpeechRealStart(): Promise<void> {
    await this.options.onSpeechRealStart?.()
  }

  async emitSpeechEnd(audio: Float32Array): Promise<void> {
    await this.options.onSpeechEnd?.(audio)
  }

  async emitMisfire(): Promise<void> {
    await this.options.onVADMisfire?.()
  }
}

describe('startGroqBrowserVadCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeMicVad.instances = []
    FakeMicVad.create.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const createCapture = async (overrides: {
    sink?: { pushStreamingAudioUtteranceChunk: ReturnType<typeof vi.fn> }
    nowMs?: () => number
    startupTimeoutMs?: number
    maxUtteranceMs?: number
    encodeWav?: (audio: Float32Array) => ArrayBuffer
    createVad?: typeof FakeMicVad.create
  } = {}): Promise<{
    capture: GroqBrowserVadCapture
    vad: FakeMicVad
    sink: { pushStreamingAudioUtteranceChunk: ReturnType<typeof vi.fn> }
  }> => {
    const sink = overrides.sink ?? {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
    }
    const capture = await startGroqBrowserVadCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError: vi.fn(),
      nowMs: overrides.nowMs ?? (() => 5_000),
      config: {
        startupTimeoutMs: overrides.startupTimeoutMs,
        maxUtteranceMs: overrides.maxUtteranceMs
      }
    }, {
      createVad: overrides.createVad ?? FakeMicVad.create,
      encodeWav: overrides.encodeWav ?? ((audio) => audio.buffer.slice(0)),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })

    return {
      capture,
      vad: FakeMicVad.instances[0]!,
      sink
    }
  }

  it('starts MicVAD with Groq-specific overrides', async () => {
    const { vad } = await createCapture()

    expect(FakeMicVad.create).toHaveBeenCalledOnce()
    expect(FakeMicVad.create.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      model: 'v5',
      startOnLoad: false,
      submitUserSpeechOnPause: false,
      baseAssetPath: expect.any(String),
      onnxWASMBasePath: expect.any(String),
      preSpeechPadMs: 400,
      redemptionMs: 900,
      minSpeechMs: 160
    }))
    const vadOptions = FakeMicVad.create.mock.calls[0]?.[0]
    expect(vadOptions?.baseAssetPath).not.toBe('/')
    expect(vadOptions?.onnxWASMBasePath).not.toBe('/')
    expect(vad.start).toHaveBeenCalledOnce()
  })

  it('emits a speech_pause utterance when MicVAD seals natural speech', async () => {
    const encodeWav = vi.fn((audio: Float32Array) => audio.buffer.slice(0))
    const { vad, sink } = await createCapture({
      nowMs: () => 7_000,
      encodeWav
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(16_000).fill(0.2))
    await vad.emitSpeechEnd(new Float32Array(16_000).fill(0.2))

    expect(encodeWav).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      sampleRateHz: 16_000,
      channels: 1,
      utteranceIndex: 0,
      wavFormat: 'wav_pcm_s16le_mono_16000',
      reason: 'speech_pause',
      source: 'browser_vad',
      startedAtMs: 6_000,
      endedAtMs: 7_000
    }))
  })

  it('flushes one stop utterance from buffered live frames when confirmed speech exists', async () => {
    const encodeWav = vi.fn((audio: Float32Array) => audio.buffer.slice(0))
    const { capture, vad, sink } = await createCapture({
      nowMs: () => 9_000,
      encodeWav
    })

    await vad.emitFrame({ isSpeech: 0.1, notSpeech: 0.9 }, new Float32Array(3_200).fill(0.01))
    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.8, notSpeech: 0.2 }, new Float32Array(3_200).fill(0.2))
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.8, notSpeech: 0.2 }, new Float32Array(3_200).fill(0.2))

    await capture.stop()

    expect(vad.pause).toHaveBeenCalledOnce()
    expect(vad.destroy).toHaveBeenCalledOnce()
    expect(encodeWav).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      utteranceIndex: 0,
      reason: 'session_stop',
      source: 'browser_vad',
      endedAtMs: 9_000
    }))
  })

  it('flushes a max_chunk utterance during long uninterrupted speech', async () => {
    const { vad, sink } = await createCapture({
      nowMs: () => 10_000,
      maxUtteranceMs: 200
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(1_600).fill(0.2))
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(1_600).fill(0.2))
    await Promise.resolve()
    await Promise.resolve()

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenCalledWith(expect.objectContaining({
      utteranceIndex: 0,
      reason: 'max_chunk',
      source: 'browser_vad'
    }))
  })

  it('waits for an in-flight max_chunk flush before emitting the final speech_pause chunk', async () => {
    const firstPushResolver: { current: (() => void) | null } = { current: null }
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async (chunk: { reason: string }) => {
        if (chunk.reason === 'max_chunk') {
          await new Promise<void>((resolve) => {
            firstPushResolver.current = resolve
          })
        }
      })
    }
    const { vad } = await createCapture({
      sink,
      maxUtteranceMs: 200
    })

    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(1_600).fill(0.2))
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(1_600).fill(0.2))
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(3_200).fill(0.2))

    const speechEndPromise = vad.emitSpeechEnd(new Float32Array(3_200).fill(0.2))
    const resolveFirstPush = firstPushResolver.current
    if (!resolveFirstPush) {
      throw new Error('Expected the max_chunk flush to be pending.')
    }
    resolveFirstPush()
    await speechEndPromise

    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenNthCalledWith(1, expect.objectContaining({
      reason: 'max_chunk'
    }))
    expect(sink.pushStreamingAudioUtteranceChunk).toHaveBeenNthCalledWith(2, expect.objectContaining({
      reason: 'speech_pause'
    }))
  })

  it('does not emit a stop utterance when speech never becomes valid', async () => {
    const { capture, vad, sink } = await createCapture()

    await vad.emitSpeechStart()
    await vad.emitFrame({ isSpeech: 0.2, notSpeech: 0.8 }, new Float32Array(800).fill(0.05))
    await capture.stop()

    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
    expect(vad.destroy).toHaveBeenCalledOnce()
  })

  it('cancels without emitting a terminal utterance', async () => {
    const { capture, vad, sink } = await createCapture()

    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(2_000).fill(0.2))
    await capture.cancel()

    expect(vad.pause).toHaveBeenCalledOnce()
    expect(vad.destroy).toHaveBeenCalledOnce()
    expect(sink.pushStreamingAudioUtteranceChunk).not.toHaveBeenCalled()
  })

  it('routes sink failures into fatal cleanup once', async () => {
    const onFatalError = vi.fn()
    const sink = {
      pushStreamingAudioUtteranceChunk: vi.fn(async () => {
        throw new Error('utterance push failed')
      })
    }
    const capture = await startGroqBrowserVadCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink,
      onFatalError,
      nowMs: () => 8_000
    }, {
      createVad: FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })

    const vad = FakeMicVad.instances[0]!
    await vad.emitSpeechStart()
    await vad.emitSpeechRealStart()
    await vad.emitFrame({ isSpeech: 0.9, notSpeech: 0.1 }, new Float32Array(4_000).fill(0.2))
    await vad.emitSpeechEnd(new Float32Array(4_000).fill(0.2))
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve()
    }

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'utterance push failed' }))
    expect(vad.pause).toHaveBeenCalledOnce()
    expect(vad.destroy).toHaveBeenCalledOnce()
    expect(capture).toBeDefined()
  })

  it('fails startup when the VAD factory never resolves', async () => {
    const never = new Promise<FakeMicVad>(() => {})

    const startupPromise = startGroqBrowserVadCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink: {
        pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
      },
      onFatalError: vi.fn(),
      config: {
        startupTimeoutMs: 250
      }
    }, {
      createVad: vi.fn(async () => await never) as unknown as typeof FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const handledStartupPromise = startupPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(250)
    const startupError = await handledStartupPromise
    expect(startupError).toEqual(expect.objectContaining({
      message: 'Timed out starting Groq browser VAD capture.'
    }))
  })

  it('destroys a MicVAD instance that resolves after the startup timeout already fired', async () => {
    const delayedVadResolver: { current: ((vad: FakeMicVad) => void) | null } = { current: null }
    const lateVad = new FakeMicVad({})

    const startupPromise = startGroqBrowserVadCapture({
      deviceConstraints: { channelCount: { ideal: 1 } },
      sink: {
        pushStreamingAudioUtteranceChunk: vi.fn(async () => {})
      },
      onFatalError: vi.fn(),
      config: {
        startupTimeoutMs: 250
      }
    }, {
      createVad: vi.fn(async () => await new Promise<FakeMicVad>((resolve) => {
        delayedVadResolver.current = resolve
      })) as unknown as typeof FakeMicVad.create,
      encodeWav: (audio) => audio.buffer.slice(0),
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }) as unknown as MediaStream)
    })
    const handledStartupPromise = startupPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(250)
    const startupError = await handledStartupPromise
    expect(startupError).toEqual(expect.objectContaining({
      message: 'Timed out starting Groq browser VAD capture.'
    }))

    const resolveLateVad = delayedVadResolver.current
    if (!resolveLateVad) {
      throw new Error('Expected createVad resolver to be captured.')
    }
    resolveLateVad(lateVad)
    await Promise.resolve()
    await Promise.resolve()

    expect(lateVad.destroy).toHaveBeenCalledOnce()
  })
})
