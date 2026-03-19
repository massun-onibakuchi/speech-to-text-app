// Where: Renderer helper module.
// What: Maps structured main-process local streaming activity events into Activity tab cards.
// Why: Ticket 7 keeps session/chunk state ownership in main while letting the renderer upsert readable
//      per-chunk activity without growing renderer-app.tsx further.

import type { LocalStreamingSegmentSnapshot, LocalStreamingSessionState } from '../shared/domain'
import type { LocalStreamingActivityEvent } from '../shared/ipc'
import { type ActivityItem, upsertActivityItem } from './activity-feed'

export interface ApplyLocalStreamingActivityResult {
  activity: ActivityItem[]
  nextActivityId: number
}

const buildSegmentStableKey = (segment: LocalStreamingSegmentSnapshot): string =>
  `local-streaming:segment:${segment.sessionId}:${segment.sequence}`

const buildSessionStableKey = (session: LocalStreamingSessionState): string =>
  `local-streaming:session:${session.sessionId}:terminal`

const formatChunkLabel = (sequence: number): string => `Chunk ${sequence + 1}`

const formatSegmentMessage = (segment: LocalStreamingSegmentSnapshot): string => {
  const chunkPrefix = `${formatChunkLabel(segment.sequence)}:`
  const normalizedSourceText = segment.sourceText.trim()
  const sourceChunkText = normalizedSourceText.length > 0
    ? `${chunkPrefix} ${normalizedSourceText}`
    : `${chunkPrefix} (empty finalized text)`
  const normalizedTransformedText = segment.transformedText?.trim() ?? ''
  const transformedChunkText = normalizedTransformedText.length > 0
    ? `${chunkPrefix} ${normalizedTransformedText} (raw: ${normalizedSourceText.length > 0 ? normalizedSourceText : '(empty finalized text)'})`
    : sourceChunkText

  if (segment.state === 'failed' && segment.error) {
    return `${transformedChunkText} [${segment.error}]`
  }
  return segment.state === 'transformed' || segment.state === 'output_committed'
    ? transformedChunkText
    : sourceChunkText
}

const resolveSegmentTone = (segment: LocalStreamingSegmentSnapshot): ActivityItem['tone'] => {
  if (segment.state === 'output_committed') {
    return 'success'
  }
  if (segment.state === 'failed') {
    return 'error'
  }
  return 'info'
}

const formatTerminalMessage = (session: LocalStreamingSessionState): string => {
  const terminal = session.terminal
  if (!terminal) {
    return 'Local streaming session is active.'
  }

  switch (terminal.status) {
    case 'completed':
      return 'Local streaming session completed.'
    case 'cancelled':
      return 'Local streaming session cancelled.'
    default:
      return terminal.detail
        ? `Local streaming failed: ${terminal.detail}`
        : 'Local streaming failed unexpectedly.'
  }
}

const resolveTerminalTone = (session: LocalStreamingSessionState): ActivityItem['tone'] => {
  const status = session.terminal?.status
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'cancelled') {
    return 'info'
  }
  return 'error'
}

const buildActivityItem = (
  nextActivityId: number,
  stableKey: string,
  message: string,
  tone: ActivityItem['tone'],
  createdAt: string
): ActivityItem => ({
  id: nextActivityId,
  stableKey,
  message,
  tone,
  createdAt
})

export const applyLocalStreamingActivityEvent = (
  activity: ActivityItem[],
  nextActivityId: number,
  event: LocalStreamingActivityEvent,
  createdAt: string
): ApplyLocalStreamingActivityResult => {
  if (event.kind === 'segment') {
    return {
      activity: upsertActivityItem(
        activity,
        buildActivityItem(
          nextActivityId + 1,
          buildSegmentStableKey(event.segment),
          formatSegmentMessage(event.segment),
          resolveSegmentTone(event.segment),
          createdAt
        )
      ),
      nextActivityId: nextActivityId + 1
    }
  }

  if (!event.session.terminal) {
    return { activity, nextActivityId }
  }

  return {
    activity: upsertActivityItem(
      activity,
      buildActivityItem(
        nextActivityId + 1,
        buildSessionStableKey(event.session),
        formatTerminalMessage(event.session),
        resolveTerminalTone(event.session),
        createdAt
      )
    ),
    nextActivityId: nextActivityId + 1
  }
}
