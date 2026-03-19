// Where: Renderer helpers for Home action cards.
// What: Resolve blocked reason text, next-step guidance, and optional settings deep-link hints.
// Why: Keep disabled-control messaging consistent and testable for Phase 5C UI behavior.

import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot } from '../shared/ipc'
import { isCloudSttProvider, isLocalSttProvider } from '../shared/local-stt'
import {
  LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_MESSAGE,
  LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_NEXT_STEP
} from '../shared/local-streaming-messages'

export interface BlockedControlMessage {
  reason: string
  nextStep: string
  deepLinkTarget: 'settings' | null
}

export const isLocalTransformedOutputRecordingBlocked = (settings: Settings): boolean =>
  isLocalSttProvider(settings.transcription.provider) && settings.output.selectedTextSource === 'transformed'

export const isTransformedOutputRecordingBlocked = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): boolean =>
  !isLocalSttProvider(settings.transcription.provider) &&
  settings.output.selectedTextSource === 'transformed' &&
  !apiKeyStatus.google

export const resolveRecordingBlockedMessage = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): BlockedControlMessage | null => {
  const provider = settings.transcription.provider
  if (isCloudSttProvider(provider) && !apiKeyStatus[provider]) {
    return {
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > Speech-to-Text and save a key or switch provider.',
      deepLinkTarget: 'settings'
    }
  }

  if (isLocalTransformedOutputRecordingBlocked(settings)) {
    return {
      reason: 'Recording is blocked.',
      nextStep: LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_NEXT_STEP,
      deepLinkTarget: 'settings'
    }
  }

  if (isTransformedOutputRecordingBlocked(settings, apiKeyStatus)) {
    return {
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > LLM Transformation and save a Google key, or switch output mode to Transcript.',
      deepLinkTarget: 'settings'
    }
  }

  return null
}

export { LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_MESSAGE }

export const resolveTransformBlockedMessage = (
  _settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): BlockedControlMessage | null => {
  if (!apiKeyStatus.google) {
    return {
      reason: 'Transformation is blocked because the Google API key is missing.',
      nextStep: 'Open Settings > LLM Transformation and save a Google key.',
      deepLinkTarget: 'settings'
    }
  }
  return null
}
