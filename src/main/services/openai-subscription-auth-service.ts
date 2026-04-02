/*
Where: src/main/services/openai-subscription-auth-service.ts
What: Browser OAuth + encrypted session storage for the ChatGPT-subscription provider.
Why: OpenAI subscription auth is not an API-key flow, so it needs a provider-scoped
     credential lifecycle with PKCE, refresh-token persistence, and account-id support.
*/

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { URLSearchParams } from 'node:url'
import { shell } from 'electron'
import { SafeStorageClient } from '../infrastructure/safe-storage-client'

const AUTH_STORAGE_ACCOUNT = 'openai-subscription.oauth'
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ISSUER = 'https://auth.openai.com'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const CALLBACK_HOST = '127.0.0.1'

interface TokenResponse {
  id_token?: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

interface OpenAiSubscriptionStoredSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  accountId: string | null
}

interface PkceCodes {
  verifier: string
  challenge: string
}

interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string
  }
}

export interface OpenAiSubscriptionCredential {
  accessToken: string
  accountId: string | null
}

export class OpenAiSubscriptionAuthService {
  private readonly safeStorageClient: SafeStorageClient
  private volatileSession: string | null = null

  constructor(safeStorageClient?: SafeStorageClient) {
    this.safeStorageClient = safeStorageClient ?? new SafeStorageClient()
  }

  hasStoredSession(): boolean {
    return this.readStoredSession() !== null
  }

  clearSession(): void {
    this.writeStoredSession(null)
  }

  async connectWithBrowserOAuth(): Promise<void> {
    const pkce = generatePkce()
    const state = generateState()
    const callback = await this.startLoopbackCallbackServer(pkce, state)
    const authorizeUrl = buildAuthorizeUrl(callback.redirectUri, pkce, state)

    await shell.openExternal(authorizeUrl)
    const tokens = await callback.waitForTokens()
    const accountId = extractAccountId(tokens)
    this.writeStoredSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      accountId: accountId ?? null
    })
  }

  async getCredential(): Promise<OpenAiSubscriptionCredential | null> {
    const session = this.readStoredSession()
    if (!session) {
      return null
    }

    if (session.expiresAt > Date.now()) {
      return {
        accessToken: session.accessToken,
        accountId: session.accountId
      }
    }

    try {
      const refreshedTokens = await refreshAccessToken(session.refreshToken)
      const refreshedSession: OpenAiSubscriptionStoredSession = {
        accessToken: refreshedTokens.access_token,
        refreshToken: refreshedTokens.refresh_token || session.refreshToken,
        expiresAt: Date.now() + (refreshedTokens.expires_in ?? 3600) * 1000,
        accountId: extractAccountId(refreshedTokens) ?? session.accountId
      }
      this.writeStoredSession(refreshedSession)
      return {
        accessToken: refreshedSession.accessToken,
        accountId: refreshedSession.accountId
      }
    } catch (error) {
      this.clearSession()
      throw error
    }
  }

  private readStoredSession(): OpenAiSubscriptionStoredSession | null {
    const serialized = this.readSecret(AUTH_STORAGE_ACCOUNT)
    if (!serialized) {
      return null
    }

    try {
      return JSON.parse(serialized) as OpenAiSubscriptionStoredSession
    } catch {
      this.writeStoredSession(null)
      return null
    }
  }

  private writeStoredSession(session: OpenAiSubscriptionStoredSession | null): void {
    this.writeSecret(AUTH_STORAGE_ACCOUNT, session ? JSON.stringify(session) : '')
  }

  private readSecret(account: string): string | null {
    if (this.safeStorageClient.isAvailable()) {
      const value = this.safeStorageClient.getPassword(account)
      return value && value.length > 0 ? value : null
    }

    return account === AUTH_STORAGE_ACCOUNT && this.volatileSession && this.volatileSession.length > 0
      ? this.volatileSession
      : null
  }

  private writeSecret(account: string, value: string): void {
    if (this.safeStorageClient.isAvailable()) {
      this.safeStorageClient.setPassword(account, value)
      return
    }

    if (account === AUTH_STORAGE_ACCOUNT) {
      this.volatileSession = value
    }
  }

  private async startLoopbackCallbackServer(pkce: PkceCodes, expectedState: string): Promise<{
    redirectUri: string
    waitForTokens: () => Promise<TokenResponse>
  }> {
    let server: Server | null = null
    let settled = false
    let redirectUri = ''
    let resolvePromise: ((tokens: TokenResponse) => void) | null = null
    let rejectPromise: ((error: Error) => void) | null = null
    const tokenPromise = new Promise<TokenResponse>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })

    const finishWithError = (
      error: Error,
      responseWriter?: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void }
    ): void => {
      if (settled) {
        return
      }
      settled = true
      responseWriter?.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      responseWriter?.end(`<title>Authorization Failed</title><p>${escapeHtml(error.message)}</p>`)
      rejectPromise?.(error)
      server?.close()
    }

    server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://${CALLBACK_HOST}`)
      if (requestUrl.pathname !== '/auth/callback') {
        res.writeHead(404).end('Not found')
        return
      }

      const error = requestUrl.searchParams.get('error')
      const errorDescription = requestUrl.searchParams.get('error_description')
      if (error) {
        finishWithError(new Error(errorDescription || error), res)
        return
      }

      const code = requestUrl.searchParams.get('code')
      const state = requestUrl.searchParams.get('state')
      if (!code) {
        finishWithError(new Error('Missing authorization code.'), res)
        return
      }
      if (state !== expectedState) {
        finishWithError(new Error('Invalid OAuth state.'), res)
        return
      }

      void exchangeCodeForTokens(code, redirectUri, pkce)
        .then((tokens) => {
          if (settled) {
            return
          }
          settled = true
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<title>Authorization Successful</title><p>Authorization complete. You can close this window.</p>')
          resolvePromise?.(tokens)
          server?.close()
        })
        .catch((exchangeError) => {
          finishWithError(exchangeError instanceof Error ? exchangeError : new Error(String(exchangeError)), res)
        })
    })

    const address = await new Promise<{ port: number }>((resolve, reject) => {
      server.listen(0, CALLBACK_HOST, () => {
        const currentAddress = server?.address()
        if (!currentAddress || typeof currentAddress === 'string') {
          reject(new Error('Failed to start OAuth callback server.'))
          return
        }
        resolve({ port: currentAddress.port })
      })
      server.on('error', reject)
    })
    redirectUri = `http://${CALLBACK_HOST}:${address.port}/auth/callback`

    const timeout = setTimeout(() => {
      finishWithError(new Error('OAuth callback timeout.'))
    }, OAUTH_TIMEOUT_MS)

    return {
      redirectUri,
      waitForTokens: async () => {
        try {
          return await tokenPromise
        } finally {
          clearTimeout(timeout)
        }
      }
    }
  }
}

const generatePkce = (): PkceCodes => {
  const verifier = base64UrlEncode(randomBytes(48))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

const generateState = (): string => base64UrlEncode(randomBytes(32))

const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const buildAuthorizeUrl = (redirectUri: string, pkce: PkceCodes, state: string): string => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'dicta'
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

const exchangeCodeForTokens = async (code: string, redirectUri: string, pkce: PkceCodes): Promise<TokenResponse> => {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier
    }).toString()
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}.`)
  }

  return (await response.json()) as TokenResponse
}

const refreshAccessToken = async (refreshToken: string): Promise<TokenResponse> => {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID
    }).toString()
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}.`)
  }

  return (await response.json()) as TokenResponse
}

const parseJwtClaims = (token: string): IdTokenClaims | undefined => {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return undefined
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as IdTokenClaims
  } catch {
    return undefined
  }
}

const extractAccountIdFromClaims = (claims: IdTokenClaims): string | undefined =>
  claims.chatgpt_account_id || claims['https://api.openai.com/auth']?.chatgpt_account_id || claims.organizations?.[0]?.id

const extractAccountId = (tokens: TokenResponse): string | undefined => {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    if (claims) {
      const accountId = extractAccountIdFromClaims(claims)
      if (accountId) {
        return accountId
      }
    }
  }

  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token)
    if (claims) {
      return extractAccountIdFromClaims(claims)
    }
  }

  return undefined
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
