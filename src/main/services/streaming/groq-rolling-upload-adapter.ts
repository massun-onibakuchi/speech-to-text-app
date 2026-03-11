/**
 * Where: src/main/services/streaming/groq-rolling-upload-adapter.ts
 * What:  Rolling-upload streaming adapter for Groq browser-VAD utterances.
 * Why:   Groq is still file-style upload, but the utterance-native path now
 *        separates upload backpressure from downstream output commit latency.
 */

import { Buffer } from 'node:buffer'
import type { SecretStore } from '../secret-store'
import { resolveProviderEndpoint } from '../endpoint-resolver'
import type {
  StreamingAudioFrameBatch,
  StreamingAudioUtteranceChunk,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import { resolveTranscriptionLanguageOverride } from '../transcription/types'
import {
  DEFAULT_GROQ_CHUNK_WINDOW_POLICY,
  type ChunkWindowPolicy
} from './chunk-window-policy'
import { logStructured } from '../../../shared/error-logging'
import type {
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

interface PendingUtteranceUpload {
  utteranceIndex: number
  body: Blob
  hadCarryover: boolean
  startedAtEpochMs: number
  endedAtEpochMs: number
}

interface CompletedUtteranceUpload {
  utteranceIndex: number
  hadCarryover: boolean
  startedAtEpochMs: number
  endedAtEpochMs: number
  response: GroqVerboseResponse
}

interface NormalizedGroqUtteranceText {
  text: string
  startedAtEpochMs: number
  endedAtEpochMs: number
}

const GROQ_DEFAULT_BASE = 'https://api.groq.com'
const GROQ_STT_PATH = '/openai/v1/audio/transcriptions'
const GROQ_USER_STOP_BUDGET_MS = 3_000
const PCM16_WAV_HEADER_SIZE_BYTES = 44

const assertPcm16Mono16000WavBytes = (wavBytes: ArrayBuffer): void => {
  if (wavBytes.byteLength < PCM16_WAV_HEADER_SIZE_BYTES) {
    throw new Error('Groq rolling upload requires a complete WAV header.')
  }

  const view = new DataView(wavBytes)
  const readAscii = (offset: number, length: number): string =>
    String.fromCharCode(...Array.from({ length }, (_value, index) => view.getUint8(offset + index)))

  if (readAscii(0, 4) !== 'RIFF' || readAscii(8, 4) !== 'WAVE' || readAscii(12, 4) !== 'fmt ') {
    throw new Error('Groq rolling upload requires RIFF/WAVE utterances.')
  }
  if (view.getUint16(20, true) !== 1) {
    throw new Error('Groq rolling upload requires PCM WAV encoding.')
  }
  if (view.getUint16(22, true) !== 1) {
    throw new Error('Groq rolling upload currently requires mono WAV utterances.')
  }
  if (view.getUint32(24, true) !== 16_000) {
    throw new Error('Groq rolling upload requires 16 kHz WAV utterances.')
  }
  if (view.getUint16(34, true) !== 16) {
    throw new Error('Groq rolling upload requires 16-bit PCM WAV utterances.')
  }
}

export class GroqRollingUploadAdapter implements StreamingProviderRuntime {
  private readonly secretStore: Pick<SecretStore, 'getApiKey'>
  private readonly fetchFn: typeof fetch
  private readonly delayMs: (ms: number) => Promise<void>
  private readonly stopBudgetDelayMs: (ms: number) => Promise<void>
  private readonly chunkWindowPolicy: ChunkWindowPolicy
  private readonly pendingUtterances: PendingUtteranceUpload[] = []
  private readonly completedUtterances: CompletedUtteranceUpload[] = []
  private readonly queueCapacityWaiters = new Set<() => void>()
  private nextExpectedUtteranceIndex = 0
  private nextSequence = 0
  private queuePumpPromise: Promise<void> | null = null
  private emitPumpPromise: Promise<void> | null = null
  private activeAbortController: AbortController | null = null
  private activeEmit = false
  private stopUploadTimedOut = false
  private stopped = false
  private rendererStopPrepared = false
  private lastCommittedEndedAtEpochMs = Number.NEGATIVE_INFINITY
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
    this.stopUploadTimedOut = false

    if (reason === 'user_cancel' || reason === 'fatal_error') {
      this.abortOutstandingUploads()
      this.clearPendingStopBuffers()
      return
    }

    const uploadDrainPromise = this.queuePumpPromise ?? Promise.resolve()
    const outcome = await Promise.race([
      uploadDrainPromise.then(() => 'completed' as const),
      this.stopBudgetDelayMs(GROQ_USER_STOP_BUDGET_MS).then(() => 'timed_out' as const)
    ])
    if (outcome === 'timed_out') {
      this.stopUploadTimedOut = true
      logStructured({
        level: 'warn',
        scope: 'main',
        event: 'streaming.groq_upload.stop_budget_timed_out',
        message: 'Groq stop budget expired while waiting for upload drain.',
        context: {
          sessionId: this.params.sessionId,
          timeoutMs: GROQ_USER_STOP_BUDGET_MS,
          queuedUtterances: this.getQueuedUtteranceCount()
        }
      })
      this.abortOutstandingUploads()
      this.pendingUtterances.length = 0
      this.notifyQueueCapacityAvailable()
      await this.emitPumpPromise
      return
    }

    const commitDrainOutcome = await Promise.race([
      this.finishStopDrain().then(() => 'completed' as const),
      this.stopBudgetDelayMs(GROQ_USER_STOP_BUDGET_MS).then(() => 'timed_out' as const)
    ])
    if (commitDrainOutcome === 'timed_out') {
      throw new Error(`Groq final segment commit timed out after ${GROQ_USER_STOP_BUDGET_MS} ms.`)
    }
  }

  async prepareForRendererStop(reason: StreamingSessionStopReason): Promise<void> {
    if (reason !== 'user_stop' || this.stopped) {
      return
    }
    this.rendererStopPrepared = true
    this.notifyQueueCapacityAvailable()
  }

  async pushAudioFrameBatch(batch: StreamingAudioFrameBatch): Promise<void> {
    void batch
    throw new Error('Groq rolling upload only accepts browser-VAD utterance chunks.')
  }

  async pushAudioUtteranceChunk(chunk: StreamingAudioUtteranceChunk): Promise<void> {
    if (this.stopped) {
      throw new Error('Groq rolling upload runtime is already stopped.')
    }
    if (chunk.channels !== 1) {
      throw new Error(`Groq rolling upload currently requires mono audio. Received channels=${chunk.channels}.`)
    }
    if (chunk.wavFormat !== 'wav_pcm_s16le_mono_16000') {
      throw new Error(`Groq rolling upload requires wav_pcm_s16le_mono_16000 utterances. Received ${chunk.wavFormat}.`)
    }
    assertPcm16Mono16000WavBytes(chunk.wavBytes)
    if (chunk.utteranceIndex !== this.nextExpectedUtteranceIndex) {
      throw new Error(`Groq rolling upload expected utteranceIndex=${this.nextExpectedUtteranceIndex}, received ${chunk.utteranceIndex}.`)
    }
    await this.waitForQueueCapacity(chunk.utteranceIndex)

    this.nextExpectedUtteranceIndex += 1
    this.publishDebug('info', 'streaming.groq_upload.accepted', 'Accepted Groq utterance chunk for upload.', {
      utteranceIndex: chunk.utteranceIndex,
      reason: chunk.reason,
      startedAtEpochMs: chunk.startedAtEpochMs,
      endedAtEpochMs: chunk.endedAtEpochMs,
      hadCarryover: chunk.hadCarryover
    })
    this.pendingUtterances.push({
      utteranceIndex: chunk.utteranceIndex,
      body: new Blob([Buffer.from(chunk.wavBytes)], { type: 'audio/wav' }),
      hadCarryover: chunk.hadCarryover,
      startedAtEpochMs: chunk.startedAtEpochMs,
      endedAtEpochMs: chunk.endedAtEpochMs
    })
    this.ensureQueuePump()
  }

  private ensureQueuePump(): void {
    if (this.queuePumpPromise) {
      return
    }

    this.queuePumpPromise = this.pumpQueue()
      .finally(() => {
        this.queuePumpPromise = null
        if (!this.stopUploadTimedOut && this.pendingUtterances.length > 0) {
          this.ensureQueuePump()
        }
      })
  }

  private async pumpQueue(): Promise<void> {
    while (!this.stopUploadTimedOut && this.pendingUtterances.length > 0) {
      const utterance = this.pendingUtterances.shift()
      if (!utterance) {
        continue
      }
      this.notifyQueueCapacityAvailable()

      try {
        logStructured({
          level: 'info',
          scope: 'main',
          event: 'streaming.groq_upload.begin',
          message: 'Starting Groq utterance upload.',
          context: {
            sessionId: this.params.sessionId,
            utteranceIndex: utterance.utteranceIndex,
            queuedUtterances: this.getQueuedUtteranceCount()
          }
        })
        this.publishDebug('info', 'streaming.groq_upload.begin', 'Starting Groq utterance upload.', {
          utteranceIndex: utterance.utteranceIndex,
          queuedUtterances: this.getQueuedUtteranceCount()
        })
        const response = await this.uploadUtterance(utterance)
        if (this.stopUploadTimedOut) {
          return
        }
        logStructured({
          level: 'info',
          scope: 'main',
          event: 'streaming.groq_upload.completed',
          message: 'Completed Groq utterance upload.',
          context: {
            sessionId: this.params.sessionId,
            utteranceIndex: utterance.utteranceIndex
          }
        })
        this.publishDebug('info', 'streaming.groq_upload.completed', 'Completed Groq utterance upload.', {
          utteranceIndex: utterance.utteranceIndex
        })
        this.completedUtterances.push({
          utteranceIndex: utterance.utteranceIndex,
          hadCarryover: utterance.hadCarryover,
          startedAtEpochMs: utterance.startedAtEpochMs,
          endedAtEpochMs: utterance.endedAtEpochMs,
          response
        })
        this.ensureEmitPump()
      } catch (error) {
        if (isAbortError(error) && this.stopped) {
          return
        }
        this.pendingUtterances.length = 0
        this.publishDebug('error', 'streaming.groq_upload.failed', 'Groq utterance upload failed.', {
          utteranceIndex: utterance.utteranceIndex,
          message: error instanceof Error ? error.message : String(error)
        })
        await this.params.callbacks.onFailure({
          code: 'groq_chunk_upload_failed',
          message: error instanceof Error ? error.message : String(error)
        })
        return
      }
    }
  }

  private ensureEmitPump(): void {
    if (this.emitPumpPromise) {
      return
    }

    logStructured({
      level: 'info',
      scope: 'main',
      event: 'streaming.groq_upload.emit_begin',
      message: 'Starting Groq completed-utterance drain.',
      context: {
        sessionId: this.params.sessionId,
        queuedCompletedUtterances: this.completedUtterances.length
      }
    })
    this.publishDebug('info', 'streaming.groq_upload.emit_begin', 'Starting Groq completed-utterance drain.', {
      queuedCompletedUtterances: this.completedUtterances.length
    })
    this.emitPumpPromise = this.drainCompletedUtterances()
      .finally(() => {
        this.emitPumpPromise = null
        if (this.completedUtterances.length > 0) {
          this.ensureEmitPump()
        }
      })
  }

  private async drainCompletedUtterances(): Promise<void> {
    while (this.completedUtterances.length > 0) {
      const utterance = this.completedUtterances.shift()
      if (!utterance) {
        continue
      }
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'streaming.groq_upload.emit_utterance',
        message: 'Draining one completed Groq utterance.',
        context: {
          sessionId: this.params.sessionId,
          utteranceIndex: utterance.utteranceIndex,
          remainingCompletedUtterances: this.completedUtterances.length
        }
      })
      this.publishDebug('info', 'streaming.groq_upload.emit_utterance', 'Draining one completed Groq utterance.', {
        utteranceIndex: utterance.utteranceIndex,
        remainingCompletedUtterances: this.completedUtterances.length
      })
      this.activeEmit = true
      this.notifyQueueCapacityAvailable()

      try {
        await this.emitCompletedUtterance(utterance)
      } catch (error) {
        this.pendingUtterances.length = 0
        this.completedUtterances.length = 0
        this.notifyQueueCapacityAvailable()
        this.publishDebug('error', 'streaming.groq_upload.commit_failed', 'Groq utterance final segment commit failed.', {
          utteranceIndex: utterance.utteranceIndex,
          message: error instanceof Error ? error.message : String(error)
        })
        await this.params.callbacks.onFailure({
          code: 'groq_final_segment_commit_failed',
          message: error instanceof Error ? error.message : String(error)
        })
        return
      } finally {
        this.activeEmit = false
        this.notifyQueueCapacityAvailable()
      }
    }
  }

  private async uploadUtterance(utterance: PendingUtteranceUpload): Promise<GroqVerboseResponse> {
    const endpoint = resolveProviderEndpoint(
      GROQ_DEFAULT_BASE,
      GROQ_STT_PATH,
      this.params.config.baseUrlOverride ?? null
    )
    const apiKey = this.requireApiKey()
    const uploadRequestTimeoutMs = this.chunkWindowPolicy.uploadRequestTimeoutMs ?? 15_000

    try {
      let attempt = 0
      while (true) {
        attempt += 1
        const abortController = new AbortController()
        this.activeAbortController = abortController
        const formData = new FormData()
        formData.append('model', this.params.config.model)
        formData.append('file', utterance.body, `streaming-utterance-${utterance.utteranceIndex}.wav`)
        formData.append('response_format', 'verbose_json')
        formData.append('timestamp_granularities[]', 'segment')

        const language = resolveTranscriptionLanguageOverride(this.params.config.language ?? 'auto')
        if (language) {
          formData.append('language', language)
        }

        let uploadTimedOut = false
        const timeoutHandle = setTimeout(() => {
          uploadTimedOut = true
          abortController.abort()
        }, uploadRequestTimeoutMs)

        try {
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

          return (await response.json()) as GroqVerboseResponse
        } catch (error) {
          if (uploadTimedOut) {
            logStructured({
              level: 'warn',
              scope: 'main',
              event: 'streaming.groq_upload.request_timed_out',
              message: 'Groq utterance upload timed out before the provider responded.',
              context: {
                sessionId: this.params.sessionId,
                utteranceIndex: utterance.utteranceIndex,
                timeoutMs: uploadRequestTimeoutMs,
                attempt
              }
            })
            this.publishDebug('warn', 'streaming.groq_upload.request_timed_out', 'Groq utterance upload timed out before the provider responded.', {
              utteranceIndex: utterance.utteranceIndex,
              timeoutMs: uploadRequestTimeoutMs,
              attempt
            })
            if (attempt <= this.chunkWindowPolicy.maxRetryCount) {
              await this.delayMs(this.chunkWindowPolicy.retryBackoffMs)
              continue
            }
            throw new Error(`Groq rolling upload timed out after ${uploadRequestTimeoutMs} ms.`)
          }
          throw error
        } finally {
          if (this.activeAbortController === abortController) {
            this.activeAbortController = null
          }
          clearTimeout(timeoutHandle)
        }
      }
    } finally {
      this.notifyQueueCapacityAvailable()
    }
  }

  private async emitCompletedUtterance(utterance: CompletedUtteranceUpload): Promise<void> {
    const normalized = normalizeGroqUtteranceText(utterance)
    if (!normalized) {
      logStructured({
        level: 'warn',
        scope: 'main',
        event: 'streaming.groq_upload.empty_transcript',
        message: 'Groq returned no usable transcript text for an utterance.',
        context: {
          sessionId: this.params.sessionId,
          utteranceIndex: utterance.utteranceIndex,
          topLevelTextLength: utterance.response.text?.trim().length ?? 0,
          segmentCount: utterance.response.segments?.length ?? 0
        }
      })
      this.publishDebug('warn', 'streaming.groq_upload.empty_transcript', 'Groq returned no usable transcript text for an utterance.', {
        utteranceIndex: utterance.utteranceIndex,
        topLevelTextLength: utterance.response.text?.trim().length ?? 0,
        segmentCount: utterance.response.segments?.length ?? 0
      })
      return
    }

    let text = normalized.text
    if (utterance.hadCarryover) {
      text = trimOverlappingPrefix(text, this.lastCommittedTextTail)
    }
    if (text.length === 0) {
      logStructured({
        level: 'warn',
        scope: 'main',
        event: 'streaming.groq_upload.text_dropped_after_overlap',
        message: 'Dropped Groq utterance text after overlap trimming removed all remaining text.',
        context: {
          sessionId: this.params.sessionId,
          utteranceIndex: utterance.utteranceIndex,
          hadCarryover: utterance.hadCarryover,
          previousTailLength: this.lastCommittedTextTail.length
        }
      })
      this.publishDebug('warn', 'streaming.groq_upload.text_dropped_after_overlap', 'Dropped Groq utterance text after overlap trimming removed all remaining text.', {
        utteranceIndex: utterance.utteranceIndex,
        hadCarryover: utterance.hadCarryover,
        previousTailLength: this.lastCommittedTextTail.length
      })
      return
    }

    await this.emitFinalSegment({
      text,
      startedAtEpochMs: normalized.startedAtEpochMs,
      endedAtEpochMs: normalized.endedAtEpochMs
    })
    this.rememberCommittedText(text, normalized.endedAtEpochMs)
  }

  private async emitFinalSegment(params: {
    text: string
    startedAtEpochMs: number
    endedAtEpochMs: number
  }): Promise<void> {
    const sequence = this.nextSequence
    this.nextSequence += 1
    const segment = {
      sessionId: this.params.sessionId,
      sequence,
      text: params.text,
      startedAt: new Date(params.startedAtEpochMs).toISOString(),
      endedAt: new Date(params.endedAtEpochMs).toISOString()
    }
    logStructured({
      level: 'info',
      scope: 'main',
      event: 'streaming.groq_upload.final_segment',
      message: 'Emitting committed Groq final segment.',
      context: {
        sessionId: this.params.sessionId,
        sequence,
        textLength: params.text.length,
        startedAtEpochMs: params.startedAtEpochMs,
        endedAtEpochMs: params.endedAtEpochMs
      }
    })
    this.publishDebug('info', 'streaming.groq_upload.final_segment', 'Emitting committed Groq final segment.', {
      sequence,
      textLength: params.text.length,
      startedAtEpochMs: params.startedAtEpochMs,
      endedAtEpochMs: params.endedAtEpochMs
    })
    await this.params.callbacks.onFinalSegment(segment)
  }

  private rememberCommittedText(text: string, endedAtEpochMs: number): void {
    this.lastCommittedEndedAtEpochMs = Math.max(this.lastCommittedEndedAtEpochMs, endedAtEpochMs)
    const nextTail = `${this.lastCommittedTextTail} ${text}`.trim()
    this.lastCommittedTextTail = nextTail.slice(-160)
  }

  private async finishStopDrain(): Promise<void> {
    await this.queuePumpPromise
    await this.emitPumpPromise
  }

  private requireApiKey(): string {
    const apiKey = this.secretStore.getApiKey('groq')
    if (!apiKey) {
      throw new Error('Groq rolling upload requires a saved Groq API key.')
    }
    return apiKey
  }

  private abortOutstandingUploads(): void {
    this.activeAbortController?.abort()
    this.activeAbortController = null
  }

  private clearPendingStopBuffers(): void {
    this.pendingUtterances.length = 0
    this.completedUtterances.length = 0
    this.notifyQueueCapacityAvailable()
  }

  private getQueuedUtteranceCount(): number {
    return (
      this.pendingUtterances.length +
      this.completedUtterances.length +
      (this.activeAbortController ? 1 : 0) +
      (this.activeEmit ? 1 : 0)
    )
  }

  private async waitForQueueCapacity(utteranceIndex: number): Promise<void> {
    if (this.stopped) {
      throw new Error('Groq rolling upload runtime is already stopped.')
    }

    let didLogWait = false
    while (this.getQueuedUtteranceCount() >= this.chunkWindowPolicy.maxQueuedUtterances) {
      if (this.rendererStopPrepared) {
        return
      }
      if (!didLogWait) {
        didLogWait = true
        logStructured({
          level: 'warn',
          scope: 'main',
          event: 'streaming.groq_upload.backpressure_wait_begin',
          message: 'Groq upload queue is full; waiting before accepting another utterance.',
          context: {
            sessionId: this.params.sessionId,
            utteranceIndex,
            queuedUtterances: this.getQueuedUtteranceCount(),
            maxQueuedUtterances: this.chunkWindowPolicy.maxQueuedUtterances
          }
        })
      }

      await new Promise<void>((resolve) => {
        this.queueCapacityWaiters.add(resolve)
      })

      if (this.stopped) {
        throw new Error('Groq rolling upload runtime is already stopped.')
      }
    }

    if (didLogWait) {
      logStructured({
        level: 'info',
        scope: 'main',
        event: 'streaming.groq_upload.backpressure_wait_end',
        message: 'Groq upload queue drained enough to accept another utterance.',
        context: {
          sessionId: this.params.sessionId,
          utteranceIndex,
          queuedUtterances: this.getQueuedUtteranceCount(),
          maxQueuedUtterances: this.chunkWindowPolicy.maxQueuedUtterances
        }
      })
    }
  }

  private notifyQueueCapacityAvailable(): void {
    if (!this.rendererStopPrepared && this.getQueuedUtteranceCount() >= this.chunkWindowPolicy.maxQueuedUtterances) {
      return
    }
    for (const resolve of this.queueCapacityWaiters) {
      resolve()
    }
    this.queueCapacityWaiters.clear()
  }

  private publishDebug(
    level: 'info' | 'warn' | 'error',
    event: string,
    message: string,
    context: Record<string, unknown>
  ): void {
    void this.params.callbacks.onDebug?.({
      sessionId: this.params.sessionId,
      level,
      event,
      message,
      context
    })
  }
}

const normalizeGroqUtteranceText = (utterance: CompletedUtteranceUpload): NormalizedGroqUtteranceText | null => {
  const topLevelText = utterance.response.text?.trim() ?? ''
  if (topLevelText.length > 0) {
    return {
      text: topLevelText,
      startedAtEpochMs: utterance.startedAtEpochMs,
      endedAtEpochMs: utterance.endedAtEpochMs
    }
  }

  const usableSegments = (utterance.response.segments ?? []).filter((segment) =>
    typeof segment.start === 'number' &&
    typeof segment.end === 'number' &&
    typeof segment.text === 'string' &&
    segment.text.trim().length > 0
  )

  if (usableSegments.length === 0) {
    return null
  }

  return {
    text: usableSegments.map((segment) => segment.text!.trim()).join(' ').trim(),
    startedAtEpochMs: utterance.startedAtEpochMs + Math.round((usableSegments[0]?.start ?? 0) * 1000),
    endedAtEpochMs: utterance.startedAtEpochMs + Math.round((usableSegments.at(-1)?.end ?? 0) * 1000)
  }
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
