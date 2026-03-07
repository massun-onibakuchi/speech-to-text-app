import { INPUT_PLACEHOLDER, validateSafeUserPromptTemplate } from '../../../shared/prompt-template-safety'
import type { TransformationContextPayload } from './types'
export { INPUT_PLACEHOLDER }

export interface PromptFormatInput {
  sourceText: string
  userPrompt: string
  contextPayload?: TransformationContextPayload
}

const applyUserPromptTemplate = (sourceText: string, userPrompt: string): string => {
  const trimmedUserPrompt = userPrompt.trim()
  const safetyError = validateSafeUserPromptTemplate(trimmedUserPrompt)
  if (safetyError) {
    throw new Error(`Unsafe user prompt template: ${safetyError}`)
  }

  return trimmedUserPrompt.replace(INPUT_PLACEHOLDER, escapeXmlText(sourceText))
}

const escapeXmlText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const serializeContextSegment = (
  tagName: 'current_segment' | 'window_segment',
  segment: TransformationContextPayload['currentSegment']
): string =>
  `<${tagName} sequence="${segment.sequence}" started_at="${segment.startedAt}" ended_at="${segment.endedAt}">${escapeXmlText(segment.text)}</${tagName}>`

export const serializeTransformationContextPayload = (payload: TransformationContextPayload): string => {
  const metadataBlock =
    `<metadata session_id="${payload.metadata.sessionId}" language="${payload.metadata.language}" current_sequence="${payload.metadata.currentSequence}" />`
  const currentSegmentBlock = serializeContextSegment('current_segment', payload.currentSegment)
  const windowBlock = payload.recentWindow.length > 0
    ? payload.recentWindow.map((segment) => serializeContextSegment('window_segment', segment)).join('\n')
    : '<window_segment_list />'
  const summaryBlock =
    `<rolling_summary refreshed_at="${payload.rollingSummary.refreshedAt ?? ''}" source_through_sequence="${payload.rollingSummary.sourceThroughSequence ?? ''}">${escapeXmlText(payload.rollingSummary.text)}</rolling_summary>`

  return [
    `<transformation_context version="${payload.version}">`,
    metadataBlock,
    currentSegmentBlock,
    '<recent_window>',
    windowBlock,
    '</recent_window>',
    summaryBlock,
    '</transformation_context>'
  ].join('\n')
}

export const buildPromptBlocks = (input: PromptFormatInput): string[] => {
  const userPromptBlock = applyUserPromptTemplate(input.sourceText, input.userPrompt)
  if (!input.contextPayload) {
    return [userPromptBlock]
  }

  return [
    serializeTransformationContextPayload(input.contextPayload),
    userPromptBlock
  ]
}
