// Where: Main process service layer.
// What: Broadcasts structured local streaming session and segment activity to renderer windows.
// Why: Ticket 7 needs one main-owned publication path so raw chunk output state stays debuggable in
//      the Activity tab without pushing session bookkeeping back into the renderer.

import { BrowserWindow } from 'electron'
import type { LocalStreamingSegmentSnapshot, LocalStreamingSessionState } from '../../shared/domain'
import { IPC_CHANNELS, type LocalStreamingActivityEvent } from '../../shared/ipc'

type BrowserWindowLike = Pick<BrowserWindow, 'webContents'>

const cloneSegment = (segment: LocalStreamingSegmentSnapshot): LocalStreamingSegmentSnapshot =>
  structuredClone(segment)

const cloneSession = (session: LocalStreamingSessionState): LocalStreamingSessionState =>
  structuredClone(session)

export class StreamingActivityPublisher {
  private readonly getWindows: () => readonly BrowserWindowLike[]
  private readonly segmentsBySession = new Map<string, Map<number, LocalStreamingSegmentSnapshot>>()

  constructor(options?: {
    getWindows?: () => readonly BrowserWindowLike[]
  }) {
    this.getWindows = options?.getWindows ?? (() => BrowserWindow.getAllWindows())
  }

  publishSessionState(session: LocalStreamingSessionState): void {
    this.broadcast({
      kind: 'session',
      session: cloneSession(session)
    })
  }

  publishFinalizedSegment(sessionId: string, sequence: number, sourceText: string): void {
    const segment: LocalStreamingSegmentSnapshot = {
      sessionId,
      sequence,
      state: 'finalized',
      sourceText,
      transformedText: null,
      error: null
    }
    this.publishSegment(segment)
  }

  publishOutputCommitted(sessionId: string, sequence: number): void {
    const previous = this.requireSegment(sessionId, sequence)
    this.publishSegment({
      ...previous,
      state: 'output_committed',
      error: null
    })
  }

  publishTransformedSegment(sessionId: string, sequence: number, transformedText: string): void {
    const previous = this.requireSegment(sessionId, sequence)
    this.publishSegment({
      ...previous,
      state: 'transformed',
      transformedText,
      error: null
    })
  }

  publishSegmentFailure(sessionId: string, sequence: number, error: string): void {
    const previous = this.requireSegment(sessionId, sequence)
    this.publishSegment({
      ...previous,
      state: 'failed',
      error
    })
  }

  clearSession(sessionId: string): void {
    this.segmentsBySession.delete(sessionId)
  }

  private requireSegment(sessionId: string, sequence: number): LocalStreamingSegmentSnapshot {
    const segment = this.segmentsBySession.get(sessionId)?.get(sequence)
    if (!segment) {
      throw new Error(`Missing local streaming segment ${sessionId}:${sequence}.`)
    }
    return segment
  }

  private publishSegment(segment: LocalStreamingSegmentSnapshot): void {
    const clonedSegment = cloneSegment(segment)
    let sessionSegments = this.segmentsBySession.get(segment.sessionId)
    if (!sessionSegments) {
      sessionSegments = new Map<number, LocalStreamingSegmentSnapshot>()
      this.segmentsBySession.set(segment.sessionId, sessionSegments)
    }
    sessionSegments.set(segment.sequence, clonedSegment)
    this.broadcast({
      kind: 'segment',
      segment: clonedSegment
    })
  }

  private broadcast(event: LocalStreamingActivityEvent): void {
    for (const window of this.getWindows()) {
      window.webContents.send(IPC_CHANNELS.onLocalStreamingActivity, event)
    }
  }
}
