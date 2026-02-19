// Where: src/shared/error-logging.test.ts
// What:  Unit tests for structured logging + redaction behavior.
// Why:   Prevent secret leakage while keeping logs actionable.

import { describe, expect, it, vi } from 'vitest'
import { buildStructuredLogEntry, logStructured } from './error-logging'

describe('error-logging', () => {
  it('redacts sensitive keys and inline token-like values from context', () => {
    const entry = buildStructuredLogEntry({
      level: 'error',
      scope: 'main',
      event: 'test.redaction',
      context: {
        provider: 'groq',
        apiKey: 'sk-live-123456789',
        nested: {
          authorization: 'Bearer abcdefghijklmnop',
          note: 'token=abcd1234'
        }
      }
    })

    const serialized = JSON.stringify(entry)
    expect(serialized).not.toContain('sk-live-123456789')
    expect(serialized).not.toContain('Bearer abcdefghijklmnop')
    expect(serialized).not.toContain('abcd1234')
    expect(serialized).toContain('[REDACTED]')
  })

  it('redacts error message content before emitting', () => {
    const error = new Error('Upstream failed: api_key=secret-value')
    const entry = buildStructuredLogEntry({
      level: 'error',
      scope: 'renderer',
      event: 'test.error',
      error
    })

    expect(entry.error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('[REDACTED]')
      })
    )
    expect(JSON.stringify(entry.error)).not.toContain('secret-value')
  })

  it('routes output to console.error for error level logs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logStructured({
      level: 'error',
      scope: 'main',
      event: 'pipeline.failed',
      message: 'apiKey=abc'
    })
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toContain('[REDACTED]')
    spy.mockRestore()
  })

  it('keeps error class name in structured output for diagnosis', () => {
    class ApiAuthError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'ApiAuthError'
      }
    }

    const entry = buildStructuredLogEntry({
      level: 'error',
      scope: 'main',
      event: 'adapter.auth_failed',
      error: new ApiAuthError('status 401')
    })

    expect(entry.error).toEqual(
      expect.objectContaining({
        name: 'ApiAuthError',
        message: 'status 401'
      })
    )
  })
})
