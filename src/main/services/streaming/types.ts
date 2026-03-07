/**
 * Where: src/main/services/streaming/types.ts
 * What:  Shared runtime types for the streaming session lifecycle layer.
 * Why:   Keep the controller state machine and event publisher aligned without
 *        leaking provider/audio-ingress concerns into the PR-3 runtime slice.
 */

import type {
  StreamingAudioFrameBatch,
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionState,
  StreamingSessionStateSnapshot,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import type {
  StreamingDelimiterPolicy,
  StreamingLanguage,
  StreamingOutputMode,
  StreamingProvider,
  StreamingTransportKind
} from '../../../shared/domain'

export interface StreamingSessionStartConfig {
  provider: StreamingProvider
  transport: StreamingTransportKind
  model: string
  outputMode: StreamingOutputMode
  apiKeyRef?: string | null
  baseUrlOverride?: string | null
  language?: StreamingLanguage
  delimiterPolicy: StreamingDelimiterPolicy
}

export interface StreamingSessionRuntimeSnapshot extends StreamingSessionStateSnapshot {}

export interface StreamingSessionFailure {
  code: string
  message: string
}

export interface StreamingProviderRuntimeCallbacks {
  onFinalSegment: (segment: ProviderFinalSegmentInput) => Promise<void> | void
  onFailure: (failure: StreamingSessionFailure) => Promise<void> | void
}

export interface StreamingProviderRuntime {
  start: () => Promise<void>
  stop: (reason: StreamingSessionStopReason) => Promise<void>
  pushAudioFrameBatch: (batch: StreamingAudioFrameBatch) => Promise<void>
}

export type CreateStreamingProviderRuntime = (params: {
  sessionId: string
  config: StreamingSessionStartConfig
  callbacks: StreamingProviderRuntimeCallbacks
}) => StreamingProviderRuntime | null

export interface ProviderFinalSegmentInput {
  sessionId: string
  sequence: number
  text: string
  startedAt: string
  endedAt: string
}

export interface CanonicalFinalSegment {
  sessionId: string
  sequence: number
  sourceText: string
  delimiter: string
  startedAt: string
  endedAt: string
}

export const createIdleStreamingSessionSnapshot = (): StreamingSessionRuntimeSnapshot => ({
  sessionId: null,
  state: 'idle',
  provider: null,
  transport: null,
  model: null,
  reason: null
})

export const createStreamingSessionSnapshot = (params: {
  sessionId: string | null
  state: StreamingSessionState
  config: StreamingSessionStartConfig | null
  reason: StreamingSessionStopReason | null
}): StreamingSessionRuntimeSnapshot => ({
  sessionId: params.sessionId,
  state: params.state,
  provider: params.config?.provider ?? null,
  transport: params.config?.transport ?? null,
  model: params.config?.model ?? null,
  reason: params.reason
})

export const createStreamingErrorEvent = (params: {
  sessionId: string | null
  failure: StreamingSessionFailure
}): StreamingErrorEvent => ({
  sessionId: params.sessionId,
  code: params.failure.code,
  message: params.failure.message
})

export const createStreamingSegmentEvent = (segment: CanonicalFinalSegment): StreamingSegmentEvent => ({
  sessionId: segment.sessionId,
  sequence: segment.sequence,
  text: segment.sourceText,
  delimiter: segment.delimiter,
  isFinal: true,
  startedAt: segment.startedAt,
  endedAt: segment.endedAt
})
