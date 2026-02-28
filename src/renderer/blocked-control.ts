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

export const resolveRecordingBlockedMessage = (
  settings: Settings,
  apiKeyStatus: ApiKeyStatusSnapshot
): BlockedControlMessage | null => {
  const provider = settings.transcription.provider
  if (apiKeyStatus[provider]) {
    return null
  }
  if (provider === 'groq') {
    return {
      reason: 'Recording is blocked because the Groq API key is missing.',
      nextStep: 'Open Settings > Speech-to-Text and save a Groq key.',
      deepLinkTarget: 'settings'
    }
  }
  return {
    reason: 'Recording is blocked because the ElevenLabs API key is missing.',
    nextStep: 'Open Settings > Speech-to-Text and save an ElevenLabs key.',
    deepLinkTarget: 'settings'
  }
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
