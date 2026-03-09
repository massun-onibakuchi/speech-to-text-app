/**
 * Where: src/main/services/streaming/groq-rolling-upload-adapter.ts
 * What:  Rolling-upload streaming adapter for Groq audio transcriptions.
 * Why:   Groq's official surface is file-based transcription, so PR-7 models it
 *        honestly as pause-bounded chunk upload with ordered result emission.
 */

import { Buffer } from 'node:buffer'
import type { SecretStore } from '../secret-store'
import { resolveProviderEndpoint } from '../endpoint-resolver'
import type {
  StreamingAudioChunkFlushReason,
  StreamingAudioFrame,
  StreamingAudioFrameBatch,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import { resolveTranscriptionLanguageOverride } from '../transcription/types'
import {
  DEFAULT_GROQ_CHUNK_WINDOW_POLICY,
  resolveOverlapMsForFlushReason,
  tailFramesForOverlap,
  type ChunkWindowPolicy
} from './chunk-window-policy'
import type {
  ProviderFinalSegmentInput,
  StreamingProviderRuntime,
  StreamingProviderRuntimeCallbacks,
  StreamingSessionStartConfig
} from './types'

interface GroqRollingUploadAdapterParams {
  sessionId: string
  config: StreamingSessionStartConfig
  callbacks: StreamingProviderRuntimeCallbacks
}

export interface GroqRollingUploadAdapterDependencies {
  secretStore: Pick<SecretStore, 'getApiKey'>
  fetchFn?: typeof fetch
  delayMs?: (ms: number) => Promise<void>
  stopBudgetDelayMs?: (ms: number) => Promise<void>
  chunkWindowPolicy?: ChunkWindowPolicy
}

interface GroqVerboseResponse {
  text?: string
  segments?: Array<{
    id?: number
    start?: number
    end?: number
    text?: string
  }>
}

interface PendingChunkUpload {
  chunkIndex: number
  flushReason: StreamingAudioChunkFlushReason
  sampleRateHz: number
  channels: number
  liveFrames: StreamingAudioFrame[]
  carryoverFrames: StreamingAudioFrame[]
}

interface CompletedChunkUpload {
  chunkIndex: number
  flushReason: StreamingAudioChunkFlushReason
  hadCarryover: boolean
  chunkStartMs: number
  chunkEndMs: number
  response: GroqVerboseResponse
}

const GROQ_DEFAULT_BASE = 'https://api.groq.com'
const GROQ_STT_PATH = '/openai/v1/audio/transcriptions'
const GROQ_USER_STOP_BUDGET_MS = 3_000

export class GroqRollingUploadAdapter implements StreamingProviderRuntime {
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly fetchFn: typeof fetch
  private readonly delayMs: (ms: number) => Promise<void>
  private readonly stopBudgetDelayMs: (ms: number) => Promise<void>
  private readonly chunkWindowPolicy: ChunkWindowPolicy
  private readonly currentChunkFrames: StreamingAudioFrame[] = []
  private currentSampleRateHz = 0
  private currentChannels = 1
  private carryoverFrames: StreamingAudioFrame[] = []
  private nextChunkIndex = 0
  private nextChunkIndexToEmit = 0
  private readonly completedChunks = new Map<number, CompletedChunkUpload>()
  private readonly inFlightChunkPromises = new Map<number, Promise<void>>()
  private readonly abortControllers = new Map<number, AbortController>()
  private drainingCompletedChunks = false
  private stopDrainTimedOut = false
  private stopped = false
  private lastCommittedEndedAtMs = Number.NEGATIVE_INFINITY
  private lastCommittedTextTail = ''

  constructor(
    private readonly params: GroqRollingUploadAdapterParams,
    dependencies: GroqRollingUploadAdapterDependencies
  ) {
    this.secretStore = dependencies.secretStore
    this.fetchFn = dependencies.fetchFn ?? fetch
    this.delayMs = dependencies.delayMs ?? (async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)))
    this.stopBudgetDelayMs =
      dependencies.stopBudgetDelayMs ?? (async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)))
    this.chunkWindowPolicy = dependencies.chunkWindowPolicy ?? DEFAULT_GROQ_CHUNK_WINDOW_POLICY
  }

  async start(): Promise<void> {
    if (this.params.config.transport !== 'rolling_upload') {
      throw new Error(`Groq rolling upload requires transport=rolling_upload. Received ${this.params.config.transport}.`)
    }
    if (this.params.config.apiKeyRef !== 'groq') {
      throw new Error(`Groq rolling upload requires processing.streaming.apiKeyRef='groq'. Received ${this.params.config.apiKeyRef ?? 'null'}.`)
    }
    this.requireApiKey()
  }

  async stop(reason: StreamingSessionStopReason): Promise<void> {
    this.stopped = true
    this.stopDrainTimedOut = false

    if (reason === 'user_cancel' || reason === 'fatal_error') {
      this.abortOutstandingUploads()
      this.clearPendingStopBuffers()
      return
    }

    if (this.currentChunkFrames.length > 0) {
      this.scheduleChunkUpload('session_stop')
    }

    const finishStopDrainPromise = this.finishStopDrain().catch((error) => {
      if (this.stopDrainTimedOut) {
        return
      }
      throw error
    })
    const outcome = await Promise.race([
      finishStopDrainPromise.then(() => 'completed' as const),
      this.stopBudgetDelayMs(GROQ_USER_STOP_BUDGET_MS).then(() => 'timed_out' as const)
    ])
    if (outcome === 'timed_out') {
      this.stopDrainTimedOut = true
      this.abortOutstandingUploads()
      this.clearPendingStopBuffers()
      return
    }

    await finishStopDrainPromise
  }

  async pushAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void> {
    if (this.stopped) {
      throw new Error('Groq rolling upload runtime is already stopped.')
    }
    if (batch.channels !== 1) {
      throw new Error(`Groq rolling upload currently requires mono audio. Received channels=${batch.channels}.`)
    }
    if (batch.flushReason === 'discard_pending') {
      this.currentChunkFrames.length = 0
      this.carryoverFrames = []
      return
    }
    if (batch.frames.length === 0) {
      return
    }

    if (this.currentChunkFrames.length === 0) {
      this.currentSampleRateHz = batch.sampleRateHz
      this.currentChannels = batch.channels
    }
    this.currentChunkFrames.push(...batch.frames.map(cloneFrame))

    if (batch.flushReason !== null) {
      this.scheduleChunkUpload(batch.flushReason)
    }
  }

  private scheduleChunkUpload(flushReason: StreamingAudioChunkFlushReason): void {
    if (this.currentChunkFrames.length === 0) {
      return
    }

    const chunk: PendingChunkUpload = {
      chunkIndex: this.nextChunkIndex,
      flushReason,
      sampleRateHz: this.currentSampleRateHz,
      channels: this.currentChannels,
      liveFrames: this.currentChunkFrames.splice(0, this.currentChunkFrames.length),
      carryoverFrames: this.carryoverFrames.map(cloneFrame)
    }
    this.nextChunkIndex += 1

    const overlapMs = resolveOverlapMsForFlushReason(flushReason, this.chunkWindowPolicy)
    this.carryoverFrames =
      overlapMs > 0 ? tailFramesForOverlap(chunk.liveFrames, chunk.sampleRateHz, overlapMs) : []

    const uploadPromise = this.uploadChunk(chunk)
      .catch(async (error) => {
        if (isAbortError(error) && this.stopped) {
          return
        }
        await this.params.callbacks.onFailure({
          code: 'groq_chunk_upload_failed',
          message: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        this.inFlightChunkPromises.delete(chunk.chunkIndex)
        this.abortControllers.delete(chunk.chunkIndex)
      })

    this.inFlightChunkPromises.set(chunk.chunkIndex, uploadPromise)
  }

  private async uploadChunk(chunk: PendingChunkUpload): Promise<void> {
    const frames = [...chunk.carryoverFrames, ...chunk.liveFrames]
    const chunkStartMs = frames[0]?.timestampMs ?? 0
    const chunkEndMs = resolveChunkEndMs(frames, chunk.sampleRateHz)
    const body = createWavBlob(frames, chunk.sampleRateHz, chunk.channels)
    const endpoint = resolveProviderEndpoint(
      GROQ_DEFAULT_BASE,
      GROQ_STT_PATH,
      this.params.config.baseUrlOverride ?? null
    )
    const apiKey = this.requireApiKey()
    const abortController = new AbortController()
    this.abortControllers.set(chunk.chunkIndex, abortController)

    let attempt = 0
    while (true) {
      attempt += 1
      const formData = new FormData()
      formData.append('model', this.params.config.model)
      formData.append('file', body, `streaming-chunk-${chunk.chunkIndex}.wav`)
      formData.append('response_format', 'verbose_json')
      formData.append('timestamp_granularities[]', 'segment')

      const language = resolveTranscriptionLanguageOverride(this.params.config.language ?? 'auto')
      if (language) {
        formData.append('language', language)
      }

      const response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData,
        signal: abortController.signal
      })

      if (!response.ok) {
        const detail = await response.text()
        if (shouldRetryResponse(response.status, attempt, this.chunkWindowPolicy.maxRetryCount)) {
          await this.delayMs(this.chunkWindowPolicy.retryBackoffMs)
          continue
        }
        throw new Error(`Groq rolling upload failed with status ${response.status}: ${detail}`)
      }

      const data = (await response.json()) as GroqVerboseResponse
      if (this.stopDrainTimedOut) {
        return
      }
      this.completedChunks.set(chunk.chunkIndex, {
        chunkIndex: chunk.chunkIndex,
        flushReason: chunk.flushReason,
        hadCarryover: chunk.carryoverFrames.length > 0,
        chunkStartMs,
        chunkEndMs,
        response: data
      })
      await this.drainCompletedChunks()
      return
    }
  }

  private async drainCompletedChunks(): Promise<void> {
    if (this.drainingCompletedChunks) {
      return
    }

    this.drainingCompletedChunks = true
    let shouldDrainAgain = false
    try {
      if (this.stopDrainTimedOut) {
        this.completedChunks.clear()
        return
      }
      while (this.completedChunks.has(this.nextChunkIndexToEmit)) {
        if (this.stopDrainTimedOut) {
          this.completedChunks.clear()
          return
        }
        const completedChunk = this.completedChunks.get(this.nextChunkIndexToEmit)
        this.completedChunks.delete(this.nextChunkIndexToEmit)
        this.nextChunkIndexToEmit += 1
        if (!completedChunk) {
          continue
        }

        const segments = this.buildFinalSegments(completedChunk)
        for (const segment of segments) {
          if (this.stopDrainTimedOut) {
            return
          }
          await this.params.callbacks.onFinalSegment(segment)
        }
      }
      shouldDrainAgain = this.completedChunks.has(this.nextChunkIndexToEmit)
    } finally {
      this.drainingCompletedChunks = false
    }

    if (shouldDrainAgain) {
      await this.drainCompletedChunks()
    }
  }

  private buildFinalSegments(chunk: CompletedChunkUpload): ProviderFinalSegmentInput[] {
    const sequenceBase = chunk.chunkIndex * this.chunkWindowPolicy.sequenceStride
    const segments = chunk.response.segments ?? []
    if (segments.length > 0) {
      const finalizedSegments: ProviderFinalSegmentInput[] = []
      let offset = 0
      for (const segment of segments) {
        if (typeof segment.start !== 'number' || typeof segment.end !== 'number' || typeof segment.text !== 'string') {
          continue
        }

        const absoluteStartedAtMs = chunk.chunkStartMs + Math.round(segment.start * 1000)
        const absoluteEndedAtMs = chunk.chunkStartMs + Math.round(segment.end * 1000)
        if (absoluteEndedAtMs <= this.lastCommittedEndedAtMs) {
          continue
        }

        let text = segment.text.trim()
        if (absoluteStartedAtMs < this.lastCommittedEndedAtMs) {
          text = trimOverlappingPrefix(text, this.lastCommittedTextTail)
        }
        if (text.length === 0) {
          continue
        }

        finalizedSegments.push({
          sessionId: this.params.sessionId,
          sequence: sequenceBase + offset,
          text,
          startedAt: new Date(absoluteStartedAtMs).toISOString(),
          endedAt: new Date(absoluteEndedAtMs).toISOString()
        })
        offset += 1
        this.rememberCommittedText(text, absoluteEndedAtMs)
      }

      if (finalizedSegments.length > 0) {
        return finalizedSegments
      }
    }

    let text = (chunk.response.text ?? '').trim()
    if (chunk.hadCarryover) {
      text = trimOverlappingPrefix(text, this.lastCommittedTextTail)
    }
    if (text.length === 0) {
      return []
    }

    this.rememberCommittedText(text, chunk.chunkEndMs)
    return [{
      sessionId: this.params.sessionId,
      sequence: sequenceBase,
      text,
      startedAt: new Date(chunk.chunkStartMs).toISOString(),
      endedAt: new Date(chunk.chunkEndMs).toISOString()
    }]
  }

  private rememberCommittedText(text: string, endedAtMs: number): void {
    this.lastCommittedEndedAtMs = Math.max(this.lastCommittedEndedAtMs, endedAtMs)
    const nextTail = `${this.lastCommittedTextTail} ${text}`.trim()
    this.lastCommittedTextTail = nextTail.slice(-160)
  }

  private async finishStopDrain(): Promise<void> {
    await Promise.allSettled(this.inFlightChunkPromises.values())
    if (this.stopDrainTimedOut) {
      return
    }
    await this.drainCompletedChunks()
  }

  private requireApiKey(): string {
    const apiKey = this.secretStore.getApiKey('groq')
    if (!apiKey) {
      throw new Error('Groq rolling upload requires a saved Groq API key.')
    }
    return apiKey
  }

  private abortOutstandingUploads(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort()
    }
    this.abortControllers.clear()
    this.inFlightChunkPromises.clear()
  }

  private clearPendingStopBuffers(): void {
    this.completedChunks.clear()
    this.currentChunkFrames.length = 0
    this.carryoverFrames = []
  }
}

const cloneFrame = (frame: StreamingAudioFrame): StreamingAudioFrame => ({
  samples: frame.samples.slice(),
  timestampMs: frame.timestampMs
})

const resolveChunkEndMs = (frames: readonly StreamingAudioFrame[], sampleRateHz: number): number => {
  const lastFrame = frames.at(-1)
  if (!lastFrame || sampleRateHz <= 0) {
    return frames[0]?.timestampMs ?? 0
  }
  const frameDurationMs = (lastFrame.samples.length / sampleRateHz) * 1000
  return lastFrame.timestampMs + Math.round(frameDurationMs)
}

const createWavBlob = (frames: readonly StreamingAudioFrame[], sampleRateHz: number, channels: number): Blob => {
  const pcmSamples = frames.reduce((total, frame) => total + frame.samples.length, 0)
  const pcmBytes = Buffer.alloc(pcmSamples * 2)
  let offset = 0

  for (const frame of frames) {
    for (const sample of frame.samples) {
      const clamped = Math.max(-1, Math.min(1, sample))
      const pcm = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
      pcmBytes.writeInt16LE(pcm, offset)
      offset += 2
    }
  }

  const wavBuffer = Buffer.alloc(44 + pcmBytes.length)
  wavBuffer.write('RIFF', 0)
  wavBuffer.writeUInt32LE(36 + pcmBytes.length, 4)
  wavBuffer.write('WAVE', 8)
  wavBuffer.write('fmt ', 12)
  wavBuffer.writeUInt32LE(16, 16)
  wavBuffer.writeUInt16LE(1, 20)
  wavBuffer.writeUInt16LE(channels, 22)
  wavBuffer.writeUInt32LE(sampleRateHz, 24)
  wavBuffer.writeUInt32LE(sampleRateHz * channels * 2, 28)
  wavBuffer.writeUInt16LE(channels * 2, 32)
  wavBuffer.writeUInt16LE(16, 34)
  wavBuffer.write('data', 36)
  wavBuffer.writeUInt32LE(pcmBytes.length, 40)
  pcmBytes.copy(wavBuffer, 44)

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

const trimOverlappingPrefix = (text: string, previousTail: string): string => {
  const nextText = text.trim()
  const tail = previousTail.trim()
  if (nextText.length === 0 || tail.length === 0) {
    return nextText
  }

  const maxLength = Math.min(nextText.length, tail.length, 80)
  for (let length = maxLength; length >= 4; length -= 1) {
    const previousSuffix = tail.slice(-length).toLowerCase()
    const nextPrefix = nextText.slice(0, length).toLowerCase()
    if (previousSuffix === nextPrefix) {
      return nextText.slice(length).trimStart()
    }
  }

  return nextText
}

const shouldRetryResponse = (status: number, attempt: number, maxRetryCount: number): boolean =>
  attempt <= maxRetryCount && (status === 429 || status >= 500)

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'
