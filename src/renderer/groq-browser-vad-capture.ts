/*
Where: src/renderer/groq-browser-vad-capture.ts
What: Renderer-local browser VAD capture scaffold for future Groq utterance transport.
Why: Isolate Groq's browser-VAD lifecycle from the existing whisper.cpp frame-stream
     capture path so the VAD startup, stop, and asset assumptions stay testable.
*/

import { MicVAD, utils, type RealTimeVADOptions } from '@ricky0123/vad-web'
import type { StreamingAudioUtteranceChunk, StreamingSessionStopReason } from '../shared/ipc'
import {
  GROQ_BROWSER_VAD_ASSET_PATHS,
  GROQ_BROWSER_VAD_DEFAULTS,
  type GroqBrowserVadConfig
} from './groq-browser-vad-config'

export interface GroqBrowserVadSink {
  pushStreamingAudioUtteranceChunk: (chunk: Omit<StreamingAudioUtteranceChunk, 'sessionId'>) => Promise<void>
}

export interface GroqBrowserVadCapture {
  stop: (reason?: StreamingSessionStopReason) => Promise<void>
  cancel: () => Promise<void>
}

export interface GroqBrowserVadCaptureOptions {
  deviceConstraints: MediaTrackConstraints
  sink: GroqBrowserVadSink
  onFatalError: (error: unknown) => void
  nowMs?: () => number
  config?: Partial<GroqBrowserVadConfig>
}

interface MicVadLike {
  start: () => Promise<void>
  pause: () => Promise<void>
  destroy: () => Promise<void>
}

interface GroqBrowserVadCaptureDependencies {
  createVad?: (options: Partial<RealTimeVADOptions>) => Promise<MicVadLike>
  encodeWav?: (audio: Float32Array) => ArrayBuffer
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const STREAM_SAMPLE_RATE_HZ = 16_000

type SpeechFrameProbabilities = {
  isSpeech: number
  notSpeech: number
}

const concatFrames = (frames: readonly Float32Array[]): Float32Array => {
  const totalSamples = frames.reduce((sum, frame) => sum + frame.length, 0)
  const merged = new Float32Array(totalSamples)
  let writeOffset = 0
  for (const frame of frames) {
    merged.set(frame, writeOffset)
    writeOffset += frame.length
  }
  return merged
}

const cloneFrame = (frame: Float32Array): Float32Array => new Float32Array(frame)

const resolveRingFrameBudget = (config: GroqBrowserVadConfig): number =>
  Math.max(1, Math.ceil((config.preSpeechPadMs / 1000) * STREAM_SAMPLE_RATE_HZ))

const resolveMinSpeechSamples = (config: GroqBrowserVadConfig): number =>
  Math.ceil((config.minSpeechMs / 1000) * STREAM_SAMPLE_RATE_HZ)

const resolveMaxUtteranceSamples = (config: GroqBrowserVadConfig): number =>
  Math.ceil((config.maxUtteranceMs / 1000) * STREAM_SAMPLE_RATE_HZ)

class BrowserGroqVadCapture implements GroqBrowserVadCapture {
  private readonly nowMs: () => number
  private readonly sink: GroqBrowserVadSink
  private readonly onFatalError: (error: unknown) => void
  private readonly encodeWav: (audio: Float32Array) => ArrayBuffer
  private readonly config: GroqBrowserVadConfig
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout

  private vad: MicVadLike | null = null
  private stopping = false
  private stopped = false
  private fatalNotified = false
  private ignoreVadSpeechEnd = false
  private callbackGeneration = 0
  private utteranceIndex = 0
  private speechDetected = false
  private speechRealStarted = false
  private confirmedSpeechSamples = 0
  private liveFrames: Float32Array[] = []
  private liveSamples = 0
  private preSpeechFrames: Float32Array[] = []
  private preSpeechSamples = 0
  private continuationFlushInFlight = false
  private continuationFlushPromise: Promise<void> | null = null
  private nextUtteranceHadCarryover = false

  constructor(
    params: {
      sink: GroqBrowserVadSink
      onFatalError: (error: unknown) => void
      nowMs: () => number
      encodeWav: (audio: Float32Array) => ArrayBuffer
      config: GroqBrowserVadConfig
      setTimeoutFn: typeof setTimeout
      clearTimeoutFn: typeof clearTimeout
    }
  ) {
    this.sink = params.sink
    this.onFatalError = params.onFatalError
    this.nowMs = params.nowMs
    this.encodeWav = params.encodeWav
    this.config = params.config
    this.setTimeoutFn = params.setTimeoutFn
    this.clearTimeoutFn = params.clearTimeoutFn
  }

  attachVad(vad: MicVadLike): void {
    this.vad = vad
  }

  buildVadOptions(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>): Partial<RealTimeVADOptions> {
    return {
      model: this.config.model,
      positiveSpeechThreshold: this.config.positiveSpeechThreshold,
      negativeSpeechThreshold: this.config.negativeSpeechThreshold,
      redemptionMs: this.config.redemptionMs,
      preSpeechPadMs: this.config.preSpeechPadMs,
      minSpeechMs: this.config.minSpeechMs,
      startOnLoad: false,
      submitUserSpeechOnPause: false,
      baseAssetPath: GROQ_BROWSER_VAD_ASSET_PATHS.baseAssetPath,
      onnxWASMBasePath: GROQ_BROWSER_VAD_ASSET_PATHS.onnxWASMBasePath,
      ortConfig: (ort) => {
        ort.env.logLevel = 'error'
        ort.env.wasm.wasmPaths = GROQ_BROWSER_VAD_ASSET_PATHS.onnxWasmPaths
      },
      getStream: async () => await getUserMedia({
        audio: this.resolveDeviceConstraints()
      }),
      onFrameProcessed: (probabilities, frame) => {
        this.handleFrameProcessed(probabilities, frame)
      },
      onSpeechStart: () => {
        this.handleSpeechStart()
      },
      onSpeechRealStart: () => {
        this.speechRealStarted = true
      },
      onVADMisfire: () => {
        this.handleMisfire()
      },
      onSpeechEnd: async (_audio) => {
        const generation = this.callbackGeneration
        await this.handleSpeechEnd(generation)
      }
    }
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.stopped || this.stopping) {
      return
    }

    this.stopping = true
    let stopError: unknown = null

    // Stop must invalidate queued onSpeechEnd callbacks before the first await.
    this.callbackGeneration += 1
    this.ignoreVadSpeechEnd = true

    try {
      await this.vad?.pause()
      await this.awaitContinuationFlush()
      if (reason !== 'user_cancel' && reason !== 'fatal_error') {
        await this.flushStopUtterance()
      } else {
        this.resetSpeechWindow()
      }
    } catch (error) {
      stopError = error
    } finally {
      this.stopped = true
      this.stopping = false
      try {
        await this.vad?.destroy()
      } catch {
        // Destroy is best-effort during teardown only.
      }
      this.vad = null
    }

    if (stopError) {
      throw stopError
    }
  }

  async cancel(): Promise<void> {
    await this.stop('user_cancel')
  }

  private resolveDeviceConstraints(): MediaTrackConstraints {
    return this.deviceConstraints
  }

  private deviceConstraints: MediaTrackConstraints = {}

  setDeviceConstraints(constraints: MediaTrackConstraints): void {
    this.deviceConstraints = constraints
  }

  private handleSpeechStart(): void {
    this.speechDetected = true
    this.speechRealStarted = false
    this.confirmedSpeechSamples = 0
    this.liveFrames = this.preSpeechFrames.map(cloneFrame)
    this.liveSamples = this.preSpeechSamples
    this.nextUtteranceHadCarryover = false
  }

  private handleFrameProcessed(probabilities: SpeechFrameProbabilities, frame: Float32Array): void {
    const frameCopy = cloneFrame(frame)
    this.appendPreSpeechFrame(frameCopy)

    if (!this.speechDetected) {
      return
    }

    this.liveFrames.push(frameCopy)
    this.liveSamples += frame.length
    if (probabilities.isSpeech >= this.config.positiveSpeechThreshold) {
      this.confirmedSpeechSamples += frame.length
    }

    if (this.liveSamples >= resolveMaxUtteranceSamples(this.config) && this.hasValidSpeechWindow()) {
      this.flushContinuationUtterance()
    }
  }

  private handleMisfire(): void {
    if (this.stopped || this.stopping) {
      return
    }
    this.resetSpeechWindow()
  }

  private async handleSpeechEnd(generation: number): Promise<void> {
    if (this.stopped || this.stopping || this.ignoreVadSpeechEnd || generation !== this.callbackGeneration) {
      return
    }

    await this.awaitContinuationFlush()
    if (this.stopped || this.stopping || this.ignoreVadSpeechEnd || generation !== this.callbackGeneration) {
      return
    }

    if (!this.hasValidSpeechWindow() || this.liveFrames.length === 0) {
      this.resetSpeechWindow()
      return
    }

    const audio = concatFrames(this.liveFrames)
    const hadCarryover = this.nextUtteranceHadCarryover
    this.resetSpeechWindow()

    try {
      await this.pushUtterance(audio, 'speech_pause', hadCarryover)
    } catch (error) {
      this.reportFatalError(error)
    }
  }

  private appendPreSpeechFrame(frame: Float32Array): void {
    this.preSpeechFrames.push(frame)
    this.preSpeechSamples += frame.length

    const maxSamples = resolveRingFrameBudget(this.config)
    while (this.preSpeechSamples > maxSamples && this.preSpeechFrames.length > 0) {
      const removed = this.preSpeechFrames.shift()
      if (!removed) {
        break
      }
      this.preSpeechSamples -= removed.length
    }
  }

  private async flushStopUtterance(): Promise<void> {
    if (!this.hasValidSpeechWindow() || this.liveFrames.length === 0) {
      this.resetSpeechWindow()
      return
    }

    const audio = concatFrames(this.liveFrames)
    const hadCarryover = this.nextUtteranceHadCarryover
    await this.pushUtterance(audio, 'session_stop', hadCarryover)
    this.resetSpeechWindow()
  }

  private flushContinuationUtterance(): void {
    if (this.continuationFlushInFlight || this.stopped || this.stopping || !this.speechDetected) {
      return
    }
    if (!this.hasValidSpeechWindow() || this.liveFrames.length === 0) {
      return
    }

    this.continuationFlushInFlight = true
    const hadCarryover = this.nextUtteranceHadCarryover
    const audio = concatFrames(this.liveFrames)
    this.liveFrames = this.preSpeechFrames.map(cloneFrame)
    this.liveSamples = this.preSpeechSamples
    this.speechRealStarted = false
    this.confirmedSpeechSamples = 0
    this.nextUtteranceHadCarryover = this.preSpeechFrames.length > 0

    this.continuationFlushPromise = (async () => {
      try {
        await this.pushUtterance(audio, 'max_chunk', hadCarryover)
      } catch (error) {
        this.reportFatalError(error)
      } finally {
        this.continuationFlushInFlight = false
        this.continuationFlushPromise = null
      }
    })()
  }

  private async pushUtterance(
    audio: Float32Array,
    reason: Omit<StreamingAudioUtteranceChunk, 'sessionId'>['reason'],
    hadCarryover: boolean
  ): Promise<void> {
    if (audio.length === 0) {
      return
    }

    const endedAtMs = this.nowMs()
    const durationMs = (audio.length / STREAM_SAMPLE_RATE_HZ) * 1000
    const startedAtMs = Math.max(0, endedAtMs - durationMs)
    const utteranceIndex = this.utteranceIndex
    this.utteranceIndex += 1

    await this.sink.pushStreamingAudioUtteranceChunk({
      sampleRateHz: STREAM_SAMPLE_RATE_HZ,
      channels: 1,
      utteranceIndex,
      wavBytes: this.encodeWav(audio),
      wavFormat: 'wav_pcm_s16le_mono_16000',
      startedAtMs,
      endedAtMs,
      hadCarryover,
      reason,
      source: 'browser_vad'
    })
  }

  private resetSpeechWindow(): void {
    this.speechDetected = false
    this.speechRealStarted = false
    this.confirmedSpeechSamples = 0
    this.liveFrames = []
    this.liveSamples = 0
    this.continuationFlushInFlight = false
    this.nextUtteranceHadCarryover = false
  }

  private hasValidSpeechWindow(): boolean {
    return this.speechRealStarted || this.confirmedSpeechSamples >= resolveMinSpeechSamples(this.config)
  }

  private async awaitContinuationFlush(): Promise<void> {
    await this.continuationFlushPromise
  }

  private reportFatalError(error: unknown): void {
    if (this.fatalNotified || this.stopped || this.stopping) {
      return
    }
    this.fatalNotified = true
    void this.cancel().finally(() => {
      this.onFatalError(error)
    })
  }
}

const createStartupTimeout = (
  ms: number,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout,
  onExpire?: () => void
): {
  promise: Promise<never>
  dispose: () => void
} => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const promise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeoutFn(() => {
      onExpire?.()
      reject(new Error('Timed out starting Groq browser VAD capture.'))
    }, ms)
  })

  return {
    promise,
    dispose: () => {
      if (timeoutHandle) {
        clearTimeoutFn(timeoutHandle)
        timeoutHandle = null
      }
    }
  }
}

export const startGroqBrowserVadCapture = async (
  options: GroqBrowserVadCaptureOptions,
  dependencies: GroqBrowserVadCaptureDependencies = {}
): Promise<GroqBrowserVadCapture> => {
  const config: GroqBrowserVadConfig = {
    ...GROQ_BROWSER_VAD_DEFAULTS,
    ...options.config
  }
  const createVad = dependencies.createVad ?? (async (vadOptions) => await MicVAD.new(vadOptions))
  const encodeWav = dependencies.encodeWav ?? utils.encodeWAV
  const getUserMedia = dependencies.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) {
    throw new Error('This environment does not support microphone recording.')
  }

  const capture = new BrowserGroqVadCapture({
    sink: options.sink,
    onFatalError: options.onFatalError,
    nowMs: options.nowMs ?? (() => performance.now()),
    encodeWav,
    config,
    setTimeoutFn: dependencies.setTimeoutFn ?? setTimeout,
    clearTimeoutFn: dependencies.clearTimeoutFn ?? clearTimeout
  })
  capture.setDeviceConstraints(options.deviceConstraints)

  let vad: MicVadLike | null = null
  let startupExpired = false
  let startupClosed = false
  const startupTimeout = createStartupTimeout(
    config.startupTimeoutMs,
    dependencies.setTimeoutFn ?? setTimeout,
    dependencies.clearTimeoutFn ?? clearTimeout,
    () => {
      startupExpired = true
    }
  )
  const pendingVad = createVad(capture.buildVadOptions(getUserMedia)).then(
    async (createdVad) => {
      if (startupExpired || startupClosed) {
        try {
          await createdVad.destroy()
        } catch {
          // Destroy is best-effort when startup already timed out or closed.
        }
        return null
      }
      return createdVad
    },
    async (error) => {
      if (startupExpired || startupClosed) {
        return null
      }
      throw error
    }
  )

  try {
    vad = await Promise.race([
      pendingVad,
      startupTimeout.promise
    ])
    if (!vad) {
      throw new Error('Timed out starting Groq browser VAD capture.')
    }
    capture.attachVad(vad)

    await Promise.race([
      vad.start(),
      startupTimeout.promise
    ])
    return capture
  } catch (error) {
    startupClosed = true
    try {
      await vad?.destroy()
    } catch {
      // Destroy is best-effort during startup cleanup only.
    }
    throw error
  } finally {
    startupClosed = true
    startupTimeout.dispose()
    void pendingVad.catch(() => {})
  }
}
