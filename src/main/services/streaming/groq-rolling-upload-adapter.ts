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
  StreamingAudioFrameBatch,
  StreamingAudioUtteranceChunk,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import { resolveTranscriptionLanguageOverride } from '../transcription/types'
import {
  DEFAULT_GROQ_CHUNK_WINDOW_POLICY,
  type ChunkWindowPolicy
} from './chunk-window-policy'
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
  reason: StreamingAudioUtteranceChunk['reason']
  body: Blob
  hadCarryover: boolean
  startedAtMs: number
  endedAtMs: number
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
  private readonly pendingUtterances: PendingUtteranceUpload[] = []
  private nextExpectedUtteranceIndex = 0
  private nextSequence = 0
  private queuePumpPromise: Promise<void> | null = null
  private activeAbortController: AbortController | null = null
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
    if (chunk.utteranceIndex !== this.nextExpectedUtteranceIndex) {
      throw new Error(`Groq rolling upload expected utteranceIndex=${this.nextExpectedUtteranceIndex}, received ${chunk.utteranceIndex}.`)
    }

    this.nextExpectedUtteranceIndex += 1
    this.pendingUtterances.push({
      utteranceIndex: chunk.utteranceIndex,
      reason: chunk.reason,
      body: new Blob([Buffer.from(chunk.wavBytes)], { type: 'audio/wav' }),
      hadCarryover: chunk.hadCarryover,
      startedAtMs: chunk.startedAtMs,
      endedAtMs: chunk.endedAtMs
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
      })
  }

  private async pumpQueue(): Promise<void> {
    while (!this.stopDrainTimedOut && this.pendingUtterances.length > 0) {
      const utterance = this.pendingUtterances.shift()
      if (!utterance) {
        continue
      }

      try {
        const response = await this.uploadUtterance(utterance)
        if (this.stopDrainTimedOut) {
          return
        }
        await this.emitCompletedUtterance(utterance, response)
      } catch (error) {
        if (isAbortError(error) && this.stopped) {
          return
        }
        this.pendingUtterances.length = 0
        await this.params.callbacks.onFailure({
          code: 'groq_chunk_upload_failed',
          message: error instanceof Error ? error.message : String(error)
        })
        return
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
    const abortController = new AbortController()
    this.activeAbortController = abortController

    try {
      let attempt = 0
      while (true) {
        attempt += 1
        const formData = new FormData()
        formData.append('model', this.params.config.model)
        formData.append('file', utterance.body, `streaming-utterance-${utterance.utteranceIndex}.wav`)
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

        return (await response.json()) as GroqVerboseResponse
      }
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null
      }
    }
  }

  private async emitCompletedUtterance(
    utterance: PendingUtteranceUpload,
    response: GroqVerboseResponse
  ): Promise<void> {
    const segments = response.segments ?? []
    if (segments.length > 0) {
      for (const segment of segments) {
        if (typeof segment.start !== 'number' || typeof segment.end !== 'number' || typeof segment.text !== 'string') {
          continue
        }

        const absoluteStartedAtMs = utterance.startedAtMs + Math.round(segment.start * 1000)
        const absoluteEndedAtMs = utterance.startedAtMs + Math.round(segment.end * 1000)
        if (absoluteEndedAtMs <= this.lastCommittedEndedAtMs) {
          continue
        }

        let text = segment.text.trim()
        if (absoluteStartedAtMs < this.lastCommittedEndedAtMs || utterance.hadCarryover) {
          text = trimOverlappingPrefix(text, this.lastCommittedTextTail)
        }
        if (this.stopDrainTimedOut) {
          return
        }
        if (text.length === 0) {
          continue
        }

        await this.emitFinalSegment({
          text,
          startedAtMs: absoluteStartedAtMs,
          endedAtMs: absoluteEndedAtMs
        })
        this.rememberCommittedText(text, absoluteEndedAtMs)
      }
      return
    }

    let text = (response.text ?? '').trim()
    if (utterance.hadCarryover) {
      text = trimOverlappingPrefix(text, this.lastCommittedTextTail)
    }
    if (text.length === 0 || this.stopDrainTimedOut) {
      return
    }

    await this.emitFinalSegment({
      text,
      startedAtMs: utterance.startedAtMs,
      endedAtMs: utterance.endedAtMs
    })
    this.rememberCommittedText(text, utterance.endedAtMs)
  }

  private async emitFinalSegment(params: {
    text: string
    startedAtMs: number
    endedAtMs: number
  }): Promise<void> {
    if (this.stopDrainTimedOut) {
      return
    }

    const sequence = this.nextSequence
    this.nextSequence += 1
    await this.params.callbacks.onFinalSegment({
      sessionId: this.params.sessionId,
      sequence,
      text: params.text,
      startedAt: new Date(params.startedAtMs).toISOString(),
      endedAt: new Date(params.endedAtMs).toISOString()
    })
  }

  private rememberCommittedText(text: string, endedAtMs: number): void {
    this.lastCommittedEndedAtMs = Math.max(this.lastCommittedEndedAtMs, endedAtMs)
    const nextTail = `${this.lastCommittedTextTail} ${text}`.trim()
    this.lastCommittedTextTail = nextTail.slice(-160)
  }

  private async finishStopDrain(): Promise<void> {
    await this.queuePumpPromise
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
