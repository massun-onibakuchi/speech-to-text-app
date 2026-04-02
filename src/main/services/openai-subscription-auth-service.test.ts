import { describe, expect, it, vi, afterEach } from 'vitest'
import { request } from 'node:http'

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn<(authorizeUrl: string) => Promise<void>>(async () => {})
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock
  }
}))

import { OpenAiSubscriptionAuthService } from './openai-subscription-auth-service'

const buildJwt = (claims: Record<string, unknown>): string => {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`
}

describe('OpenAiSubscriptionAuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('stores a browser OAuth session after the callback completes', async () => {
    const stored = new Map<string, string>()
    const service = new OpenAiSubscriptionAuthService({
      isAvailable: () => true,
      setPassword: (account: string, value: string) => {
        stored.set(account, value)
      },
      getPassword: (account: string) => stored.get(account) ?? null
    } as any)
    const idToken = buildJwt({ chatgpt_account_id: 'acct_browser' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access_browser',
          refresh_token: 'refresh_browser',
          id_token: idToken,
          expires_in: 3600
        })
      })) as any
    )

    openExternalMock.mockImplementationOnce(async (authorizeUrl) => {
      const parsed = new URL(authorizeUrl)
      const redirectUri = parsed.searchParams.get('redirect_uri')!
      const state = parsed.searchParams.get('state')!
      setTimeout(() => {
        const callbackUrl = new URL(redirectUri)
        callbackUrl.searchParams.set('code', 'auth-code')
        callbackUrl.searchParams.set('state', state)
        const req = request(callbackUrl, { method: 'GET' })
        req.end()
      }, 10)
    })

    await service.connectWithBrowserOAuth()

    expect(service.hasStoredSession()).toBe(true)
    await expect(service.getCredential()).resolves.toEqual({
      accessToken: 'access_browser',
      accountId: 'acct_browser'
    })
  })

  it('refreshes an expired session before returning credentials', async () => {
    const stored = new Map<string, string>()
    stored.set(
      'openai-subscription.oauth',
      JSON.stringify({
        accessToken: 'stale_access',
        refreshToken: 'refresh_123',
        expiresAt: Date.now() - 1000,
        accountId: 'acct_old'
      })
    )
    const service = new OpenAiSubscriptionAuthService({
      isAvailable: () => true,
      setPassword: (account: string, value: string) => {
        stored.set(account, value)
      },
      getPassword: (account: string) => stored.get(account) ?? null
    } as any)
    const refreshedAccessToken = buildJwt({ chatgpt_account_id: 'acct_new' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: refreshedAccessToken,
          refresh_token: 'refresh_456',
          expires_in: 7200
        })
      })) as any
    )

    await expect(service.getCredential()).resolves.toEqual({
      accessToken: refreshedAccessToken,
      accountId: 'acct_new'
    })
    expect(JSON.parse(stored.get('openai-subscription.oauth') ?? '{}')).toMatchObject({
      refreshToken: 'refresh_456',
      accountId: 'acct_new'
    })
  })

  it('clears the stored session when refresh fails', async () => {
    const stored = new Map<string, string>()
    stored.set(
      'openai-subscription.oauth',
      JSON.stringify({
        accessToken: 'stale_access',
        refreshToken: 'refresh_123',
        expiresAt: Date.now() - 1000,
        accountId: 'acct_old'
      })
    )
    const service = new OpenAiSubscriptionAuthService({
      isAvailable: () => true,
      setPassword: (account: string, value: string) => {
        stored.set(account, value)
      },
      getPassword: (account: string) => stored.get(account) ?? null
    } as any)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401
      })) as any
    )

    await expect(service.getCredential()).rejects.toThrow('Token refresh failed with status 401.')
    expect(service.hasStoredSession()).toBe(false)
  })
})
