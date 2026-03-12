/*
Where: src/renderer/vad-mic-debug-utils.ts
What: Small helpers for the live mic VAD harness event log and utterance summaries.
Why: Keep the manual-debug page readable and keep its non-browser logic unit-testable.
*/

import type { StreamingAudioUtteranceChunk } from '../shared/ipc'
import type { GroqBrowserVadConfig } from './groq-browser-vad-config'
import type { GroqBrowserVadDebugEvent } from './groq-browser-vad-capture'

export const MAX_VAD_DEBUG_EVENTS = 250

export interface VadHarnessUtteranceSummary {
  utteranceIndex: number
  reason: StreamingAudioUtteranceChunk['reason']
  startedAtEpochMs: number
  endedAtEpochMs: number
  durationMs: number
  wavBytes: number
}

export type VadHarnessConfigDraft = Record<
  'positiveSpeechThreshold' | 'negativeSpeechThreshold' | 'redemptionMs' | 'preSpeechPadMs' | 'minSpeechMs' | 'backpressureSignalMs',
  string
>

export const appendVadDebugEvent = (
  events: readonly GroqBrowserVadDebugEvent[],
  nextEvent: GroqBrowserVadDebugEvent,
  maxEvents = MAX_VAD_DEBUG_EVENTS
): GroqBrowserVadDebugEvent[] => {
  const appended = [...events, nextEvent]
  if (appended.length <= maxEvents) {
    return appended
  }
  return appended.slice(appended.length - maxEvents)
}

export const summarizeVadUtterance = (
  chunk: Omit<StreamingAudioUtteranceChunk, 'sessionId'>
): VadHarnessUtteranceSummary => ({
  utteranceIndex: chunk.utteranceIndex,
  reason: chunk.reason,
  startedAtEpochMs: chunk.startedAtEpochMs,
  endedAtEpochMs: chunk.endedAtEpochMs,
  durationMs: Math.max(0, chunk.endedAtEpochMs - chunk.startedAtEpochMs),
  wavBytes: chunk.wavBytes.byteLength
})

const parseFiniteNumber = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const parseVadHarnessConfigDraft = (
  draft: VadHarnessConfigDraft
): { config: Partial<GroqBrowserVadConfig>; error: string | null } => {
  const positiveSpeechThreshold = parseFiniteNumber(draft.positiveSpeechThreshold)
  const negativeSpeechThreshold = parseFiniteNumber(draft.negativeSpeechThreshold)
  const redemptionMs = parseFiniteNumber(draft.redemptionMs)
  const preSpeechPadMs = parseFiniteNumber(draft.preSpeechPadMs)
  const minSpeechMs = parseFiniteNumber(draft.minSpeechMs)
  const backpressureSignalMs = parseFiniteNumber(draft.backpressureSignalMs)

  if (
    positiveSpeechThreshold === null ||
    negativeSpeechThreshold === null ||
    redemptionMs === null ||
    preSpeechPadMs === null ||
    minSpeechMs === null ||
    backpressureSignalMs === null
  ) {
    return {
      config: {},
      error: 'MicVAD config fields must be valid numbers.'
    }
  }

  if (
    positiveSpeechThreshold < 0 ||
    positiveSpeechThreshold > 1 ||
    negativeSpeechThreshold < 0 ||
    negativeSpeechThreshold > 1
  ) {
    return {
      config: {},
      error: 'Speech thresholds must stay between 0 and 1.'
    }
  }

  if (
    redemptionMs < 0 ||
    preSpeechPadMs < 0 ||
    minSpeechMs < 0 ||
    backpressureSignalMs < 0
  ) {
    return {
      config: {},
      error: 'Timing fields must be zero or greater.'
    }
  }

  return {
    config: {
      positiveSpeechThreshold,
      negativeSpeechThreshold,
      redemptionMs,
      preSpeechPadMs,
      minSpeechMs,
      backpressureSignalMs
    },
    error: null
  }
}

const formatRounded = (value: number): string => value.toFixed(3).replace(/\.?0+$/, '')

export const describeVadDebugEvent = (event: GroqBrowserVadDebugEvent): string => {
  switch (event.type) {
    case 'frame_processed':
      return `frame isSpeech=${formatRounded(event.isSpeech)} notSpeech=${formatRounded(event.notSpeech)} samples=${event.frameSamples}`
    case 'speech_start':
      return `speech start (utterance ${event.utteranceIndex})`
    case 'speech_real_start':
      return `speech real start (utterance ${event.utteranceIndex})`
    case 'vad_misfire':
      return `vad misfire (utterance ${event.utteranceIndex})`
    case 'vad_misfire_salvaged':
      return `vad misfire salvaged samples=${event.audioSamples} speechyFrames=${event.speechyFrameCount} peakIsSpeech=${formatRounded(event.peakIsSpeech)} (utterance ${event.utteranceIndex})`
    case 'speech_end':
      return `speech end ${event.reason} samples=${event.audioSamples} (utterance ${event.utteranceIndex})`
    case 'utterance_chunk':
      return `chunk ${event.reason} samples=${event.audioSamples} durationMs=${Math.round(event.durationMs)} (utterance ${event.utteranceIndex})`
    case 'utterance_sent':
      return `sent ${event.reason} (utterance ${event.utteranceIndex})`
    case 'post_seal_window_summary':
      return `post-seal source=${event.sourceUtteranceIndex} next=${event.nextUtteranceIndex} frames=${event.frameCount} maxIsSpeech=${event.maxIsSpeech ?? 'n/a'} lastIsSpeech=${event.lastIsSpeech ?? 'n/a'} endedBy=${event.endedBy}`
    case 'stop_begin':
      return `stop begin ${event.reason}`
    case 'stop_complete':
      return `stop complete ${event.reason}`
    case 'backpressure_pause':
      return `backpressure pause after ${event.signalAfterMs}ms`
    case 'backpressure_resume':
      return `backpressure resume duration=${event.durationMs ?? 0}ms`
    case 'fatal_error':
      return `fatal error ${event.message}`
  }
}
