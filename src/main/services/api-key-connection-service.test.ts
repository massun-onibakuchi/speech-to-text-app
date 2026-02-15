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
})
