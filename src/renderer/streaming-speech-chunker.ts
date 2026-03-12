/*
Where: src/renderer/streaming-speech-chunker.ts
What: Renderer-local speech/pause boundary helper for streaming capture.
Why: Keep pause-bounded chunk policy deterministic and testable without tying it
     to browser audio graph APIs or provider-specific streaming adapters.
*/

import type { StreamingAudioFrame } from '../shared/ipc'

export interface StreamingSpeechChunkerOptions {
  speechRmsThreshold?: number
  trailingSilenceMs?: number
  minSpeechMs?: number
  maxChunkMs?: number
}

export interface StreamingSpeechChunkObservation {
  shouldFlush: boolean
  shouldDiscardPending: boolean
  reason: 'speech_pause' | 'max_chunk' | null
}

export const DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS = {
  speechRmsThreshold: 0.015,
  trailingSilenceMs: 550,
  minSpeechMs: 160,
  maxChunkMs: 12_000
} as const

export class StreamingSpeechChunker {
  private readonly speechRmsThreshold: number
  private readonly trailingSilenceMs: number
  private readonly minSpeechMs: number
  private readonly maxChunkMs: number
  private chunkStartedAtMs: number | null = null
  private lastSpeechAtMs: number | null = null
  private hasSpeech = false

  constructor(options: StreamingSpeechChunkerOptions = {}) {
    this.speechRmsThreshold = options.speechRmsThreshold ?? DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.speechRmsThreshold
    this.trailingSilenceMs = options.trailingSilenceMs ?? DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.trailingSilenceMs
    this.minSpeechMs = options.minSpeechMs ?? DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.minSpeechMs
    this.maxChunkMs = options.maxChunkMs ?? DEFAULT_STREAMING_SPEECH_CHUNKER_OPTIONS.maxChunkMs
  }

  observeFrame(frame: StreamingAudioFrame, sampleRateHz: number): StreamingSpeechChunkObservation {
    const frameDurationMs = sampleRateHz > 0 ? (frame.samples.length / sampleRateHz) * 1000 : 0
    const frameEndMs = frame.timestampMs + frameDurationMs
    const isSpeech = this.computeRms(frame.samples) >= this.speechRmsThreshold

    if (isSpeech) {
      if (this.chunkStartedAtMs === null) {
        this.chunkStartedAtMs = frame.timestampMs
      }
      this.lastSpeechAtMs = frameEndMs
      this.hasSpeech = true
    }

    if (this.chunkStartedAtMs === null || !this.hasSpeech) {
      return { shouldFlush: false, shouldDiscardPending: false, reason: null }
    }

    const spokenMs = this.lastSpeechAtMs !== null ? this.lastSpeechAtMs - this.chunkStartedAtMs : 0

    if (frameEndMs - this.chunkStartedAtMs >= this.maxChunkMs) {
      if (spokenMs < this.minSpeechMs) {
        this.reset()
        return { shouldFlush: false, shouldDiscardPending: true, reason: null }
      }
      this.reset()
      return { shouldFlush: true, shouldDiscardPending: false, reason: 'max_chunk' }
    }

    if (!isSpeech && this.lastSpeechAtMs !== null) {
      const trailingSilenceMs = frameEndMs - this.lastSpeechAtMs
      if (trailingSilenceMs >= this.trailingSilenceMs && spokenMs >= this.minSpeechMs) {
        this.reset()
        return { shouldFlush: true, shouldDiscardPending: false, reason: 'speech_pause' }
      }
      if (trailingSilenceMs >= this.trailingSilenceMs && spokenMs < this.minSpeechMs) {
        // Short below-threshold blips should not keep the chunk armed across a
        // long silence, or later unrelated speech gets merged incorrectly.
        this.reset()
        return { shouldFlush: false, shouldDiscardPending: true, reason: null }
      }
    }

    return { shouldFlush: false, shouldDiscardPending: false, reason: null }
  }

  reset(): void {
    this.chunkStartedAtMs = null
    this.lastSpeechAtMs = null
    this.hasSpeech = false
  }

  private computeRms(samples: Float32Array): number {
    if (samples.length === 0) {
      return 0
    }

    let total = 0
    for (const sample of samples) {
      total += sample * sample
    }
    return Math.sqrt(total / samples.length)
  }
}
