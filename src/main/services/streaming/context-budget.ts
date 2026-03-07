/*
Where: src/main/services/streaming/context-budget.ts
What: Deterministic truncation rules for transformed-stream context payloads.
Why: PR-9 needs an implementation-grade budgeting contract before any execution
     lane can safely send `segment + window + summary` into a transform adapter.
*/

import type { TransformationContextPayload } from '../transformation/types'

export interface TransformationContextBudgetConfig {
  maxTotalUtf8Bytes: number
  maxRollingSummaryUtf8Bytes: number
  maxWindowSegments: number
}

const encoder = new TextEncoder()

const utf8ByteLength = (value: string): number => encoder.encode(value).length

const truncateUtf8 = (value: string, maxUtf8Bytes: number): string => {
  if (maxUtf8Bytes <= 0) {
    return ''
  }
  if (utf8ByteLength(value) <= maxUtf8Bytes) {
    return value
  }

  let end = value.length
  while (end > 0 && utf8ByteLength(value.slice(0, end)) > maxUtf8Bytes) {
    end -= 1
  }
  return value.slice(0, end).trimEnd()
}

export const estimateTransformationContextUtf8Bytes = (payload: TransformationContextPayload): number => {
  const metadataBytes = utf8ByteLength(
    `${payload.version}:${payload.metadata.sessionId}:${payload.metadata.language}:${payload.metadata.currentSequence}`
  )
  const currentSegmentBytes = utf8ByteLength(payload.currentSegment.text)
  const windowBytes = payload.recentWindow.reduce((total, segment) => total + utf8ByteLength(segment.text), 0)
  const summaryBytes = utf8ByteLength(payload.rollingSummary.text)
  return metadataBytes + currentSegmentBytes + windowBytes + summaryBytes
}

export const applyTransformationContextBudget = (
  payload: TransformationContextPayload,
  config: TransformationContextBudgetConfig
): TransformationContextPayload => {
  let recentWindow = payload.recentWindow.slice(-config.maxWindowSegments)
  let rollingSummaryText = truncateUtf8(payload.rollingSummary.text, config.maxRollingSummaryUtf8Bytes)

  let candidate: TransformationContextPayload = {
    ...payload,
    recentWindow,
    rollingSummary: {
      ...payload.rollingSummary,
      text: rollingSummaryText
    }
  }

  if (estimateTransformationContextUtf8Bytes(candidate) <= config.maxTotalUtf8Bytes) {
    return candidate
  }

  const currentSummaryBytes = utf8ByteLength(rollingSummaryText)
  if (currentSummaryBytes > 0) {
    const overflow = estimateTransformationContextUtf8Bytes(candidate) - config.maxTotalUtf8Bytes
    rollingSummaryText = truncateUtf8(rollingSummaryText, Math.max(0, currentSummaryBytes - overflow))
    candidate = {
      ...candidate,
      rollingSummary: {
        ...candidate.rollingSummary,
        text: rollingSummaryText
      }
    }
  }

  while (estimateTransformationContextUtf8Bytes(candidate) > config.maxTotalUtf8Bytes && recentWindow.length > 0) {
    recentWindow = recentWindow.slice(1)
    candidate = {
      ...candidate,
      recentWindow
    }
  }

  return candidate
}
