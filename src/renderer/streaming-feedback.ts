/*
Where: src/renderer/streaming-feedback.ts
What: Message formatters for renderer-visible streaming session, segment, and error events.
Why: Keep PR-8 user-facing copy deterministic without bloating renderer-app.tsx.
*/

import type {
  StreamingErrorEvent,
  StreamingSegmentEvent,
  StreamingSessionStateSnapshot
} from '../shared/ipc'
import { STREAMING_PROVIDER_LABELS } from './streaming-settings'

const providerLabel = (snapshot: StreamingSessionStateSnapshot): string =>
  snapshot.provider ? STREAMING_PROVIDER_LABELS[snapshot.provider] : 'Streaming provider'

export const formatStreamingSessionMessage = (snapshot: StreamingSessionStateSnapshot): string | null => {
  if (snapshot.state === 'idle') {
    return null
  }
  if (snapshot.state === 'starting') {
    return `Streaming session starting with ${providerLabel(snapshot)}.`
  }
  if (snapshot.state === 'active') {
    return `Streaming session active with ${providerLabel(snapshot)}.`
  }
  if (snapshot.state === 'stopping') {
    if (snapshot.reason === 'user_cancel') {
      return 'Streaming session cancelling.'
    }
    return 'Streaming session stopping.'
  }
  if (snapshot.state === 'ended') {
    if (snapshot.reason === 'provider_end') {
      return 'Streaming session ended from the provider side.'
    }
    if (snapshot.reason === 'user_cancel') {
      return 'Streaming session cancelled.'
    }
    return 'Streaming session stopped.'
  }
  return 'Streaming session failed.'
}

export const formatStreamingSegmentMessage = (segment: StreamingSegmentEvent): string =>
  `Streamed text: ${segment.text}`

export const formatStreamingErrorMessage = (error: StreamingErrorEvent): string =>
  `Streaming error (${error.code}): ${error.message}`
