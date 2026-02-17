// Where: src/main/orchestrators/preflight-guard.test.ts
// What:  Tests for preflight guards and adapter error classification.
// Why:   Phase 2B requires pre-network vs post-network error paths
//        to be distinguishable (spec 5.2).

import { describe, expect, it, vi } from 'vitest'
import { checkSttPreflight, checkLlmPreflight, classifyAdapterError } from './preflight-guard'

describe('checkSttPreflight', () => {
  it('returns ok when STT API key is present', () => {
    const secretStore = { getApiKey: vi.fn(() => 'valid-key') }
    const result = checkSttPreflight(secretStore, 'groq')

    expect(result).toEqual({ ok: true })
    expect(secretStore.getApiKey).toHaveBeenCalledWith('groq')
  })

  it('returns blocked with actionable message when STT API key is missing', () => {
    const secretStore = { getApiKey: vi.fn(() => null) }
    const result = checkSttPreflight(secretStore, 'groq')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('groq')
      expect(result.reason).toContain('API key')
      expect(result.reason).toContain('Settings')
    }
  })

  it('returns blocked for elevenlabs when key is missing', () => {
    const secretStore = { getApiKey: vi.fn(() => null) }
    const result = checkSttPreflight(secretStore, 'elevenlabs')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('elevenlabs')
    }
  })
})

describe('checkLlmPreflight', () => {
  it('returns ok when LLM API key is present', () => {
    const secretStore = { getApiKey: vi.fn(() => 'valid-key') }
    const result = checkLlmPreflight(secretStore, 'google')

    expect(result).toEqual({ ok: true })
    expect(secretStore.getApiKey).toHaveBeenCalledWith('google')
  })

  it('returns blocked with actionable message when LLM API key is missing', () => {
    const secretStore = { getApiKey: vi.fn(() => null) }
    const result = checkLlmPreflight(secretStore, 'google')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('google')
      expect(result.reason).toContain('API key')
      expect(result.reason).toContain('Settings')
    }
  })
})

describe('classifyAdapterError', () => {
  it('classifies HTTP 401 as api_auth', () => {
    const error = new Error('Groq transcription failed with status 401')
    expect(classifyAdapterError(error)).toBe('api_auth')
  })

  it('classifies HTTP 403 as api_auth', () => {
    const error = new Error('ElevenLabs transcription failed with status 403')
    expect(classifyAdapterError(error)).toBe('api_auth')
  })

  it('classifies ENOTFOUND as network', () => {
    const error = new Error('fetch failed: getaddrinfo ENOTFOUND api.groq.com')
    expect(classifyAdapterError(error)).toBe('network')
  })

  it('classifies ECONNREFUSED as network', () => {
    const error = new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:443')
    expect(classifyAdapterError(error)).toBe('network')
  })

  it('classifies TLS errors as network', () => {
    const error = new Error('TLS certificate validation failed')
    expect(classifyAdapterError(error)).toBe('network')
  })

  it('classifies timeout as network', () => {
    const error = new Error('request timed out after 30000ms')
    expect(classifyAdapterError(error)).toBe('network')
  })

  it('classifies generic errors as unknown', () => {
    const error = new Error('gemini failure: unexpected response format')
    expect(classifyAdapterError(error)).toBe('unknown')
  })

  it('handles non-Error values gracefully', () => {
    expect(classifyAdapterError('string error')).toBe('unknown')
    expect(classifyAdapterError(42)).toBe('unknown')
    expect(classifyAdapterError(null)).toBe('unknown')
  })
})
