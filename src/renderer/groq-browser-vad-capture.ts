/*
Where: src/renderer/groq-browser-vad-capture.ts
What: Thin renderer-side Groq browser VAD capture around MicVAD-sealed utterances.
Why: Remove the legacy hybrid boundary owner so normal speech-pause utterances
     come directly from MicVAD, with only a narrow stop-only flush fallback.
*/

import { MicVAD, utils, type RealTimeVADOptions } from '@ricky0123/vad-web'
import type { StreamingAudioUtteranceChunk, StreamingSessionStopReason } from '../shared/ipc'
import { logStructured } from '../shared/error-logging'
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
  sessionId: string
  deviceConstraints: MediaTrackConstraints
  sink: GroqBrowserVadSink
  onFatalError: (error: unknown) => void
  onBackpressureStateChange?: (state: { paused: boolean; durationMs?: number }) => void
  nowMs?: () => number
  nowEpochMs?: () => number
  traceEnabled?: boolean
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
const GROQ_UTTERANCE_TRACE_STORAGE_KEY = 'speech-to-text.groq-utterance-trace'

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

const encodePcm16Mono16000Wav = (audio: Float32Array): ArrayBuffer =>
  utils.encodeWAV(audio, 1, STREAM_SAMPLE_RATE_HZ, 1, 16)

const createBoundSetTimeout = (): typeof setTimeout =>
  ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
    globalThis.setTimeout(handler, timeout, ...args)) as typeof setTimeout

const createBoundClearTimeout = (): typeof clearTimeout =>
  ((timeoutId?: ReturnType<typeof setTimeout>) => {
    globalThis.clearTimeout(timeoutId)
  }) as typeof clearTimeout

type GroqVadLifecycleTraceEvent =
  | 'speech_window_opened'
  | 'speech_real_start'
  | 'first_frame_processed'
  | 'first_positive_frame'
  | 'speech_misfire'
  | 'speech_end_received'
  | 'speech_end_ignored'

class BrowserGroqVadCapture implements GroqBrowserVadCapture {
  private readonly sessionId: string
  private readonly sink: GroqBrowserVadSink
  private readonly onFatalError: (error: unknown) => void
  private readonly onBackpressureStateChange: ((state: { paused: boolean; durationMs?: number }) => void) | null
  private readonly nowMs: () => number
  private readonly nowEpochMs: () => number
  private readonly traceEnabled: boolean
  private readonly encodeWav: (audio: Float32Array) => ArrayBuffer
  private readonly config: GroqBrowserVadConfig
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout
  private readonly mediaStream: MediaStream

  private vad: MicVadLike | null = null
  private stopping = false
  private stopped = false
  private fatalNotified = false
  private ignoreVadSpeechEnd = false
  private callbackGeneration = 0
  private utteranceIndex = 0
  private speechWindowIndex = 0
  private speechActive = false
  private speechRealStarted = false
  private stopSpeechObserved = false
  private stopFrames: Float32Array[] = []
  private speechFrameCount = 0
  private speechPositiveFrameCount = 0
  private speechSamplesObserved = 0
  private activeUtterancePushPromise: Promise<void> | null = null
  private backpressureActive = false
  private backpressureStartedAtMs: number | null = null

  constructor(params: {
    sessionId: string
    sink: GroqBrowserVadSink
    onFatalError: (error: unknown) => void
    onBackpressureStateChange: ((state: { paused: boolean; durationMs?: number }) => void) | null
    nowMs: () => number
    nowEpochMs: () => number
    traceEnabled: boolean
    encodeWav: (audio: Float32Array) => ArrayBuffer
    config: GroqBrowserVadConfig
    setTimeoutFn: typeof setTimeout
    clearTimeoutFn: typeof clearTimeout
    mediaStream: MediaStream
  }) {
    this.sessionId = params.sessionId
    this.sink = params.sink
    this.onFatalError = params.onFatalError
    this.onBackpressureStateChange = params.onBackpressureStateChange
    this.nowMs = params.nowMs
    this.nowEpochMs = params.nowEpochMs
    this.traceEnabled = params.traceEnabled
    this.encodeWav = params.encodeWav
    this.config = params.config
    this.setTimeoutFn = params.setTimeoutFn
    this.clearTimeoutFn = params.clearTimeoutFn
    this.mediaStream = params.mediaStream
  }

  attachVad(vad: MicVadLike): void {
    this.vad = vad
  }

  buildVadOptions(): Partial<RealTimeVADOptions> {
    return {
      model: this.config.model,
      positiveSpeechThreshold: this.config.positiveSpeechThreshold,
      negativeSpeechThreshold: this.config.negativeSpeechThreshold,
      redemptionMs: this.config.redemptionMs,
      preSpeechPadMs: this.config.preSpeechPadMs,
      minSpeechMs: this.config.minSpeechMs,
      startOnLoad: false,
      // Normal utterance sealing now trusts MicVAD, but explicit stop still owns
      // one narrow stop-only flush path, so pause must remain passive.
      submitUserSpeechOnPause: false,
      baseAssetPath: GROQ_BROWSER_VAD_ASSET_PATHS.baseAssetPath,
      onnxWASMBasePath: GROQ_BROWSER_VAD_ASSET_PATHS.onnxWASMBasePath,
      ortConfig: (ort) => {
        ort.env.logLevel = 'error'
        ort.env.wasm.wasmPaths = GROQ_BROWSER_VAD_ASSET_PATHS.onnxWasmPaths
      },
      getStream: async () => this.mediaStream,
      onFrameProcessed: (probabilities, frame) => {
        this.handleFrameProcessed(probabilities, frame)
      },
      onSpeechStart: () => {
        this.handleSpeechStart()
      },
      onSpeechRealStart: () => {
        this.speechRealStarted = true
        this.logLifecycleTrace('speech_real_start')
      },
      onVADMisfire: () => {
        this.handleMisfire()
      },
      onSpeechEnd: async (sealedAudio) => {
        const generation = this.callbackGeneration
        await this.handleSpeechEnd(generation, sealedAudio)
      }
    }
  }

  async stop(reason: StreamingSessionStopReason = 'user_stop'): Promise<void> {
    if (this.stopped || this.stopping) {
      return
    }

    this.stopping = true
    let stopError: unknown = null

    this.callbackGeneration += 1
    this.ignoreVadSpeechEnd = true

    try {
      logStructured({
        level: 'info',
        scope: 'renderer',
        event: 'streaming.groq_vad.stop_begin',
        message: 'Stopping Groq browser VAD capture.',
        context: { reason }
      })
      await this.vad?.pause()
      await this.awaitActiveUtterancePush()
      if (reason === 'user_stop') {
        await this.flushStopUtterance()
      } else {
        this.resetStopState()
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
      this.cleanupMediaStream()
      this.clearBackpressure()
    }

    if (stopError) {
      throw stopError
    }
    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.stop_complete',
      message: 'Stopped Groq browser VAD capture.',
      context: { reason }
    })
  }

  async cancel(): Promise<void> {
    await this.stop('user_cancel')
  }

  private handleSpeechStart(): void {
    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.speech_start',
      message: 'Groq browser VAD detected a new speech window.',
      context: {
        utteranceIndex: this.utteranceIndex
      }
    })
    this.speechWindowIndex += 1
    this.speechActive = true
    this.speechRealStarted = false
    this.stopSpeechObserved = false
    this.stopFrames = []
    this.speechFrameCount = 0
    this.speechPositiveFrameCount = 0
    this.speechSamplesObserved = 0
    this.logLifecycleTrace('speech_window_opened', {
      mediaTracks: this.describeMediaTracks()
    })
  }

  private handleFrameProcessed(probabilities: SpeechFrameProbabilities, frame: Float32Array): void {
    if (!this.speechActive || this.stopped || this.stopping) {
      return
    }
    this.speechFrameCount += 1
    this.speechSamplesObserved += frame.length
    if (this.speechFrameCount === 1) {
      this.logLifecycleTrace('first_frame_processed', {
        frameSamples: frame.length,
        isSpeech: probabilities.isSpeech,
        notSpeech: probabilities.notSpeech
      })
    }
    if (probabilities.isSpeech >= this.config.positiveSpeechThreshold) {
      this.speechPositiveFrameCount += 1
      if (!this.stopSpeechObserved) {
        this.logLifecycleTrace('first_positive_frame', {
          frameSamples: frame.length,
          isSpeech: probabilities.isSpeech,
          positiveSpeechThreshold: this.config.positiveSpeechThreshold
        })
      }
      this.stopSpeechObserved = true
    }
    this.stopFrames.push(cloneFrame(frame))
  }

  private handleMisfire(): void {
    if (this.stopped || this.stopping) {
      return
    }
    this.logLifecycleTrace('speech_misfire')
    this.resetStopState()
  }

  private async handleSpeechEnd(generation: number, sealedAudio: Float32Array): Promise<void> {
    const ignoredBecause = this.resolveSpeechEndIgnoreReason(generation)
    if (ignoredBecause) {
      this.logLifecycleTrace('speech_end_ignored', {
        ignoredBecause,
        sealedSamples: sealedAudio.length,
        generation,
        callbackGeneration: this.callbackGeneration
      })
      return
    }
    if (sealedAudio.length === 0) {
      this.logLifecycleTrace('speech_end_received', {
        sealedSamples: 0
      })
      this.resetStopState()
      return
    }

    const audio = new Float32Array(sealedAudio)
    this.logLifecycleTrace('speech_end_received', {
      sealedSamples: audio.length
    })
    this.resetStopState()

    try {
      logStructured({
        level: 'info',
        scope: 'renderer',
        event: 'streaming.groq_vad.utterance_ready',
        message: 'Groq browser VAD sealed a speech_pause utterance.',
        context: {
          utteranceIndex: this.utteranceIndex,
          reason: 'speech_pause',
          samples: audio.length
        }
      })
      await this.pushUtterance(audio, 'speech_pause')
    } catch (error) {
      this.reportFatalError(error)
    }
  }

  private async flushStopUtterance(): Promise<void> {
    const hasValidPendingSpeech = this.speechRealStarted || this.stopSpeechObserved
    if (!this.speechActive || !hasValidPendingSpeech || this.stopFrames.length === 0) {
      logStructured({
        level: 'info',
        scope: 'renderer',
        event: 'streaming.groq_vad.stop_flush_skipped',
        message: 'Groq browser VAD stop flush found no valid pending speech window.',
        context: {
          utteranceIndex: this.utteranceIndex,
          speechDetected: this.speechActive,
          speechRealStarted: this.speechRealStarted,
          stopSpeechObserved: this.stopSpeechObserved,
          liveFrameCount: this.stopFrames.length
        }
      })
      this.resetStopState()
      return
    }

    const audio = concatFrames(this.stopFrames)
    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.utterance_ready',
      message: 'Groq browser VAD sealed a session_stop utterance.',
      context: {
        utteranceIndex: this.utteranceIndex,
        reason: 'session_stop',
        samples: audio.length
      }
    })
    await this.pushUtterance(audio, 'session_stop')
    this.resetStopState()
  }

  private async pushUtterance(
    audio: Float32Array,
    reason: Omit<StreamingAudioUtteranceChunk, 'sessionId'>['reason']
  ): Promise<void> {
    if (audio.length === 0) {
      return
    }

    const durationMs = (audio.length / STREAM_SAMPLE_RATE_HZ) * 1000
    const endedAtEpochMs = this.nowEpochMs()
    const startedAtEpochMs = Math.max(0, endedAtEpochMs - durationMs)
    const utteranceIndex = this.utteranceIndex
    this.utteranceIndex += 1

    const chunk = {
      sampleRateHz: STREAM_SAMPLE_RATE_HZ,
      channels: 1,
      utteranceIndex,
      wavBytes: this.encodeWav(audio),
      wavFormat: 'wav_pcm_s16le_mono_16000' as const,
      startedAtEpochMs,
      endedAtEpochMs,
      reason,
      source: 'browser_vad' as const,
      traceEnabled: this.traceEnabled || undefined
    }
    let backpressureTimeout: ReturnType<typeof setTimeout> | null = null

    try {
      this.logUtteranceTrace(chunk, 'sealed')
      backpressureTimeout = this.setTimeoutFn(() => {
        this.markBackpressureStarted()
      }, this.config.backpressureSignalMs)
      const pushPromise = this.sink.pushStreamingAudioUtteranceChunk(chunk)
      this.activeUtterancePushPromise = pushPromise
      await pushPromise
      this.logUtteranceTrace(chunk, 'sent')
    } catch (error) {
      this.logUtteranceTrace(chunk, 'fatal')
      throw error
    } finally {
      this.activeUtterancePushPromise = null
      if (backpressureTimeout) {
        this.clearTimeoutFn(backpressureTimeout)
      }
      this.markBackpressureResolved()
    }
  }

  private resetStopState(): void {
    this.speechActive = false
    this.speechRealStarted = false
    this.stopSpeechObserved = false
    this.stopFrames = []
    this.speechFrameCount = 0
    this.speechPositiveFrameCount = 0
    this.speechSamplesObserved = 0
  }

  private async awaitActiveUtterancePush(): Promise<void> {
    await this.activeUtterancePushPromise
  }

  private markBackpressureStarted(): void {
    if (this.backpressureActive) {
      return
    }
    this.backpressureActive = true
    this.backpressureStartedAtMs = this.nowMs()
    logStructured({
      level: 'warn',
      scope: 'renderer',
      event: 'streaming.groq_vad.backpressure_pause',
      message: 'Pausing Groq utterance delivery until the upload queue drains.',
      context: {
        backpressureSignalMs: this.config.backpressureSignalMs
      }
    })
    this.onBackpressureStateChange?.({ paused: true })
  }

  private markBackpressureResolved(): void {
    if (!this.backpressureActive) {
      return
    }
    const durationMs = this.backpressureStartedAtMs === null
      ? undefined
      : Math.max(0, this.nowMs() - this.backpressureStartedAtMs)
    this.backpressureActive = false
    this.backpressureStartedAtMs = null
    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.backpressure_resume',
      message: 'Groq utterance delivery resumed after upload backpressure.',
      context: {
        durationMs
      }
    })
    this.onBackpressureStateChange?.({ paused: false, durationMs })
  }

  private clearBackpressure(): void {
    this.backpressureActive = false
    this.backpressureStartedAtMs = null
  }

  private cleanupMediaStream(): void {
    for (const track of this.mediaStream.getTracks()) {
      try {
        track.stop()
      } catch {
        // Track cleanup is best-effort during teardown only.
      }
    }
  }

  private reportFatalError(error: unknown): void {
    if (this.fatalNotified || this.stopped || this.stopping) {
      return
    }
    this.fatalNotified = true
    void this.stop('fatal_error').finally(() => {
      this.onFatalError(error)
    })
  }

  private logUtteranceTrace(
    chunk: Omit<StreamingAudioUtteranceChunk, 'sessionId'>,
    result: 'sealed' | 'sent' | 'fatal'
  ): void {
    if (!this.traceEnabled) {
      return
    }

    logStructured({
      level: result === 'fatal' ? 'warn' : 'info',
      scope: 'renderer',
      event: 'streaming.groq_utterance_trace',
      message: 'Groq utterance handoff trace.',
      context: {
        sessionId: this.sessionId,
        utteranceIndex: chunk.utteranceIndex,
        reason: chunk.reason,
        wavBytesByteLength: chunk.wavBytes.byteLength,
        endedAtEpochMs: chunk.endedAtEpochMs,
        result
      }
    })
  }

  private logLifecycleTrace(
    event: GroqVadLifecycleTraceEvent,
    extraContext: Record<string, unknown> = {}
  ): void {
    if (!this.traceEnabled) {
      return
    }

    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.lifecycle_trace',
      message: 'Groq browser VAD lifecycle trace.',
      context: {
        sessionId: this.sessionId,
        traceEvent: event,
        utteranceIndex: this.utteranceIndex,
        speechWindowIndex: this.speechWindowIndex,
        callbackGeneration: this.callbackGeneration,
        speechActive: this.speechActive,
        speechRealStarted: this.speechRealStarted,
        stopSpeechObserved: this.stopSpeechObserved,
        speechFrameCount: this.speechFrameCount,
        speechPositiveFrameCount: this.speechPositiveFrameCount,
        speechSamplesObserved: this.speechSamplesObserved,
        ...extraContext
      }
    })
  }

  private resolveSpeechEndIgnoreReason(generation: number):
    | 'stopped'
    | 'stopping'
    | 'ignore_vad_speech_end'
    | 'generation_mismatch'
    | null {
    if (this.stopped) {
      return 'stopped'
    }
    if (this.stopping) {
      return 'stopping'
    }
    if (this.ignoreVadSpeechEnd) {
      return 'ignore_vad_speech_end'
    }
    if (generation !== this.callbackGeneration) {
      return 'generation_mismatch'
    }
    return null
  }

  private describeMediaTracks(): Array<{
    kind: string
    enabled: boolean
    muted: boolean
    readyState: string
  }> {
    return this.mediaStream.getTracks().map((track) => ({
      kind: track.kind,
      enabled: track.enabled,
      muted: 'muted' in track ? Boolean(track.muted) : false,
      readyState: track.readyState
    }))
  }
}

const resolveGroqUtteranceTraceEnabled = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(GROQ_UTTERANCE_TRACE_STORAGE_KEY) === '1'
  } catch {
    return false
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

const cleanupMediaStream = (mediaStream: MediaStream): void => {
  for (const track of mediaStream.getTracks()) {
    try {
      track.stop()
    } catch {
      // Track cleanup is best-effort during startup cleanup only.
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
  const encodeWav = dependencies.encodeWav ?? encodePcm16Mono16000Wav
  const getUserMedia = dependencies.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  const setTimeoutFn = dependencies.setTimeoutFn ?? createBoundSetTimeout()
  const clearTimeoutFn = dependencies.clearTimeoutFn ?? createBoundClearTimeout()
  if (!getUserMedia) {
    throw new Error('This environment does not support microphone recording.')
  }

  let startupExpired = false
  let startupClosed = false
  const startupTimeout = createStartupTimeout(
    config.startupTimeoutMs,
    setTimeoutFn,
    clearTimeoutFn,
    () => {
      startupExpired = true
    }
  )

  logStructured({
    level: 'info',
    scope: 'renderer',
    event: 'streaming.groq_vad.start_begin',
    message: 'Starting Groq browser VAD capture.',
    context: {
      startupTimeoutMs: config.startupTimeoutMs,
      submitUserSpeechOnPause: false
    }
  })

  let mediaStream: MediaStream | null = null
  let vad: MicVadLike | null = null
  let pendingStream: Promise<MediaStream | null> = Promise.resolve(null)
  let pendingVad: Promise<MicVadLike | null> = Promise.resolve(null)

  try {
    pendingStream = getUserMedia({
      audio: options.deviceConstraints
    }).then(
      async (createdStream) => {
        if (startupExpired || startupClosed) {
          cleanupMediaStream(createdStream)
          return null
        }
        return createdStream
      },
      async (error) => {
        if (startupExpired || startupClosed) {
          return null
        }
        throw error
      }
    )

    mediaStream = await Promise.race([
      pendingStream,
      startupTimeout.promise
    ])
    if (!mediaStream) {
      throw new Error('Timed out starting Groq browser VAD capture.')
    }

    const capture = new BrowserGroqVadCapture({
      sessionId: options.sessionId,
      sink: options.sink,
      onFatalError: options.onFatalError,
      onBackpressureStateChange: options.onBackpressureStateChange ?? null,
      nowMs: options.nowMs ?? (() => performance.now()),
      nowEpochMs: options.nowEpochMs ?? (() => Date.now()),
      traceEnabled: options.traceEnabled ?? resolveGroqUtteranceTraceEnabled(),
      encodeWav,
      config,
      setTimeoutFn,
      clearTimeoutFn,
      mediaStream
    })

    pendingVad = createVad(capture.buildVadOptions()).then(
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
    logStructured({
      level: 'info',
      scope: 'renderer',
      event: 'streaming.groq_vad.start_complete',
      message: 'Started Groq browser VAD capture.'
    })
    return capture
  } catch (error) {
    logStructured({
      level: 'error',
      scope: 'renderer',
      event: 'streaming.groq_vad.start_failed',
      message: 'Failed to start Groq browser VAD capture.',
      error
    })
    startupClosed = true
    try {
      await vad?.destroy()
    } catch {
      // Destroy is best-effort during startup cleanup only.
    }
    if (mediaStream) {
      cleanupMediaStream(mediaStream)
    }
    throw error
  } finally {
    startupClosed = true
    startupTimeout.dispose()
    void pendingStream.catch(() => {})
    void pendingVad.catch(() => {})
  }
}
