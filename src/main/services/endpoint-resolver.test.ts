// Where: src/main/services/endpoint-resolver.test.ts
// What:  Tests for shared URL validation and endpoint resolution.
// Why:   Ensures SSRF-safe URL handling across all adapters.

import { describe, expect, it } from 'vitest'
import { resolveProviderEndpoint, validateBaseUrlOverride } from './endpoint-resolver'

describe('validateBaseUrlOverride', () => {
  it.each([null, undefined, '', '   ', '\t\n'])(
    'returns null for empty-ish input: %j',
    (input) => {
      expect(validateBaseUrlOverride(input as string | null | undefined)).toBeNull()
    }
  )

  it('returns origin for a valid https URL', () => {
    expect(validateBaseUrlOverride('https://proxy.example.com')).toBe('https://proxy.example.com')
  })

  it('returns origin for a valid http URL', () => {
    expect(validateBaseUrlOverride('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('strips trailing slashes via origin', () => {
    expect(validateBaseUrlOverride('https://proxy.example.com/')).toBe('https://proxy.example.com')
  })

  it('strips paths, queries, and fragments', () => {
    expect(validateBaseUrlOverride('https://proxy.example.com/v1/api?key=val#section')).toBe(
      'https://proxy.example.com'
    )
  })

  it('preserves non-default port', () => {
    expect(validateBaseUrlOverride('https://proxy.example.com:8443')).toBe(
      'https://proxy.example.com:8443'
    )
  })

  it.each(['ftp://bad.com', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi'])(
    'throws for disallowed protocol: %s',
    (input) => {
      expect(() => validateBaseUrlOverride(input)).toThrow(/protocol/i)
    }
  )

  it.each(['not a url', '://missing-protocol', 'ht!tp://bad'])(
    'throws for malformed URL: %s',
    (input) => {
      expect(() => validateBaseUrlOverride(input)).toThrow(/invalid baseUrlOverride/i)
    }
  )
})

describe('resolveProviderEndpoint', () => {
  const DEFAULT_BASE = 'https://api.example.com'
  const PATH = '/v1/transcribe'

  it('combines default base and path when no override', () => {
    expect(resolveProviderEndpoint(DEFAULT_BASE, PATH)).toBe('https://api.example.com/v1/transcribe')
  })

  it('uses override base when provided', () => {
    expect(resolveProviderEndpoint(DEFAULT_BASE, PATH, 'https://proxy.local')).toBe(
      'https://proxy.local/v1/transcribe'
    )
  })

  it('falls back to default when override is null', () => {
    expect(resolveProviderEndpoint(DEFAULT_BASE, PATH, null)).toBe(
      'https://api.example.com/v1/transcribe'
    )
  })

  it('falls back to default when override is empty string', () => {
    expect(resolveProviderEndpoint(DEFAULT_BASE, PATH, '')).toBe(
      'https://api.example.com/v1/transcribe'
    )
  })

  it('falls back to default when override is whitespace-only', () => {
    expect(resolveProviderEndpoint(DEFAULT_BASE, PATH, '   ')).toBe(
      'https://api.example.com/v1/transcribe'
    )
  })

  it('URI-encodes path parameters', () => {
    const result = resolveProviderEndpoint(
      DEFAULT_BASE,
      '/v1/models/{model}:generate',
      null,
      { model: 'model/with/slashes' }
    )
    expect(result).toBe('https://api.example.com/v1/models/model%2Fwith%2Fslashes:generate')
  })

  it('handles multiple path parameters', () => {
    const result = resolveProviderEndpoint(
      DEFAULT_BASE,
      '/v1/{provider}/models/{model}',
      null,
      { provider: 'google', model: 'gemini-2.5-flash' }
    )
    expect(result).toBe('https://api.example.com/v1/google/models/gemini-2.5-flash')
  })

  it('propagates validation error for invalid override', () => {
    expect(() => resolveProviderEndpoint(DEFAULT_BASE, PATH, 'ftp://bad.com')).toThrow(/protocol/i)
  })
})
