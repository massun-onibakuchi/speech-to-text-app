/**
 * Where: src/main/services/streaming/types.ts
 * What:  Shared runtime types for the streaming session lifecycle layer.
 * Why:   Keep the controller state machine and event publisher aligned without
 *        leaking provider/audio-ingress concerns into the PR-3 runtime slice.
 */

import type {
  StreamingErrorEvent,
  StreamingSessionState,
  StreamingSessionStateSnapshot,
  StreamingSessionStopReason
} from '../../../shared/ipc'
import type { StreamingProvider, StreamingTransportKind } from '../../../shared/domain'

export interface StreamingSessionStartConfig {
  provider: StreamingProvider
  transport: StreamingTransportKind
  model: string
}

export interface StreamingSessionRuntimeSnapshot extends StreamingSessionStateSnapshot {}

export interface StreamingSessionFailure {
  code: string
  message: string
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
