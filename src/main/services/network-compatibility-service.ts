export interface NetworkDiagnostic {
  reachable: boolean
  provider: 'groq'
  endpoint: string
  message: string
  guidance?: string
}

export class NetworkCompatibilityService {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch
  }

  async diagnoseGroqConnectivity(): Promise<NetworkDiagnostic> {
    const endpoint = 'https://api.groq.com'

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'GET'
      })

      if (response.ok || response.status === 401 || response.status === 403) {
        return {
          reachable: true,
          provider: 'groq',
          endpoint,
          message: 'Groq endpoint is reachable.'
        }
      }

      return {
        reachable: false,
        provider: 'groq',
        endpoint,
        message: `Groq endpoint returned status ${response.status}.`,
        guidance: 'If using VPN, configure split-tunnel allow for api.groq.com and retry.'
      }
    } catch {
      return {
        reachable: false,
        provider: 'groq',
        endpoint,
        message: 'Failed to reach Groq endpoint.',
        guidance: 'If using VPN, configure split-tunnel allow for api.groq.com and retry.'
      }
    }
  }
}
