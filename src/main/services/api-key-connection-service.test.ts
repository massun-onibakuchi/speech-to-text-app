import { describe, expect, it, vi } from 'vitest'
import { ApiKeyConnectionService } from './api-key-connection-service'

describe('ApiKeyConnectionService', () => {
  it('returns provider-specific invalid-key message', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('groq', 'bad-key')
    expect(result).toEqual({
      provider: 'groq',
      status: 'failed',
      message: 'Groq API key is invalid or unauthorized.'
    })
  })

  it('returns provider-specific success message', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('google', 'good-key')
    expect(result).toEqual({
      provider: 'google',
      status: 'success',
      message: 'Google API key is valid.'
    })
  })

  it('returns missing-key failure without network call', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('elevenlabs', '')
    expect(result.status).toBe('failed')
    expect(result.message).toContain('missing')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns provider-specific fallback status message', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('groq', 'server-error-key')
    expect(result).toEqual({
      provider: 'groq',
      status: 'failed',
      message: 'Groq connection failed with status 500.'
    })
  })

  it('returns elevenlabs unauthorized message', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('elevenlabs', 'bad-key')
    expect(result).toEqual({
      provider: 'elevenlabs',
      status: 'failed',
      message: 'ElevenLabs API key is invalid or unauthorized.'
    })
  })

  it('returns google fallback status message', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429 }))
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('google', 'rate-limited')
    expect(result).toEqual({
      provider: 'google',
      status: 'failed',
      message: 'Google connection failed with status 429.'
    })
  })

  it('returns network failure message when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    const service = new ApiKeyConnectionService(fetchImpl as any)

    const result = await service.testConnection('google', 'any-key')
    expect(result).toEqual({
      provider: 'google',
      status: 'failed',
      message: 'Connection test failed: socket hang up'
    })
  })
})
