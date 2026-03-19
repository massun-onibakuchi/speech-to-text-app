/**
 * Where: src/main/ipc/local-streaming-session-bridge.ts
 * What: Ticket-5 in-memory IPC bridge for renderer PCM session lifecycle calls.
 * Why: Establish the stable start/append/stop/cancel contract now, while Ticket 6 later replaces
 *        this bridge with the real session controller and runtime websocket client.
 */

import { randomUUID } from 'node:crypto'
import type {
  LocalStreamingAudioAppendPayload,
  LocalStreamingSessionControlPayload,
  LocalStreamingSessionStartPayload,
  LocalStreamingSessionStartResult
} from '../../shared/ipc'

export interface LocalStreamingSessionBridgeOptions {
  onSessionStarted?: () => void
  onSessionEnded?: () => void
}

type ActiveLocalStreamingSession = {
  sessionId: string
  startedAt: string
  sampleRateHz: number
  channelCount: number
  appendedBatchCount: number
  appendedSampleCount: number
}

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`)
  }
}

export class LocalStreamingSessionBridge {
  private readonly onSessionStarted?: () => void
  private readonly onSessionEnded?: () => void
  private activeSession: ActiveLocalStreamingSession | null = null

  constructor(options: LocalStreamingSessionBridgeOptions = {}) {
    this.onSessionStarted = options.onSessionStarted
    this.onSessionEnded = options.onSessionEnded
  }

  startSession(payload: LocalStreamingSessionStartPayload): LocalStreamingSessionStartResult {
    if (this.activeSession) {
      throw new Error('A local streaming session is already active.')
    }

    assertPositiveInteger(payload.sampleRateHz, 'sampleRateHz')
    assertPositiveInteger(payload.channelCount, 'channelCount')

    const sessionId = randomUUID()
    this.activeSession = {
      sessionId,
      startedAt: payload.startedAt,
      sampleRateHz: payload.sampleRateHz,
      channelCount: payload.channelCount,
      appendedBatchCount: 0,
      appendedSampleCount: 0
    }
    this.onSessionStarted?.()
    return { sessionId }
  }

  appendAudio(payload: LocalStreamingAudioAppendPayload): void {
    const active = this.requireActiveSession(payload.sessionId)
    if (payload.pcmFrames.length === 0) {
      throw new Error('pcmFrames must not be empty.')
    }
    active.appendedBatchCount += 1
    active.appendedSampleCount += payload.pcmFrames.length
  }

  stopSession(payload: LocalStreamingSessionControlPayload): void {
    this.endSession(payload.sessionId)
  }

  cancelSession(payload: LocalStreamingSessionControlPayload): void {
    this.endSession(payload.sessionId)
  }

  private endSession(sessionId: string): void {
    if (!this.activeSession) {
      return
    }
    if (this.activeSession.sessionId !== sessionId) {
      throw new Error(`Local streaming session ${sessionId} is not active.`)
    }
    this.activeSession = null
    this.onSessionEnded?.()
  }

  getActiveSession(): Readonly<ActiveLocalStreamingSession> | null {
    return this.activeSession ? { ...this.activeSession } : null
  }

  private requireActiveSession(sessionId: string): ActiveLocalStreamingSession {
    if (!this.activeSession) {
      throw new Error('No local streaming session is active.')
    }
    if (this.activeSession.sessionId !== sessionId) {
      throw new Error(`Local streaming session ${sessionId} is not active.`)
    }
    return this.activeSession
  }
}
