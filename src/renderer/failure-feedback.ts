// Where: src/renderer/failure-feedback.ts
// What:  Builds actionable failure text from terminal status + failure category.
// Why:   Phase 6 requires consistent, user-facing guidance for preflight/auth/network failures.

import type { FailureCategory, TerminalJobStatus } from '../shared/domain'

export interface FailureFeedbackInput {
  terminalStatus: TerminalJobStatus
  failureDetail?: string | null
  failureCategory?: FailureCategory | null
}

const normalizeFailureDetail = (input: FailureFeedbackInput): string => {
  const detail = input.failureDetail?.trim()
  if (detail && detail.length > 0) {
    return detail
  }
  return `Recording finished with status: ${input.terminalStatus.replaceAll('_', ' ')}`
}

const inferProvider = (text: string): string | null => {
  const normalized = text.toLowerCase()
  if (normalized.includes('groq')) return 'Groq'
  if (normalized.includes('elevenlabs')) return 'ElevenLabs'
  if (normalized.includes('google') || normalized.includes('gemini')) return 'Google'
  return null
}

export const formatFailureFeedback = (input: FailureFeedbackInput): string => {
  const base = normalizeFailureDetail(input)
  const provider = inferProvider(base)
  const providerContext = provider ? `${provider} request failed.` : 'Provider request failed.'

  if (input.failureCategory === 'preflight') {
    return `${base} Next step: Open Settings and verify provider, model, and API key before retrying.`
  }
  if (input.failureCategory === 'api_auth') {
    return `${base} ${providerContext} Next step: Update the API key and retry.`
  }
  if (input.failureCategory === 'network') {
    return `${base} ${providerContext} Next step: Check network/VPN and endpoint reachability, then retry.`
  }
  return base
}
