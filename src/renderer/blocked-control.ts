// Where: Renderer helpers for Home action cards.
// What: Resolve blocked reason text, next-step guidance, and optional settings deep-link hints.
// Why: Keep disabled-control messaging consistent and testable for Phase 5C UI behavior.

import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot } from '../shared/ipc'

export interface BlockedControlMessage {
  reason: string
  nextStep: string
  deepLinkTarget: 'settings' | null
}

export const isTransformedOutputRecordingBlocked = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): boolean => settings.output.selectedTextSource === 'transformed' && !apiKeyStatus.google

export const resolveRecordingBlockedMessage = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): BlockedControlMessage | null => {
  const provider = settings.transcription.provider
  if (!apiKeyStatus[provider]) {
    return {
      reason: 'Recording is blocked.',
      nextStep: 'Open Settings > Speech-to-Text and save a key or switch provider.',
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

export const resolveTransformBlockedMessage = (
  settings: Settings,
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
