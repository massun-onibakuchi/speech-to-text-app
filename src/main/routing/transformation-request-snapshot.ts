// src/main/routing/transformation-request-snapshot.ts
// Immutable snapshot for standalone transformation requests (shortcuts).
// Bound at shortcut invocation time to isolate from concurrent settings changes.
// sourceText is the text to transform (from clipboard or OS text selection).

import type { TransformModel, TransformProvider, OutputRule } from '../../shared/domain'

/** Where the source text for transformation came from. */
export type TransformationTextSource = 'clipboard' | 'selection'

/**
 * Immutable snapshot of all configuration needed for one transformation request.
 * Created at shortcut invocation; frozen to prevent mutation during processing.
 */
export interface TransformationRequestSnapshot {
  readonly snapshotId: string
  readonly requestedAt: string
  readonly textSource: TransformationTextSource
  readonly sourceText: string

  // Bound profile at request time
  readonly profileId: string
  readonly provider: TransformProvider
  readonly model: TransformModel
  readonly baseUrlOverride: string | null
  readonly systemPrompt: string
  readonly userPrompt: string

  // Output rule for transformed text, snapshotted at request time (spec 4.6)
  readonly outputRule: Readonly<OutputRule>
}

/** Deep-clones and recursively freezes a TransformationRequestSnapshot. */
export const createTransformationRequestSnapshot = (
  params: TransformationRequestSnapshot
): Readonly<TransformationRequestSnapshot> => deepFreeze(structuredClone(params))

/** Recursively freezes an object and all nested objects. */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj)
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  }
  return obj
}
