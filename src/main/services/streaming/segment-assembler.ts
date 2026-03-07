/**
 * Where: src/main/services/streaming/segment-assembler.ts
 * What:  Canonicalizes provider-final streaming segments into app-owned segments.
 * Why:   Keep delimiter policy and final-segment normalization out of provider
 *        adapters so every streaming backend inherits the same commit semantics.
 */

import type { StreamingDelimiterPolicy } from '../../../shared/domain'
import type { CanonicalFinalSegment, ProviderFinalSegmentInput } from './types'

export class SegmentAssembler {
  private readonly delimiter: string

  constructor(private readonly delimiterPolicy: StreamingDelimiterPolicy) {
    this.delimiter = resolveStreamingDelimiter(delimiterPolicy)
  }

  finalize(input: ProviderFinalSegmentInput): CanonicalFinalSegment | null {
    const sourceText = input.text.trim()
    if (sourceText.length === 0) {
      return null
    }

    return {
      sessionId: input.sessionId,
      sequence: input.sequence,
      sourceText,
      delimiter: this.delimiter,
      startedAt: input.startedAt,
      endedAt: input.endedAt
    }
  }
}

export const resolveStreamingDelimiter = (policy: StreamingDelimiterPolicy): string => {
  switch (policy.mode) {
    case 'none':
      return ''
    case 'space':
      return ' '
    case 'newline':
      return '\n'
    case 'custom':
      return policy.value ?? ''
  }
}
