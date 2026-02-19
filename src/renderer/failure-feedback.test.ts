// Where: src/renderer/failure-feedback.test.ts
// What:  Unit tests for actionable failure feedback formatting.
// Why:   Lock Phase 6 error mapping guidance for preflight/auth/network categories.

import { describe, expect, it } from 'vitest'
import { formatFailureFeedback } from './failure-feedback'

describe('formatFailureFeedback', () => {
  it('adds preflight next-step guidance', () => {
    const text = formatFailureFeedback({
      terminalStatus: 'transcription_failed',
      failureCategory: 'preflight',
      failureDetail: 'Missing Groq API key.'
    })
    expect(text).toContain('Missing Groq API key.')
    expect(text).toContain('Open Settings and verify provider, model, and API key')
  })

  it('adds API auth guidance with provider context', () => {
    const text = formatFailureFeedback({
      terminalStatus: 'transcription_failed',
      failureCategory: 'api_auth',
      failureDetail: 'Groq transcription failed with status 401'
    })
    expect(text).toContain('Groq request failed.')
    expect(text).toContain('Update the API key and retry')
  })

  it('adds network guidance for network-category failures', () => {
    const text = formatFailureFeedback({
      terminalStatus: 'transcription_failed',
      failureCategory: 'network',
      failureDetail: 'fetch failed: getaddrinfo ENOTFOUND api.groq.com'
    })
    expect(text).toContain('Check network/VPN and endpoint reachability')
  })
})
