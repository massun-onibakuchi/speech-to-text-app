import { describe, expect, it, vi } from 'vitest'
import { NetworkCompatibilityService } from './network-compatibility-service'

describe('NetworkCompatibilityService', () => {
  it('marks Groq reachable on auth-required responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const service = new NetworkCompatibilityService(fetchImpl as any)

    const result = await service.diagnoseGroqConnectivity()
    expect(result.reachable).toBe(true)
    expect(result.provider).toBe('groq')
  })

  it('returns split-tunnel guidance on fetch failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const service = new NetworkCompatibilityService(fetchImpl as any)

    const result = await service.diagnoseGroqConnectivity()
    expect(result.reachable).toBe(false)
    expect(result.guidance).toContain('api.groq.com')
  })
})
