// src/main/routing/capture-request-snapshot.ts
// Immutable settings snapshot bound at capture finalization time.
// Carries all configuration needed to process one capture job end-to-end.
// Must be frozen: concurrent settings changes must not affect in-flight snapshots.
// Designed with Phase 3B concurrent shortcut isolation in mind.

import type {
  DictionaryEntry,
  OutputSettings,
  SttModel,
  SttProvider,
  TransformModel,
  TransformProvider
} from '../../shared/domain'
import type { CleanupSettings } from '../../shared/local-llm'

/** Frozen copy of the transformation profile bound at capture time. */
export interface TransformationProfileSnapshot {
  readonly profileId: string
  readonly provider: TransformProvider
  readonly model: TransformModel
  readonly baseUrlOverride: string | null
  readonly systemPrompt: string
  readonly userPrompt: string
}

/**
 * Immutable snapshot of all configuration needed to process one capture.
 * Created at capture finalization; frozen to prevent mutation during processing.
 */
export interface CaptureRequestSnapshot {
  readonly snapshotId: string
  readonly capturedAt: string
  readonly audioFilePath: string

  // STT configuration at capture time
  readonly sttProvider: SttProvider
  readonly sttModel: SttModel
  readonly sttBaseUrlOverride: string | null
  readonly outputLanguage: string
  readonly temperature: number
  readonly sttHints: {
    readonly contextText: string
    readonly dictionaryTerms: readonly string[]
  }
  readonly correctionDictionaryEntries: readonly DictionaryEntry[]
  readonly cleanup: Readonly<CleanupSettings>

  // Transformation configuration (null when transformation is disabled or no default profile)
  readonly transformationProfile: TransformationProfileSnapshot | null

  // Output rules at capture time
  readonly output: Readonly<OutputSettings>
}

/** Deep-clones and recursively freezes a CaptureRequestSnapshot. */
export const createCaptureRequestSnapshot = (
  params: CaptureRequestSnapshot
): Readonly<CaptureRequestSnapshot> => deepFreeze(structuredClone(params))

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
